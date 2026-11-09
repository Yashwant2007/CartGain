import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolvePlanId, getPlan, cancelRazorpaySubscription } from '@/lib/payment'
import { getAppBaseUrl } from '@/lib/app-base-url'
import {
  resolveShopifyStoreForUser,
  shopifyBillingAvailability,
} from '@/lib/shopify-billing/service'
import { resolveBillingPrice, resolveUsageCap } from '@/lib/shopify-billing/plans'
import { createShopifySubscription, cancelShopifySubscription } from '@/lib/shopify-billing/subscriptions'
import { ShopifyReconnectRequiredError } from '@/lib/shopify-billing/client'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('payments-create-subscription', {
      maxAttempts: 10,
      windowMs: 5 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan, period } = await req.json()
    const normalizedPeriod = period === 'yearly' ? 'yearly' : 'monthly'

    if (!plan) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 })
    }

    const resolvedPlanId = resolvePlanId(plan)
    const planConfig = getPlan(plan)
    if (!planConfig || planConfig.price === 0) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    // ── Shopify Billing only ────────────────────────────────────────────
    // Shopify App Store policy requires every app charge to use Shopify App
    // Pricing or the Billing API. The server — never the client — decides
    // whether Shopify Billing is available; there is no off-platform fallback.
    const shopifyStore = await resolveShopifyStoreForUser(session.user.id)
    const availability = shopifyBillingAvailability(shopifyStore)

    if (!availability.available || !shopifyStore) {
      return shopifyUnavailableResponse(availability.reason, shopifyStore?.domain)
    }

    return await startShopifySubscription({
      req,
      userId: session.user.id,
      store: shopifyStore,
      planId: resolvedPlanId,
      planName: planConfig.name,
      planConfig,
      period: normalizedPeriod,
      existingSub,
    })
    } catch (error) {
      if (error instanceof ShopifyReconnectRequiredError) {
        return NextResponse.json(
          {
            error: 'Your Shopify connection has expired. Reconnect Shopify in Integrations, then try again.',
            code: 'SHOPIFY_RECONNECT_REQUIRED',
          },
          { status: 409 },
        )
      }

      // Surface Shopify's actual rejection reason so merchants (and reviewers)
      // can see why a charge couldn't be created instead of a generic message.
      const message = error instanceof Error ? error.message : 'Failed to create subscription'

      await captureError({
        level: 'error',
        component: 'billing',
        operation: 'create_subscription',
        error,
        req,
        persist: true,
        statusCode: 500,
      })
      return NextResponse.json({ error: message }, { status: 500 })
    }
}

function shopifyUnavailableResponse(
  reason: ReturnType<typeof shopifyBillingAvailability>['reason'],
  domain?: string,
): NextResponse {
  const reconnectMessage = domain
    ? `Your Shopify store (${domain}) needs to be reconnected before billing can continue. Open Integrations, reconnect Shopify, then try again.`
    : 'Reconnect your Shopify store in Integrations before choosing a plan.'

  switch (reason) {
    case 'reconnect_required':
      return NextResponse.json(
        { error: reconnectMessage, code: 'SHOPIFY_RECONNECT_REQUIRED' },
        { status: 409 },
      )
    case 'store_inactive':
      return NextResponse.json(
        { error: reconnectMessage, code: 'SHOPIFY_STORE_INACTIVE' },
        { status: 409 },
      )
    case 'unsupported_currency':
      return NextResponse.json(
        { error: 'Billing is not available for your store currency. Please contact support.', code: 'UNSUPPORTED_CURRENCY' },
        { status: 400 },
      )
    default:
      return NextResponse.json(
        { error: 'Connect a Shopify store before choosing a Shopify-billed plan.', code: 'SHOPIFY_NOT_CONNECTED' },
        { status: 400 },
      )
  }
}

interface StartShopifyParams {
  req: NextRequest
  userId: string
  store: NonNullable<Awaited<ReturnType<typeof resolveShopifyStoreForUser>>>
  planId: string
  planName: string
  planConfig: ReturnType<typeof getPlan>
  period: 'monthly' | 'yearly'
  existingSub: Awaited<ReturnType<typeof prisma.subscription.findFirst>>
}

async function startShopifySubscription(params: StartShopifyParams): Promise<NextResponse> {
  const { req, userId, store, planId, planName, planConfig, period, existingSub } = params

  const price = resolveBillingPrice(planId, period, store.currency)
  if (!price) {
    return NextResponse.json(
      { error: `Billing is not available for your store currency (${store.currency}). Please contact support.` },
      { status: 400 },
    )
  }

  // Shopify allows one active subscription per app per shop. Cancel any live
  // Shopify subscription FIRST so switching plans can't leave two charges —
  // and so a failed create can never leave the merchant double-billed.
  if (
    existingSub?.provider === 'shopify' &&
    existingSub.shopifySubscriptionId &&
    (existingSub.status === 'pending' || existingSub.status === 'active')
  ) {
    const cancelled = await cancelShopifySubscription(store, existingSub.shopifySubscriptionId)
    if (!cancelled) {
      return NextResponse.json(
        { error: "We couldn't update your existing subscription at Shopify. Please contact support." },
        { status: 502 },
      )
    }
  }

  // Migration path: a merchant on the Razorpay / direct track who now bills via
  // Shopify must have the old gateway subscription cancelled too — otherwise
  // Razorpay keeps charging its own recurring amount on top of Shopify Billing.
  if (
    existingSub?.provider !== 'shopify' &&
    existingSub?.subscriptionId &&
    (existingSub.status === 'pending' || existingSub.status === 'active')
  ) {
    const cancelled = await cancelRazorpaySubscription(existingSub.subscriptionId)
    if (!cancelled) {
      return NextResponse.json(
        { error: "We couldn't cancel your existing Razorpay subscription. Please contact support." },
        { status: 502 },
      )
    }
  }

  const baseUrl = getAppBaseUrl(req)
  const returnUrl = `${baseUrl}/dashboard/subscription?billing=success&shop=${encodeURIComponent(store.domain)}`

  const created = await createShopifySubscription({
    store,
    planName: `CartGain ${planName} (${period})`,
    amount: price.amount,
    currency: price.currency,
    period,
    returnUrl,
    usageCap: resolveUsageCap(planId, price.currency) ?? undefined,
    usageTerms: `Revenue share on recovered sales (${planConfig.revSharePercent}%)`,
  })

  const periodMs = (period === 'yearly' ? 365 : 30) * 86400000
  await prisma.subscription.upsert({
    where: { userId },
    update: {
      provider: 'shopify',
      plan: planId,
      status: 'pending',
      shopDomain: store.domain,
      shopifySubscriptionId: created.shopifySubscriptionId,
      subscriptionId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + periodMs),
    },
    create: {
      userId,
      customerId: `shopify_${userId}`,
      provider: 'shopify',
      plan: planId,
      status: 'pending',
      shopDomain: store.domain,
      shopifySubscriptionId: created.shopifySubscriptionId,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + periodMs),
    },
  })

  await track({
    name: 'cartgain_billing_started',
    userId,
    properties: { plan: planId, period, provider: 'shopify', currency: price.currency },
  })

  return NextResponse.json({
    provider: 'shopify',
    confirmationUrl: created.confirmationUrl,
  })
}
