import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolvePlanId, getPlan, cancelRazorpaySubscription } from '@/lib/payment'
import { getAppBaseUrl } from '@/lib/app-base-url'
import {
  resolveShopifyStoreForUser,
  shopifyBillingAvailability,
} from '@/lib/shopify-billing/service'
import { resolveBillingPrice, resolveUsageCap } from '@/lib/shopify-billing/plans'
import { createShopifySubscription } from '@/lib/shopify-billing/subscriptions'
import { ShopifyReconnectRequiredError } from '@/lib/shopify-billing/client'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import prisma from '@/lib/db'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'

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

    const auth = await getAuthContext(req)
    if (!auth?.user?.id) {
      return unauthorizedResponse()
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

    // ── Shopify Billing only ────────────────────────────────────────────
    // Shopify App Store policy requires every app charge to use Shopify App
    // Pricing or the Billing API. The server — never the client — decides
    // whether Shopify Billing is available; there is no off-platform fallback.
    const embeddedStoreId = auth.type === 'shopify_session' ? auth.store?.id : auth.store?.platform === 'shopify' ? auth.store.id : undefined
    const shopifyStore = await resolveShopifyStoreForUser(auth.user.id, embeddedStoreId)
    const availability = shopifyBillingAvailability(shopifyStore)

    if (!availability.available || !shopifyStore) {
      return shopifyUnavailableResponse(availability.reason, shopifyStore?.domain)
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
    })

    // The current schema stores one subscription per CartGain user. If that
    // row belongs to a different Shopify shop, do not replace it using the
    // token for another shop or overwrite its local billing association.
    if (
      existingSub?.provider === 'shopify' &&
      existingSub.shopDomain &&
      existingSub.shopDomain.toLowerCase() !== shopifyStore.domain.toLowerCase() &&
      (existingSub.status === 'active' || existingSub.status === 'pending')
    ) {
      return NextResponse.json(
        { error: 'This CartGain account has an active Shopify subscription for another connected store. Manage billing from that store.' },
        { status: 409 },
      )
    }

    return await startShopifySubscription({
      req,
      userId: auth.user.id,
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
      return NextResponse.json(
        { error: message, code: 'SHOPIFY_BILLING_CREATE_FAILED' },
        { status: 500 },
      )
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

  // Existing Shopify subscriptions are replaced by Shopify as part of
  // appSubscriptionCreate (replacementBehavior: STANDARD). Do not cancel
  // first: a cancel/create two-step can strand a merchant without a plan, and
  // Shopify owns the authoritative active-subscription state.

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
