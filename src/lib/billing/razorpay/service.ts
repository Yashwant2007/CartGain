import prisma from '@/lib/db'
import { getPlan } from '@/lib/payment'
import { captureError } from '@/lib/observability/logger'
import { track } from '@/lib/analytics/track'
import { getRazorpayConfig } from './config'
import {
  assertRazorpayPlanMatchesConfig,
  expectedRazorpayPlan,
  RazorpayPlanMismatchError,
  toPaise,
  type ExpectedRazorpayPlan,
  type RazorpayBillingPeriod,
} from './plans'
import {
  razorpayCancelSubscription,
  razorpayCreateCustomer,
  razorpayCreateSubscription,
  razorpayFetchPlan,
  razorpayFetchSubscription,
} from './client'
import { verifyRazorpayPaymentSignature } from './signature'
import { isWooCommercePlatform, mapRazorpayStatus } from '../store-subscription'

export class RazorpayBillingError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'RazorpayBillingError'
    this.code = code
    this.status = status
  }
}

type StoreRef = { id: string; userId: string; name: string; domain: string; platform: string }

function toUnixSeconds(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric)
}

function fromUnixSeconds(value: number | string | null | undefined): Date | null {
  const seconds = toUnixSeconds(value)
  return seconds ? new Date(seconds * 1000) : null
}

