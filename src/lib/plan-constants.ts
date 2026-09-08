/**
 * Client-safe plan constants. Import these from anywhere (client or server) —
 * this module has NO server-only dependencies (no razorpay/prisma), so the
 * dashboard layout can use the same values as the billing/gate code instead of
 * hardcoding a second copy that can drift out of sync.
 */

export const PLAN_IDS = {
  FREE: 'free',
  GROWTH: 'growth',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const

// Legacy plan ids that pre-date the unified pricing model. Resolved to their
// nearest unified tier so existing subscriptions keep working without a data
// migration (see resolvePlanId in lib/payment.ts).
export const LEGACY_PLAN_MAP: Record<string, string> = {
  starter: PLAN_IDS.GROWTH, // previous Starter (₹999/500 carts) → Growth
}

export const FREE_CARTS_THRESHOLD = 50

export const PAID_PLAN_IDS: ReadonlyArray<string> = [PLAN_IDS.GROWTH, PLAN_IDS.PRO]

export function resolvePlanId(planId: string): string {
  const normalized = String(planId || '').toLowerCase().trim()
  if (normalized === PLAN_IDS.FREE || normalized === PLAN_IDS.GROWTH ||
      normalized === PLAN_IDS.PRO || normalized === PLAN_IDS.ENTERPRISE) {
    return normalized
  }
  if (normalized in LEGACY_PLAN_MAP) return LEGACY_PLAN_MAP[normalized]
  return PLAN_IDS.FREE
}