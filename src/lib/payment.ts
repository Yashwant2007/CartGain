import {
  PLAN_IDS,
  LEGACY_PLAN_MAP,
  FREE_CARTS_THRESHOLD,
  PAID_PLAN_IDS,
  resolvePlanId,
} from "./plan-constants";

export { PLAN_IDS, FREE_CARTS_THRESHOLD, PAID_PLAN_IDS, resolvePlanId } from "./plan-constants";

/**
 * Legacy-only Razorpay cancellation.
 *
 * CartGain no longer creates app subscriptions or payment links outside Shopify.
 * This helper exists solely so a merchant who subscribed before the migration
 * can be cancelled at the old gateway when they switch to Shopify Billing. It
 * must never be used to start or collect an app charge.
 */
export async function cancelRazorpaySubscription(subscriptionId: string | null | undefined): Promise<boolean> {
  if (!subscriptionId) return true

  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !keySecret) return false

  try {
    const Razorpay = require("razorpay")
    const client = new Razorpay({ key_id: keyId, key_secret: keySecret })
    await client.subscriptions.cancel(subscriptionId)
    return true
  } catch (error: any) {
    // 400 "already cancelled / not in active state" - the merchant won't be
    // charged anymore, treat as success. Other errors propagate.
    const status = error?.statusCode || error?.status
    if (status === 400 || status === 404) return true
    console.error("Legacy Razorpay subscription cancel failed:", error?.message || error)
    return false
  }
}

export const OVERAGE_RATE_PER_MESSAGE = 1; // ₹1 per overage message

// A recovery only counts (and is billed) if WE sent a recovery message that was
// followed by an order within this window. Industry-standard conversion window.
export const ATTRIBUTION_WINDOW_HOURS = 72;

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
  revShareCap: number;          // max rev share billed per period (0 = no cap)
  bargainSessions: number;      // bargain sessions included per period
  bargainDeals: number;         // accepted deals included per period
  bargainOverageDealPrice: number; // ₹ per extra accepted deal beyond quota
  bargainOverageCartPrice: number; // ₹ per extra recovered cart beyond quota
  storesLimit: number;          // stores allowed on the plan
  estimatedRecovery: EstimatedRecovery;
  recommended?: boolean;
}

/**
 * Resolve a plan object from any id/case (e.g. "growth", "GROWTH", legacy
 * "starter"). Used everywhere instead of `PLANS[resolvePlanId(x)]` because
 * PLANS is keyed by uppercase names while the canonical id is lowercase.
 */
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
    id: "growth",
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
    id: "pro",
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
    id: "enterprise",
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
};