function periodEnd(start: Date, period: RazorpayBillingPeriod): Date {
  return new Date(start.getTime() + (period === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
}

function expectedForSubscription(subscription: any): ExpectedRazorpayPlan {
  return expectedRazorpayPlan(
    subscription.plan,
    (subscription.billingPeriod || 'monthly') as RazorpayBillingPeriod,
  )
}

function assertGatewaySubscriptionMatches(
  gateway: any,
  expected: ExpectedRazorpayPlan,
  customerId?: string | null,
  storeId?: string | null,
): void {
  const mismatches: string[] = []
  if (gateway?.plan_id && gateway.plan_id !== expected.razorpayPlanId) mismatches.push('plan')
  if (gateway?.amount !== undefined && Number(gateway.amount) !== expected.amountPaise) mismatches.push('amount')
  if (gateway?.currency && String(gateway.currency).toUpperCase() !== expected.currency) mismatches.push('currency')
  if (customerId && gateway?.customer_id && gateway.customer_id !== customerId) mismatches.push('customer')
  const noteStoreId = gateway?.notes?.cartgain_store_id
  if (storeId && noteStoreId && noteStoreId !== storeId) mismatches.push('store')
  if (mismatches.length) {
    throw new RazorpayBillingError(
      'RAZORPAY_SUBSCRIPTION_MISMATCH',
      `Razorpay subscription does not match the server-side plan (${mismatches.join(', ')}).`,
      409,
    )
  }
}

function checkoutResponse(params: {
  storeId: string
  subscriptionId: string
  expected: ExpectedRazorpayPlan
  email?: string | null
  name?: string | null
  scheduled?: boolean
  effectiveAt?: Date | null
}) {
  const plan = getPlan(params.expected.planId)
  const suffix = params.scheduled && params.effectiveAt
    ? ` starting ${params.effectiveAt.toLocaleDateString('en-IN')}`
    : ''
  return {
    provider: 'razorpay',
    keyId: getRazorpayConfig().keyId,
    subscriptionId: params.subscriptionId,
    plan: params.expected.planId,
    period: params.expected.period,
    amount: params.expected.amount,
    amountPaise: params.expected.amountPaise,
    currency: params.expected.currency,
    name: `CartGain ${plan.name}`,
    description: `CartGain ${plan.name} — ${params.expected.period} billing${suffix}`,
    prefill: { email: params.email || undefined, name: params.name || undefined },
    storeId: params.storeId,
    ...(params.scheduled ? { scheduled: true, effectiveAt: params.effectiveAt?.toISOString() || null } : {}),
  }
}

async function upsertPaidSubscriptionInvoice(params: {
  subscription: any
  amount: number
  currency: string
  start: Date
  end: Date
  paymentId?: string | null
  occurredAt: Date
  description: string
}) {
  const existing = await prisma.razorpayInvoice.findFirst({
    where: {
      subscriptionId: params.subscription.id,
      kind: 'subscription',
      periodEnd: params.end,
    },
  })
  if (existing) {
    return prisma.razorpayInvoice.update({
      where: { id: existing.id },
      data: {
        amount: params.amount,
        status: 'paid',
        paidAt: params.occurredAt,
        razorpayPaymentId: params.paymentId || existing.razorpayPaymentId,
        description: params.description,
      },
    })
  }
  return prisma.razorpayInvoice.create({
    data: {
      userId: params.subscription.userId,
      storeId: params.subscription.storeId,
      subscriptionId: params.subscription.id,
      kind: 'subscription',
      amount: params.amount,
      currency: params.currency,
      status: 'paid',
      periodStart: params.start,
      periodEnd: params.end,
      dueDate: params.start,
      paidAt: params.occurredAt,
      razorpayPaymentId: params.paymentId || null,
      description: params.description,
    },
  })
}

async function ensureCustomer(store: StoreRef, email?: string | null, name?: string | null) {
  const existing = await prisma.razorpayCustomer.findUnique({ where: { storeId: store.id } })
  if (existing) return existing.razorpayCustomerId
  const created: any = await razorpayCreateCustomer({
    storeId: store.id,
    userId: store.userId,
    email,
    name: name || store.name,
  })
  if (!created?.id) throw new RazorpayBillingError('RAZORPAY_CUSTOMER_FAILED', 'Razorpay did not return a customer id', 502)
  await prisma.razorpayCustomer.upsert({
    where: { storeId: store.id },
    update: { razorpayCustomerId: created.id },
    create: {
      storeId: store.id,
      userId: store.userId,
      razorpayCustomerId: created.id,
    },
  })
  return created.id as string
}

export async function startWooCommerceRazorpaySubscription(params: {
  store: StoreRef
  planId: string
  period: RazorpayBillingPeriod
  email?: string | null
  name?: string | null
}) {
  if (!isWooCommercePlatform(params.store.platform)) {
    throw new RazorpayBillingError('NOT_WOOCOMMERCE_STORE', 'Razorpay billing is only available for WooCommerce stores.', 403)
  }
  getRazorpayConfig()

  const expected = expectedRazorpayPlan(params.planId, params.period)
  const fetched = await razorpayFetchPlan(expected.razorpayPlanId)
  assertRazorpayPlanMatchesConfig(fetched, expected)

  let existing = await prisma.razorpaySubscription.findUnique({ where: { storeId: params.store.id } })

  if (existing?.pendingPlanId) {
    if (
      existing.pendingPlanId === expected.planId &&
      existing.pendingBillingPeriod === expected.period &&
      existing.razorpaySubscriptionId
    ) {
      return checkoutResponse({
        storeId: existing.storeId,
        subscriptionId: existing.razorpaySubscriptionId,
        expected,
        email: params.email,
        name: params.name,
        scheduled: true,
        effectiveAt: existing.pendingStartAt,
      })
    }

    if (existing.razorpaySubscriptionId) {
      await razorpayCancelSubscription(existing.razorpaySubscriptionId, false).catch(() => null)
    }
    const restoredSubscriptionId = existing.previousRazorpaySubscriptionId || null
    await prisma.razorpaySubscription.update({
      where: { id: existing.id },
      data: {
        razorpaySubscriptionId: restoredSubscriptionId,
        previousRazorpaySubscriptionId: null,
        pendingPlanId: null,
        pendingBillingPeriod: null,
        pendingAmount: null,
        pendingStartAt: null,
        pendingAuthorizedAt: null,
        nextBillingAt: existing.currentPeriodEnd,
      },
    })
    existing = {
      ...existing,
      razorpaySubscriptionId: restoredSubscriptionId,
      previousRazorpaySubscriptionId: null,
      pendingPlanId: null,
      pendingBillingPeriod: null,
      pendingAmount: null,
      pendingStartAt: null,
      pendingAuthorizedAt: null,
    }
  }

  if (existing?.status === 'active' && existing.razorpaySubscriptionId) {
    if (existing.plan === expected.planId && existing.billingPeriod === expected.period) {
      throw new RazorpayBillingError('ALREADY_ACTIVE', 'This store is already on that plan.', 409)
    }
    return scheduleRazorpayPlanChange(existing, expected, params)
  }

  if (existing?.razorpaySubscriptionId && !['cancelled', 'expired'].includes(existing.status)) {
    const gateway: any = await razorpayFetchSubscription(existing.razorpaySubscriptionId).catch(() => null)
    if (gateway?.status === 'active') {
      const existingExpected = expectedForSubscription(existing)
      assertGatewaySubscriptionMatches(gateway, existingExpected, existing.razorpayCustomerId, existing.storeId)
      const start = fromUnixSeconds(gateway.current_start) || existing.currentPeriodStart
      const end = fromUnixSeconds(gateway.current_end) || existing.currentPeriodEnd
      await upsertPaidSubscriptionInvoice({
        subscription: existing,
        amount: existingExpected.amount,
        currency: existingExpected.currency,
        start,
        end,
        paymentId: existing.lastPaymentId,
        occurredAt: new Date(),
        description: `CartGain ${getPlan(existingExpected.planId).name} — ${existingExpected.period}`,
      })
      await prisma.razorpaySubscription.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          plan: existingExpected.planId,
          billingPeriod: existingExpected.period,
          amount: existingExpected.amount,
          currency: existingExpected.currency,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          nextBillingAt: fromUnixSeconds(gateway.next_charge_at) || end,
          pendingPlanId: null,
          pendingBillingPeriod: null,
          pendingAmount: null,
          pendingStartAt: null,
          pendingAuthorizedAt: null,
          gracePeriodEnd: null,
        },
      })
      existing = { ...existing, status: 'active', plan: existingExpected.planId, billingPeriod: existingExpected.period }
      if (existing.plan === expected.planId && existing.billingPeriod === expected.period) {
        throw new RazorpayBillingError('ALREADY_ACTIVE', 'This store is already on that plan.', 409)
      }
      return scheduleRazorpayPlanChange(existing, expected, params)
    }
    if (['created', 'pending'].includes(gateway?.status)) {
      if (existing.plan === expected.planId && existing.billingPeriod === expected.period) {
        return checkoutResponse({
          storeId: existing.storeId,
          subscriptionId: existing.razorpaySubscriptionId,
          expected,
          email: params.email,
          name: params.name,
        })
      }
      await razorpayCancelSubscription(existing.razorpaySubscriptionId, false).catch(() => null)
    }
  }

  const customerId = await ensureCustomer(params.store, params.email, params.name)
  const now = new Date()
  const created: any = await razorpayCreateSubscription({
    planId: expected.razorpayPlanId,
    customerId,
    notes: {
      cartgain_store_id: params.store.id,
      cartgain_user_id: params.store.userId,
      cartgain_plan: expected.planId,
      cartgain_period: expected.period,
    },
  })
  if (!created?.id) {
    throw new RazorpayBillingError('RAZORPAY_SUBSCRIPTION_FAILED', 'Razorpay did not return a subscription id', 502)
  }

  await prisma.razorpaySubscription.upsert({
    where: { storeId: params.store.id },
    update: {
      userId: params.store.userId,
      plan: expected.planId,
      status: 'pending',
      billingPeriod: expected.period,
      razorpayCustomerId: customerId,
      razorpaySubscriptionId: created.id,
      previousRazorpaySubscriptionId: existing?.razorpaySubscriptionId || null,
      pendingPlanId: null,
      pendingBillingPeriod: null,
      pendingAmount: null,
      pendingStartAt: null,
      pendingAuthorizedAt: null,
      amount: expected.amount,
      currency: expected.currency,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd(now, expected.period),
      nextBillingAt: fromUnixSeconds(created.current_end) || periodEnd(now, expected.period),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
    },
    create: {
      userId: params.store.userId,
      storeId: params.store.id,
      plan: expected.planId,
      status: 'pending',
      billingPeriod: expected.period,
      razorpayCustomerId: customerId,
      razorpaySubscriptionId: created.id,
      amount: expected.amount,
      currency: expected.currency,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd(now, expected.period),
      nextBillingAt: fromUnixSeconds(created.current_end) || periodEnd(now, expected.period),
    },
  })

  await track({
    name: 'cartgain_billing_started',
    userId: params.store.userId,
    storeId: params.store.id,
    properties: {
      plan: expected.planId,
      period: expected.period,
      provider: 'razorpay',
      currency: expected.currency,
      amount: expected.amount,
    },
  })

  return checkoutResponse({
    storeId: params.store.id,
    subscriptionId: created.id,
    expected,
    email: params.email,
    name: params.name,
  })
}

