import { resolvePlanId } from '@/lib/plan-constants'
import { PLANS } from '@/lib/payment'

export type BillingCurrency = 'INR' | 'USD'
export type BillingPeriod = 'monthly' | 'yearly'

export interface ShopifyBillingPrice {
  monthly: number
  yearly: number
}

/**
 * Shopify Billing charges the merchant in the shop's own currency — the amount
 * is NOT converted. So every supported shop currency needs an explicit price
 * here; a missing entry makes billing unavailable (we never guess) rather than
 * charging ₹1,499 as $1,499.
 *
 * INR is derived from the canonical PLANS table so the two can never drift.
 *
 * [REQUIRES CONFIRMATION] The USD amounts below are placeholders. Confirm them
 * before charging international merchants — changing them is a one-line edit.
 */
export const SHOPIFY_BILLING_PRICES: Record<BillingCurrency, Record<string, ShopifyBillingPrice>> = {
  INR: {
    [PLANS.GROWTH.id]: { monthly: PLANS.GROWTH.price, yearly: PLANS.GROWTH.yearlyPrice },
    [PLANS.PRO.id]: { monthly: PLANS.PRO.price, yearly: PLANS.PRO.yearlyPrice },
  },
  USD: {
    [PLANS.GROWTH.id]: { monthly: 19, yearly: 190 },
    [PLANS.PRO.id]: { monthly: 49, yearly: 490 },
  },
}

export function normalizeCurrency(currency: string | null | undefined): BillingCurrency | null {
  if (!currency) return null
  const upper = currency.toUpperCase()
  return upper in SHOPIFY_BILLING_PRICES ? (upper as BillingCurrency) : null
}

export function isSupportedBillingCurrency(currency: string | null | undefined): boolean {
  return normalizeCurrency(currency) !== null
}

/**
 * Resolve the server-authoritative price for a plan in a shop's currency.
 * Returns null when the currency or plan is not billable — callers must treat
 * that as "Shopify Billing unavailable", never fall back to another currency.
 */
export function resolveBillingPrice(
  planId: string,
  period: BillingPeriod,
  currency: string | null | undefined,
): { amount: number; currency: BillingCurrency } | null {
  const cur = normalizeCurrency(currency)
  if (!cur) return null

  const resolvedPlanId = resolvePlanId(planId)
  const price = SHOPIFY_BILLING_PRICES[cur][resolvedPlanId]
  if (!price) return null

  const amount = period === 'yearly' ? price.yearly : price.monthly
  if (!Number.isFinite(amount) || amount <= 0) return null

  return { amount, currency: cur }
}

/** Plan ids that can be billed through Shopify (paid tiers only). */
export function billablePlanIds(): string[] {
  return [PLANS.GROWTH.id, PLANS.PRO.id]
}

/**
 * Usage-charge ceiling (revenue share) per plan per currency. Shopify requires
 * the merchant to pre-approve a capped usage amount, so this MUST be expressed
 * in the shop's currency — not the INR plan value.
 *
 * [REQUIRES CONFIRMATION] USD caps are derived placeholders; confirm before
 * enabling international revenue-share billing.
 */
export const SHOPIFY_USAGE_CAPS: Record<BillingCurrency, Record<string, number>> = {
  INR: {
    [PLANS.GROWTH.id]: PLANS.GROWTH.revShareCap,
    [PLANS.PRO.id]: PLANS.PRO.revShareCap,
  },
  USD: {
    [PLANS.GROWTH.id]: 60,
    [PLANS.PRO.id]: 120,
  },
}

export function resolveUsageCap(
  planId: string,
  currency: string | null | undefined,
): number | null {
  const cur = normalizeCurrency(currency)
  if (!cur) return null
  const cap = SHOPIFY_USAGE_CAPS[cur][resolvePlanId(planId)]
  if (!Number.isFinite(cap) || cap <= 0) return null
  return cap
}
