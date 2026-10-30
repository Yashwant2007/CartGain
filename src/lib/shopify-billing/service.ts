import prisma from '@/lib/db'
import { PAID_PLAN_IDS, resolvePlanId } from '@/lib/payment'
import { getActiveShopifySubscription } from './subscriptions'
import { normalizeCurrency, type BillingCurrency, type BillingPeriod } from './plans'
import type { ShopifyStoreRef } from './client'

export type ShopifyStore = ShopifyStoreRef & {
  userId: string
  currency: string
  platform: string
  isActive: boolean
}

export type ShopifyTokenState = 'ok' | 'refreshable' | 'expired' | 'missing'

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000

export function shopifyTokenState(
  store: Pick<ShopifyStoreRef, 'apiKey' | 'shopifyRefreshToken' | 'shopifyTokenExpiresAt'>,
  now: Date = new Date(),
): ShopifyTokenState {
  if (!store.apiKey) return 'missing'
  if (!store.shopifyTokenExpiresAt) return 'ok'
  if (store.shopifyTokenExpiresAt.getTime() > now.getTime() + TOKEN_REFRESH_MARGIN_MS) return 'ok'
  return store.shopifyRefreshToken ? 'refreshable' : 'expired'
}

export async function resolveShopifyStoreForUser(userId: string): Promise<ShopifyStore | null> {
  const stores = await prisma.store.findMany({
    where: { userId, platform: 'shopify', apiKey: { not: null } },
    orderBy: { createdAt: 'asc' },
  })
  const store = stores.find((candidate) => candidate.isActive) ?? stores[0]
  return (store as ShopifyStore) || null
}

export interface ShopifyBillingAvailability {
  available: boolean
  currency: BillingCurrency | null
  reason?:
    | 'no_shopify_store'
    | 'store_inactive'
    | 'reconnect_required'
    | 'unsupported_currency'
  tokenState: ShopifyTokenState | null
}

/** Whether this merchant can be billed through Shopify Billing right now. */
export function shopifyBillingAvailability(store: ShopifyStore | null): ShopifyBillingAvailability {
  if (!store) {
    return { available: false, currency: null, reason: 'no_shopify_store', tokenState: null }
  }
  const tokenState = shopifyTokenState(store)
  if (!store.isActive) {
    return { available: false, currency: null, reason: 'store_inactive', tokenState }
  }
  if (tokenState === 'expired' || tokenState === 'missing') {
    return { available: false, currency: null, reason: 'reconnect_required', tokenState }
  }
  const currency = normalizeCurrency(store.currency)
  if (!currency) {
    return { available: false, currency: null, reason: 'unsupported_currency', tokenState }
  }
  return { available: true, currency, tokenState }
}

/**
 * Reset a local Subscription to the free tier. Mirrors the manual cancel flow in
 * the cancel route so a webhook-driven or reconcile-detected cancellation leaves
 * the row in the exact same state: plan=free, spend meters zeroed. All calls go
 * through here so the invariants (plan, status, period, meters) can never drift.
 */
export async function downgradeSubscriptionToFree(subscriptionId: string): Promise<void> {
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      plan: 'free',
      status: 'active',
      subscriptionId: null,
      shopifySubscriptionId: null,
      shopifyLineItemId: null,
      overageEnabled: false,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      smsCredits: 0,
      smsCreditsUsed: 0,
      cartsUsedInPeriod: 0,
      bargainSessionsUsed: 0,
      bargainDealsUsed: 0,
      bargainOverageDeals: 0,
      cartOverage: 0,
      overageMessages: 0,
    },
  })
}

/**
 * Pull the authoritative subscription state from Shopify and normalize it into
 * the local Subscription row. Safe to call repeatedly (idempotent). This is the
 * safety net for anything the app_subscriptions/update webhook may have missed
 * (e.g. a merchant cancelling from their Shopify admin while the app was down).
 */
export async function reconcileShopifySubscription(
  store: ShopifyStore,
): Promise<{ updated: boolean; status: string | null }> {
  const active = await getActiveShopifySubscription(store)

  let local = active?.id
    ? await prisma.subscription.findFirst({ where: { shopifySubscriptionId: active.id } })
    : null
  if (!local) {
    local = await prisma.subscription.findFirst({
      where: { userId: store.userId, provider: 'shopify' },
      orderBy: { createdAt: 'desc' },
    })
  }
  if (!local) return { updated: false, status: null }

  if (!active) {
    // Nothing active at Shopify (cancelled / expired / declined — or reverted
    // to a pre-subscription state). Downgrade to free so NO paid gate stays open
    // while the merchant is not being charged.
    if ((PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(local.plan))) {
      await downgradeSubscriptionToFree(local.id)
      return { updated: true, status: 'cancelled' }
    }
    if (local.status === 'active' || local.status === 'pending') {
      await prisma.subscription.update({ where: { id: local.id }, data: { status: 'cancelled' } })
      return { updated: true, status: 'cancelled' }
    }
    return { updated: false, status: local.status }
  }

  const isPaid = (PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(local.plan))

  await prisma.subscription.update({
    where: { id: local.id },
    data: {
      provider: 'shopify',
      status: active.status,
      shopDomain: store.domain,
      shopifySubscriptionId: active.id,
      shopifyLineItemId: active.lineItemId ?? local.shopifyLineItemId,
      ...(active.currentPeriodEnd ? { currentPeriodEnd: active.currentPeriodEnd } : {}),
      // Mirror the Razorpay activation behaviour so bargain/recovery overage
      // gating works identically regardless of provider. currentPeriodStart is
      // only seeded on FIRST activation — re-setting it on every reconcile (e.g.
      // each post-redirect visit) would let a merchant extend their cart-meter
      // window indefinitely by refreshing.
      ...(active.status === 'active' && isPaid ? { overageEnabled: true } : {}),
      ...(active.status === 'active' && isPaid && !local.currentPeriodStart ? { currentPeriodStart: new Date() } : {}),
    },
  })

  return { updated: true, status: active.status }
}

/** Convenience wrapper used by the webhook + status routes. */
export async function reconcileShopifySubscriptionForUser(userId: string): Promise<void> {
  const store = await resolveShopifyStoreForUser(userId)
  if (!store) return
  try {
    await reconcileShopifySubscription(store)
  } catch (err) {
    console.error('Shopify subscription reconcile failed:', err)
  }
}