async function scheduleRazorpayPlanChange(
  existing: any,
  expected: ReturnType<typeof expectedRazorpayPlan>,
  params: { email?: string | null; name?: string | null },
) {
  const renewalAt = existing.currentPeriodEnd instanceof Date
    ? existing.currentPeriodEnd
    : new Date(existing.currentPeriodEnd)
  if (!renewalAt || renewalAt.getTime() <= Date.now()) {
    throw new RazorpayBillingError('RENEWAL_DATE_MISSING', 'Could not determine the renewal date for this subscription.', 409)
  }

  await razorpayCancelSubscription(existing.razorpaySubscriptionId, true)

  const created: any = await razorpayCreateSubscription({
    planId: expected.razorpayPlanId,
    customerId: existing.razorpayCustomerId,
    startAt: Math.floor(renewalAt.getTime() / 1000),
    notes: {
      cartgain_store_id: existing.storeId,
      cartgain_user_id: existing.userId,
      cartgain_plan: expected.planId,
      cartgain_period: expected.period,
      cartgain_plan_change: 'true',
    },
  })
  if (!created?.id) {
    throw new RazorpayBillingError('RAZORPAY_SUBSCRIPTION_FAILED', 'Razorpay did not return a subscription id', 502)
  }

  await prisma.razorpaySubscription.update({
    where: { id: existing.id },
    data: {
      previousRazorpaySubscriptionId: existing.razorpaySubscriptionId,
      razorpaySubscriptionId: created.id,
      pendingPlanId: expected.planId,
      pendingBillingPeriod: expected.period,
      pendingAmount: expected.amount,
      pendingStartAt: renewalAt,
      pendingAuthorizedAt: null,
      nextBillingAt: renewalAt,
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null,
    },
  })

  return checkoutResponse({
    storeId: existing.storeId,
    subscriptionId: created.id,
    expected,
    email: params.email,
    name: params.name,
    scheduled: true,
    effectiveAt: renewalAt,
  })
}

