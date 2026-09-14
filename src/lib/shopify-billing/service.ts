import prisma from '@/lib/db'
import { PAID_PLAN_IDS, resolvePlanId } from '@/lib/payment'
import { getActiveShopifySubscription } from './subscriptions'
import { normalizeCurrency, type BillingCurrency, type BillingPeriod } from './plans'
import type { ShopifyStoreRef } from './client'

export type ShopifyStore = ShopifyStoreRef & { userId: string; currency: string; platform: string }

/**
 * The store a Shopify Billing subscription belongs to. CartGain is single-store
 * per merchant in practice; when a merchant has several, the Shopify one is the
 * billing subject.
 */
export async function resolveShopifyStoreForUser(userId: string): Promise<ShopifyStore | null> {
  const store = await prisma.store.findFirst({
    where: { userId, platform: 'shopify', apiKey: { not: null } },
    orderBy: { createdAt: 'asc' },
  })
  return (store as ShopifyStore) || null
}

export interface ShopifyBillingAvailability {
  available: boolean
  currency: BillingCurrency | null
  reason?: 'no_shopify_store' | 'unsupported_currency'
}

/** Whether this merchant can be billed through Shopify Billing right now. */
export function shopifyBillingAvailability(store: ShopifyStore | null): ShopifyBillingAvailability {
  if (!store) return { available: false, currency: null, reason: 'no_shopify_store' }
  const currency = normalizeCurrency(store.currency)
  if (!currency) return { available: false, currency: null, reason: 'unsupported_currency' }
  return { available: true, currency }
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
