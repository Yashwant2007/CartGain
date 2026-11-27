import { PLANS, resolvePlanId } from '@/lib/plan-constants'

export type BillingCurrency = 'INR' | 'USD'
export type BillingPeriod = 'monthly' | 'yearly'

export interface ShopifyBillingPrice {
  monthly: number
  yearly: number
}

type BillingPriceTable = Record<string, ShopifyBillingPrice | null>

function positiveEnv(name: string | undefined): number | null {
  if (!name) return null
  const raw = process.env[name]?.trim()
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

const USD_PRICE_ENV: Record<string, { monthly: string; yearly: string }> = {
  [PLANS.GROWTH.id]: {
    monthly: 'SHOPIFY_BILLING_USD_GROWTH_MONTHLY',
    yearly: 'SHOPIFY_BILLING_USD_GROWTH_YEARLY',
  },
  [PLANS.PRO.id]: {
    monthly: 'SHOPIFY_BILLING_USD_PRO_MONTHLY',
    yearly: 'SHOPIFY_BILLING_USD_PRO_YEARLY',
  },
}

/**
 * Shopify Billing charges the merchant in the shop's own currency — the amount
 * is NOT converted. INR is derived from the canonical PLANS table so it can
 * never drift. USD must be explicitly configured with the prices approved in
 * the Partner Dashboard; we never guess a price for an international merchant.
 */
export const SHOPIFY_BILLING_PRICES: Record<BillingCurrency, BillingPriceTable> = {
  INR: {
    [PLANS.GROWTH.id]: { monthly: PLANS.GROWTH.price, yearly: PLANS.GROWTH.yearlyPrice },
    [PLANS.PRO.id]: { monthly: PLANS.PRO.price, yearly: PLANS.PRO.yearlyPrice },
  },
  USD: {},
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
  if (cur === 'USD') {
    const amount = positiveEnv(USD_PRICE_ENV[resolvedPlanId]?.[period])
    return amount ? { amount, currency: cur } : null
  }

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
 * in the shop's currency — not the INR plan value. USD caps are configured with
 * the same Partner Dashboard pricing decision as USD plan prices.
 */
const USD_USAGE_CAP_ENV: Record<string, string> = {
  [PLANS.GROWTH.id]: 'SHOPIFY_BILLING_USD_GROWTH_USAGE_CAP',
  [PLANS.PRO.id]: 'SHOPIFY_BILLING_USD_PRO_USAGE_CAP',
}

export const SHOPIFY_USAGE_CAPS: Record<BillingCurrency, Record<string, number | null>> = {
  INR: {
    [PLANS.GROWTH.id]: PLANS.GROWTH.revShareCap,
    [PLANS.PRO.id]: PLANS.PRO.revShareCap,
  },
  USD: {},
}

export function resolveUsageCap(
  planId: string,
  currency: string | null | undefined,
): number | null {
  const cur = normalizeCurrency(currency)
  if (!cur) return null
  const resolvedPlanId = resolvePlanId(planId)
  const cap = cur === 'USD'
    ? positiveEnv(USD_USAGE_CAP_ENV[resolvedPlanId])
    : SHOPIFY_USAGE_CAPS[cur][resolvedPlanId]
  if (cap == null || !Number.isFinite(cap) || cap <= 0) return null
  return cap
}

export interface ShopifyOveragePrices {
  message: number
  deal: number
  cart: number
}

/**
 * Per-unit overage prices in the shop's billing currency. RevenueShareEvent
 * amounts are already denominated in the store currency, so these must be too;
 * reusing the INR plan values for a USD shop would overcharge by ~80x. USD is
 * fail-closed until the Partner Dashboard prices are configured explicitly.
 */
type ShopifyOverageEnvNames = Record<keyof ShopifyOveragePrices, string>

const USD_OVERAGE_ENV: Record<string, ShopifyOverageEnvNames> = {
  [PLANS.GROWTH.id]: {
    message: 'SHOPIFY_BILLING_USD_GROWTH_OVERAGE_MESSAGE',
    deal: 'SHOPIFY_BILLING_USD_GROWTH_OVERAGE_DEAL',
    cart: 'SHOPIFY_BILLING_USD_GROWTH_OVERAGE_CART',
  },
  [PLANS.PRO.id]: {
    message: 'SHOPIFY_BILLING_USD_PRO_OVERAGE_MESSAGE',
    deal: 'SHOPIFY_BILLING_USD_PRO_OVERAGE_DEAL',
    cart: 'SHOPIFY_BILLING_USD_PRO_OVERAGE_CART',
  },
}

export const SHOPIFY_OVERAGE_PRICES: Record<BillingCurrency, Record<string, ShopifyOveragePrices | null>> = {
  INR: {
    [PLANS.GROWTH.id]: {
      message: 1,
      deal: PLANS.GROWTH.bargainOverageDealPrice,
      cart: PLANS.GROWTH.bargainOverageCartPrice,
    },
    [PLANS.PRO.id]: {
      message: 1,
      deal: PLANS.PRO.bargainOverageDealPrice,
      cart: PLANS.PRO.bargainOverageCartPrice,
    },
  },
  USD: {},
}

export function resolveOveragePrices(
  planId: string,
  currency: string | null | undefined,
): ShopifyOveragePrices | null {
  const cur = normalizeCurrency(currency)
  if (!cur) return null
  const resolvedPlanId = resolvePlanId(planId)
  if (cur === 'USD') {
    const env = USD_OVERAGE_ENV[resolvedPlanId]
    if (!env) return null
    const message = positiveEnv(env.message)
    const deal = positiveEnv(env.deal)
    const cart = positiveEnv(env.cart)
    if (message == null || deal == null || cart == null) return null
    return { message, deal, cart }
  }
  return SHOPIFY_OVERAGE_PRICES[cur][resolvedPlanId] ?? null
}

/** Minimum invoice amount per currency (INR plans use a ₹100 noise floor). */
export const SHOPIFY_INVOICE_FLOORS: Record<BillingCurrency, number | null> = {
  INR: 100,
  USD: null,
}

export function resolveInvoiceFloor(currency: string | null | undefined): number {
  const cur = normalizeCurrency(currency)
  if (!cur) return 0
  if (cur === 'USD') return positiveEnv('SHOPIFY_BILLING_USD_INVOICE_FLOOR') ?? 0
  return SHOPIFY_INVOICE_FLOORS[cur] ?? 0
}