export async function verifyRazorpayCheckout(params: {
  storeId: string
  userId: string
  subscriptionId: string
  paymentId: string
  signature: string
}) {
  const config = getRazorpayConfig()
  if (
    !verifyRazorpayPaymentSignature({
      subscriptionId: params.subscriptionId,
      paymentId: params.paymentId,
      signature: params.signature,
      keySecret: config.keySecret,
    })
  ) {
    throw new RazorpayBillingError('INVALID_SIGNATURE', 'Razorpay payment signature is invalid.', 400)
  }

  const local = await prisma.razorpaySubscription.findUnique({ where: { storeId: params.storeId } })
  if (!local || local.userId !== params.userId || local.razorpaySubscriptionId !== params.subscriptionId) {
    throw new RazorpayBillingError('SUBSCRIPTION_NOT_FOUND', 'No matching Razorpay subscription was found for this store.', 404)
  }

  const gateway: any = await razorpayFetchSubscription(params.subscriptionId)
  const expected = local.pendingPlanId
    ? expectedRazorpayPlan(
        local.pendingPlanId,
        (local.pendingBillingPeriod || 'monthly') as RazorpayBillingPeriod,
      )
    : expectedForSubscription(local)
  assertGatewaySubscriptionMatches(gateway, expected, local.razorpayCustomerId, local.storeId)

  const now = new Date()
  const paymentStatus = local.pendingPlanId ? 'authorized' : 'captured'

  if (local.pendingPlanId) {
    if (!['created', 'pending', 'active'].includes(gateway?.status)) {
      throw new RazorpayBillingError('PAYMENT_NOT_CONFIRMED', 'Razorpay has not authorized this plan change yet.', 409)
    }
    await prisma.$transaction([
      prisma.razorpaySubscription.update({
        where: { id: local.id },
        data: {
          pendingAuthorizedAt: now,
          nextBillingAt: local.pendingStartAt || fromUnixSeconds(gateway?.next_charge_at),
        },
      }),
      prisma.razorpayPayment.upsert({
        where: { paymentId: params.paymentId },
        update: { status: paymentStatus, subscriptionId: local.id, razorpaySubscriptionId: params.subscriptionId },
        create: {
          userId: params.userId,
          storeId: params.storeId,
          subscriptionId: local.id,
          razorpaySubscriptionId: params.subscriptionId,
          paymentId: params.paymentId,
          amount: expected.amount,
          currency: expected.currency,
          status: paymentStatus,
        },
      }),
    ])
    return {
      status: 'scheduled',
      scheduled: true,
      subscriptionId: params.subscriptionId,
      effectiveAt: local.pendingStartAt?.toISOString() || null,
    }
  }

  if (mapRazorpayStatus(gateway?.status) !== 'active') {
    throw new RazorpayBillingError('PAYMENT_NOT_CONFIRMED', 'Razorpay has not confirmed this payment yet.', 409)
  }

  const start = fromUnixSeconds(gateway?.current_start) || local.currentPeriodStart
  const end = fromUnixSeconds(gateway?.current_end) || local.currentPeriodEnd
  await upsertPaidSubscriptionInvoice({
    subscription: local,
    amount: expected.amount,
    currency: expected.currency,
    start,
    end,
    paymentId: params.paymentId,
    occurredAt: now,
    description: `CartGain ${getPlan(expected.planId).name} — ${expected.period}`,
  })
  await prisma.$transaction([
    prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: {
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        nextBillingAt: fromUnixSeconds(gateway?.next_charge_at) || end,
        lastPaymentId: params.paymentId,
        lastEventAt: now,
        gracePeriodEnd: null,
        pendingAuthorizedAt: null,
      },
    }),
    prisma.razorpayPayment.upsert({
      where: { paymentId: params.paymentId },
      update: { status: paymentStatus, subscriptionId: local.id, razorpaySubscriptionId: params.subscriptionId },
      create: {
        userId: params.userId,
        storeId: params.storeId,
        subscriptionId: local.id,
        razorpaySubscriptionId: params.subscriptionId,
        paymentId: params.paymentId,
        amount: expected.amount,
        currency: expected.currency,
        status: paymentStatus,
      },
    }),
    prisma.razorpayInvoice.updateMany({
      where: { subscriptionId: local.id, kind: 'subscription', status: 'pending', periodEnd: end },
      data: { status: 'paid', paidAt: now, razorpayPaymentId: params.paymentId },
    }),
  ])

  return { status: 'active', subscriptionId: params.subscriptionId }
}

