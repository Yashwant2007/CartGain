/**
 * Client-safe plan constants. Import these from anywhere (client or server) —
 * this module has NO server-only dependencies (no billing SDK/prisma), so the
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

export interface EstimatedRecovery {
  min: number;
  max: number;
}

export interface PerChannelLimits {
  email: number
  whatsapp: number
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  yearlyPrice: number;
  maxCarts: number;
  maxCampaigns: number;
  maxMessagesPerCustomer: PerChannelLimits;
  features: string[];
  revSharePercent: number;
  revShareCap: number;
  bargainSessions: number;
  bargainDeals: number;
  bargainOverageDealPrice: number;
  bargainOverageCartPrice: number;
  storesLimit: number;
  estimatedRecovery: EstimatedRecovery;
  recommended?: boolean;
}

export function getPlan(planId: string): Plan {
  const id = resolvePlanId(planId)
  return Object.values(PLANS).find((p) => p.id === id) || PLANS.FREE
}

export const PLANS: Record<string, Plan> = {
  FREE: {
    id: PLAN_IDS.FREE,
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    maxCarts: FREE_CARTS_THRESHOLD,
    maxCampaigns: 1,
    maxMessagesPerCustomer: { email: 3, whatsapp: 2 },
    revSharePercent: 0,
    revShareCap: 0,
    bargainSessions: 30,
    bargainDeals: 5,
    bargainOverageDealPrice: 0,
    bargainOverageCartPrice: 0,
    storesLimit: 1,
    estimatedRecovery: { min: 0, max: 25000 },
    features: [
      "All channels: WhatsApp & Email",
      "AI-powered recovery optimization",
      "Cart recovery: up to 50 recovered carts — completely free",
      "Bargain: up to 30 negotiation sessions & 5 accepted deals",
      "5 recovery messages per customer (3 email + 2 WhatsApp)",
      "1 active campaign · 1 store",
      "Real-time analytics dashboard",
      "Basic email support",
    ],
  },
  GROWTH: {
    id: PLAN_IDS.GROWTH,
    name: "Growth",
    price: 1499,
    yearlyPrice: 14990,
    maxCarts: 750,
    maxCampaigns: 5,
    maxMessagesPerCustomer: { email: 3, whatsapp: 2 },
    revSharePercent: 3.5,
    revShareCap: 5000,
    bargainSessions: 300,
    bargainDeals: 30,
    bargainOverageDealPrice: 25,
    bargainOverageCartPrice: 3,
    storesLimit: 3,
    estimatedRecovery: { min: 25000, max: 250000 },
    features: [
      "Everything in Free, plus:",
      "Cart recovery: up to 750 recovered carts",
      "Bargain: 300 sessions & 30 accepted deals included — sessions pause when exhausted, extra accepted deals ₹25 each",
      "5 recovery messages per customer (3 email + 2 WhatsApp); extra messages ₹1 each",
      "All AI personas + automatic language detection",
      "Per-product pricing & margin guides",
      "Up to 5 campaigns · 3 stores",
      "3.5% revenue share on recovered value, capped at ₹5,000/mo",
    ],
    recommended: true,
  },
  PRO: {
    id: PLAN_IDS.PRO,
    name: "Pro",
    price: 3999,
    yearlyPrice: 39990,
    maxCarts: 3000,
    maxCampaigns: 15,
    maxMessagesPerCustomer: { email: 3, whatsapp: 2 },
    revSharePercent: 3,
    revShareCap: 10000,
    bargainSessions: 1500,
    bargainDeals: 150,
    bargainOverageDealPrice: 15,
    bargainOverageCartPrice: 3,
    storesLimit: Infinity,
    estimatedRecovery: { min: 250000, max: 1000000 },
    features: [
      "Everything in Growth, plus:",
      "Cart recovery: up to 3,000 recovered carts",
      "Bargain: 1,500 sessions & 150 accepted deals included — sessions pause when exhausted, extra accepted deals ₹15 each",
      "5 recovery messages per customer (3 email + 2 WhatsApp); extra messages ₹1 each",
      "A/B persona testing + margin simulator",
      "Custom widget branding & colors",
      "Up to 15 campaigns · unlimited stores",
      "Priority email & chat support",
      "3% revenue share on recovered value, capped at ₹10,000/mo",
    ],
  },
  ENTERPRISE: {
    id: PLAN_IDS.ENTERPRISE,
    name: "Enterprise",
    price: 0,
    yearlyPrice: 0,
    maxCarts: Infinity,
    maxCampaigns: Infinity,
    maxMessagesPerCustomer: { email: 3, whatsapp: 2 },
    revSharePercent: 0,
    revShareCap: 0,
    bargainSessions: Infinity,
    bargainDeals: Infinity,
    bargainOverageDealPrice: 0,
    bargainOverageCartPrice: 0,
    storesLimit: Infinity,
    estimatedRecovery: { min: 2500000, max: 10000000 },
    features: [
      "Unlimited recovered carts & bargain deals",
      "Everything in Pro",
      "5 recovery messages per customer (3 email + 2 WhatsApp)",
      "Custom contract, rev share & SLA",
      "Dedicated support",
    ],
  },
}