export async function reconcileRazorpaySubscriptionForStore(userId: string, storeId: string) {
  const local = await prisma.razorpaySubscription.findUnique({ where: { storeId } })
  if (!local || local.userId !== userId || !local.razorpaySubscriptionId) return null
  const gateway: any = await razorpayFetchSubscription(local.razorpaySubscriptionId)
  const start = fromUnixSeconds(gateway?.current_start) || local.currentPeriodStart
  const end = fromUnixSeconds(gateway?.current_end) || local.currentPeriodEnd
  const gatewayStatus = mapRazorpayStatus(gateway?.status)

  // A scheduled plan change keeps the CURRENT plan active until the new
  // subscription's first successful charge. A `created`/`pending` gateway state
  // must never downgrade the merchant to free while they wait for that charge.
  if (local.pendingPlanId && gatewayStatus !== 'active') {
    return prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: { nextBillingAt: local.pendingStartAt || end },
    })
  }

  if (gatewayStatus === 'active') {
    const expected = expectedForSubscription(local)
    assertGatewaySubscriptionMatches(gateway, expected, local.razorpayCustomerId, local.storeId)
    await upsertPaidSubscriptionInvoice({
      subscription: local,
      amount: expected.amount,
      currency: expected.currency,
      start,
      end,
      paymentId: local.lastPaymentId,
      occurredAt: new Date(),
      description: `CartGain ${getPlan(expected.planId).name} — ${expected.period}`,
    })
  }

  return prisma.razorpaySubscription.update({
    where: { id: local.id },
    data: {
      status: local.cancelAtPeriodEnd && gatewayStatus === 'active' ? local.status : gatewayStatus,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      nextBillingAt: local.cancelAtPeriodEnd ? null : fromUnixSeconds(gateway?.next_charge_at) || end,
      gracePeriodEnd: gatewayStatus === 'active' ? null : local.gracePeriodEnd,
    },
  })
}

export async function cancelWooCommerceRazorpaySubscription(userId: string, storeId: string) {
  const local = await prisma.razorpaySubscription.findUnique({ where: { storeId } })
  if (!local || local.userId !== userId) {
    throw new RazorpayBillingError('SUBSCRIPTION_NOT_FOUND', 'No Razorpay subscription was found for this store.', 404)
  }
  if (local.plan === 'free' || !local.razorpaySubscriptionId) {
    throw new RazorpayBillingError('NOT_PAID', 'This store is already on the free plan.', 400)
  }
  if (local.cancelAtPeriodEnd || local.status === 'cancelled' || local.status === 'expired') {
    return { success: true, alreadyScheduled: true, effectiveAt: local.currentPeriodEnd }
  }
  if (local.pendingPlanId) {
    await razorpayCancelSubscription(local.razorpaySubscriptionId, false).catch(() => null)
    await prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: {
        razorpaySubscriptionId: local.previousRazorpaySubscriptionId || local.razorpaySubscriptionId,
        previousRazorpaySubscriptionId: null,
        pendingPlanId: null,
        pendingBillingPeriod: null,
        pendingAmount: null,
        pendingStartAt: null,
        pendingAuthorizedAt: null,
      },
    })
  }
  await razorpayCancelSubscription(local.pendingPlanId ? local.previousRazorpaySubscriptionId || local.razorpaySubscriptionId : local.razorpaySubscriptionId, true)
  await prisma.razorpaySubscription.update({
    where: { id: local.id },
    data: { cancelAtPeriodEnd: true },
  })
  return { success: true, alreadyScheduled: false, effectiveAt: local.currentPeriodEnd }
}

export async function isRazorpayWebhookProcessed(entityId: string): Promise<boolean> {
  const row = await prisma.webhookEvent.findUnique({
    where: { namespace_entityId: { namespace: 'razorpay', entityId } },
  })
  return !!row
}

export async function markRazorpayWebhookProcessed(entityId: string): Promise<void> {
  try {
    await prisma.webhookEvent.create({ data: { namespace: 'razorpay', entityId } })
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
  }
}

function paymentLinkEntity(event: any): any | null {
  return event?.payload?.payment_link?.entity || null
}

function eventTime(event: any): Date {
  const seconds = toUnixSeconds(event?.created)
  return seconds ? new Date(seconds * 1000) : new Date()
}

function subscriptionEntity(event: any): any | null {
  return event?.payload?.subscription?.entity || event?.payload?.installment?.entity?.subscription || null
}

function paymentEntity(event: any): any | null {
  return event?.payload?.payment?.entity || null
}

function orderEntity(event: any): any | null {
  return event?.payload?.order?.entity || null
}

async function findLocalBySubscriptionId(subscriptionId: string | null | undefined) {
  if (!subscriptionId) return null
  return prisma.razorpaySubscription.findFirst({
    where: {
      OR: [
        { razorpaySubscriptionId: subscriptionId },
        { previousRazorpaySubscriptionId: subscriptionId },
      ],
    },
  })
}

async function findLocalForWebhook(event: any): Promise<any | null> {
  const subscription = subscriptionEntity(event)
  const payment = paymentEntity(event)
  const order = orderEntity(event)
  const paymentLink = paymentLinkEntity(event)
  const local = await findLocalBySubscriptionId(subscription?.id || payment?.subscription_id)
  if (local) return local

  const noteStoreId =
    subscription?.notes?.cartgain_store_id ||
    payment?.notes?.cartgain_store_id ||
    order?.notes?.cartgain_store_id ||
    paymentLink?.notes?.cartgain_store_id
  if (!noteStoreId) return null
  return prisma.razorpaySubscription.findUnique({ where: { storeId: String(noteStoreId) } })
}

function sanitizedEvent(event: any) {
  const subscription = subscriptionEntity(event)
  const payment = paymentEntity(event)
  return {
    event: event?.event || null,
    eventId: event?.id || null,
    created: event?.created || null,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          amount: subscription.amount,
          currency: subscription.currency,
          current_start: subscription.current_start,
          current_end: subscription.current_end,
          next_charge_at: subscription.next_charge_at,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          order_id: payment.order_id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          error_code: payment.error_code,
          error_description: payment.error_description,
        }
      : null,
  }
}

async function findInvoiceForPaymentEvent(event: any) {
  const payment = paymentEntity(event)
  const order = orderEntity(event)
  const paymentLink = paymentLinkEntity(event)
  const keys = [
    payment?.order_id,
    order?.id,
    paymentLink?.id,
    payment?.id,
    paymentLink?.reference_id,
    payment?.reference_id,
    order?.receipt,
  ].filter((value): value is string => !!value && value !== '__none__')
  if (!keys.length) return null
  return prisma.razorpayInvoice.findFirst({
    where: {
      OR: [
        { razorpayOrderId: { in: keys } },
        { razorpayPaymentId: { in: keys } },
        { razorpayPaymentLinkId: { in: keys } },
        { id: { in: keys } },
      ],
    },
  })
}

export async function processRazorpayWebhook(event: any, eventIdHeader?: string | null) {
  const eventName = String(event?.event || '')
  const eventKey = eventIdHeader || event?.id
  if (!eventName || !eventKey) throw new RazorpayBillingError('INVALID_EVENT', 'Missing Razorpay event name or id.', 400)
  const entityId = String(eventKey)

  if (await isRazorpayWebhookProcessed(entityId)) return { duplicate: true }
  const finish = async (result: Record<string, unknown>, retryable = false) => {
    if (!retryable) await markRazorpayWebhookProcessed(entityId)
    return result
  }

  const occurredAt = eventTime(event)
  const subscription = subscriptionEntity(event)
  const payment = paymentEntity(event)
  const local = await findLocalForWebhook(event)

  if (payment?.id) {
    await prisma.razorpayPayment.upsert({
      where: { paymentId: String(payment.id) },
      update: {
        status: String(payment.status || 'authorized'),
        subscriptionId: local?.id,
        razorpaySubscriptionId: subscription?.id || payment?.subscription_id || null,
        orderId: payment?.order_id || null,
        failureCode: payment?.error_code || null,
        failureReason: payment?.error_description || null,
        rawEvent: sanitizedEvent(event),
      },
      create: {
        userId: local?.userId || 'unknown',
        storeId: local?.storeId || 'unknown',
        subscriptionId: local?.id || null,
        razorpaySubscriptionId: subscription?.id || payment?.subscription_id || null,
        orderId: payment?.order_id || null,
        paymentId: String(payment.id),
        eventId: entityId,
        amount: Number(payment?.amount || 0) / 100,
        currency: String(payment?.currency || 'INR'),
        status: String(payment?.status || 'authorized'),
        failureCode: payment?.error_code || null,
        failureReason: payment?.error_description || null,
        rawEvent: sanitizedEvent(event),
      },
    })
  }

  if (!local) return finish({ handled: false, reason: 'no_matching_subscription' }, true)

  if (local.lastEventAt && occurredAt.getTime() < new Date(local.lastEventAt).getTime() - 5000) {
    return finish({ handled: false, reason: 'out_of_order' })
  }

  const eventSubscriptionId = subscription?.id || payment?.subscription_id
  const isCurrentSubscription = !!eventSubscriptionId && eventSubscriptionId === local.razorpaySubscriptionId
  const isPreviousSubscription = !!eventSubscriptionId && eventSubscriptionId === local.previousRazorpaySubscriptionId

  const chargingPreviousPlan = !!local.pendingPlanId && isPreviousSubscription
  let expected: ExpectedRazorpayPlan | null = null
  try {
    expected = local.pendingPlanId && !chargingPreviousPlan
      ? expectedRazorpayPlan(
          local.pendingPlanId,
          (local.pendingBillingPeriod || 'monthly') as RazorpayBillingPeriod,
        )
      : expectedForSubscription(local)
  } catch {
    expected = null
  }
  const chargedAmount = Number(subscription?.amount || payment?.amount || 0) / 100

  if (eventName === 'subscription.charged') {
    if ((!isCurrentSubscription && !chargingPreviousPlan) || ['cancelled', 'expired'].includes(local.status)) {
      return finish({ handled: false, reason: 'stale_subscription' })
    }
    const expectedAmount = expected?.amount ?? Number(local.amount)
    if (!expected || Math.abs(chargedAmount - expectedAmount) > 0.01) {
      await captureError({
        level: 'error',
        component: 'billing',
        operation: 'razorpay_subscription_amount_mismatch',
        error: new Error(`expected=${expectedAmount} charged=${chargedAmount} subscription=${subscription?.id}`),
        persist: true,
      })
      return finish({ handled: false, reason: 'amount_mismatch' }, true)
    }

    const applyingPending = !!local.pendingPlanId && isCurrentSubscription
    const start = fromUnixSeconds(subscription?.current_start) || local.currentPeriodStart
    const end = fromUnixSeconds(subscription?.current_end) || local.currentPeriodEnd
    const planId = applyingPending && local.pendingPlanId ? local.pendingPlanId : local.plan
    const billingPeriod = (applyingPending
      ? local.pendingBillingPeriod
      : local.billingPeriod) as RazorpayBillingPeriod || 'monthly'
    await upsertPaidSubscriptionInvoice({
      subscription: local,
      amount: chargedAmount,
      currency: String(subscription?.currency || local.currency || expected.currency),
      start,
      end,
      paymentId: payment?.id ? String(payment.id) : null,
      occurredAt,
      description: `CartGain ${getPlan(planId).name} — ${billingPeriod}`,
    })
    await prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: {
        status: 'active',
        plan: planId,
        billingPeriod,
        amount: expectedAmount,
        currency: expected.currency,
        ...(applyingPending
          ? {
              pendingPlanId: null,
              pendingBillingPeriod: null,
              pendingAmount: null,
              pendingStartAt: null,
              pendingAuthorizedAt: null,
              previousRazorpaySubscriptionId: null,
            }
          : {}),
        currentPeriodStart: start,
        currentPeriodEnd: end,
        nextBillingAt: fromUnixSeconds(subscription?.next_charge_at) || end,
        lastPaymentId: payment?.id ? String(payment.id) : local.lastPaymentId,
        lastEventAt: occurredAt,
        gracePeriodEnd: null,
        cartsUsedInPeriod: 0,
        overageMessages: 0,
        cartOverage: 0,
        bargainSessionsUsed: 0,
        bargainDealsUsed: 0,
        bargainOverageDeals: 0,
        revenueShareAccrued: 0,
        bargainAccrued: 0,
      },
    })
    return finish({ handled: true, event: eventName, planChangeApplied: applyingPending })
  }

  if (eventName === 'payment.failed') {
    const invoice = await findInvoiceForPaymentEvent(event)
    if (invoice) {
      await prisma.razorpayInvoice.update({
        where: { id: invoice.id },
        data: { status: 'failed', razorpayPaymentId: payment?.id ? String(payment.id) : invoice.razorpayPaymentId },
      })
      return finish({ handled: true, event: eventName })
    }
    if (eventSubscriptionId && !isCurrentSubscription) {
      return finish({ handled: false, reason: 'stale_subscription' })
    }
    const graceDays = Math.max(1, Number(process.env.RAZORPAY_GRACE_PERIOD_DAYS || 3))
    await prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: {
        status: 'past_due',
        gracePeriodEnd: new Date(occurredAt.getTime() + graceDays * 24 * 60 * 60 * 1000),
        lastEventAt: occurredAt,
      },
    })
    return finish({ handled: true, event: eventName })
  }

  if (eventName === 'subscription.cancelled' || eventName === 'subscription.expired' || eventName === 'subscription.completed') {
    if (!isCurrentSubscription && !isPreviousSubscription) {
      return finish({ handled: false, reason: 'stale_subscription' })
    }
    if (local.pendingPlanId && isCurrentSubscription && local.previousRazorpaySubscriptionId) {
      await prisma.razorpaySubscription.update({
        where: { id: local.id },
        data: {
          razorpaySubscriptionId: local.previousRazorpaySubscriptionId,
          previousRazorpaySubscriptionId: null,
          pendingPlanId: null,
          pendingBillingPeriod: null,
          pendingAmount: null,
          pendingStartAt: null,
          pendingAuthorizedAt: null,
          lastEventAt: occurredAt,
        },
      })
      return finish({ handled: true, event: eventName, planChangeReverted: true })
    }
    await prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: {
        status: eventName === 'subscription.cancelled' ? 'cancelled' : 'expired',
        cancelledAt: occurredAt,
        lastEventAt: occurredAt,
        cancelAtPeriodEnd: false,
        nextBillingAt: null,
      },
    })
    return finish({ handled: true, event: eventName })
  }

  if (['subscription.halted', 'subscription.paused'].includes(eventName)) {
    if (!isCurrentSubscription) return finish({ handled: false, reason: 'stale_subscription' })
    await prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: { status: eventName === 'subscription.paused' ? 'paused' : 'past_due', lastEventAt: occurredAt },
    })
    return finish({ handled: true, event: eventName })
  }

  if (eventName === 'subscription.resumed' || eventName === 'subscription.revived') {
    if (!isCurrentSubscription) return finish({ handled: false, reason: 'stale_subscription' })
    await prisma.razorpaySubscription.update({
      where: { id: local.id },
      data: { status: 'active', gracePeriodEnd: null, lastEventAt: occurredAt },
    })
    return finish({ handled: true, event: eventName })
  }

  if (['order.paid', 'payment.captured', 'payment_link.paid'].includes(eventName)) {
    const invoice = await findInvoiceForPaymentEvent(event)
    if (!invoice) return finish({ handled: false, reason: 'invoice_not_found' }, true)
    await prisma.$transaction([
      prisma.razorpayInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'paid',
          paidAt: occurredAt,
          razorpayPaymentId: payment?.id ? String(payment.id) : invoice.razorpayPaymentId,
          razorpayPaymentLinkId: paymentLinkEntity(event)?.id || invoice.razorpayPaymentLinkId,
        },
      }),
      prisma.razorpayUsageEvent.updateMany({
        where: { subscriptionId: invoice.subscriptionId, invoicedAt: null },
        data: { invoicedAt: occurredAt, invoiceId: invoice.id },
      }),
    ])
    return finish({ handled: true, event: eventName })
  }

  return finish({ handled: false, event: eventName })
}

export async function recordRazorpayUsageEvent(params: {
  userId: string
  storeId: string
  subscriptionId: string
  kind: string
  referenceId?: string | null
  netAmount?: number
  chargeAmount: number
  revSharePercent?: number | null
}) {
  const rounded = Math.round((params.chargeAmount + Number.EPSILON) * 100) / 100
  if (rounded <= 0) return null
  try {
    return await prisma.razorpayUsageEvent.create({
      data: {
        userId: params.userId,
        storeId: params.storeId,
        subscriptionId: params.subscriptionId,
        kind: params.kind,
        referenceId: params.referenceId || null,
        netAmount: Math.round((params.netAmount || 0) * 100) / 100,
        chargeAmount: rounded,
        revSharePercent: params.revSharePercent ?? null,
      },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') return null
    throw error
  }
}

export function razorpayPaise(amount: number): number {
  return toPaise(amount)
}

export function isRazorpayPlanMismatch(error: unknown): boolean {
  return error instanceof RazorpayPlanMismatchError
}
