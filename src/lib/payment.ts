import crypto from "crypto";
import { requireEnv } from "./env";

let razorpayInstance: any = null;

if (typeof window === 'undefined') {
  try {
    const Razorpay = require("razorpay");
    razorpayInstance = new Razorpay({
      key_id: requireEnv("RAZORPAY_KEY_ID", "Razorpay payment processing"),
      key_secret: requireEnv("RAZORPAY_KEY_SECRET", "Razorpay payment processing"),
    });
  } catch (e) {
    console.error("Failed to load Razorpay:", e);
  }
}

export const razorpay = razorpayInstance;

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", requireEnv("RAZORPAY_WEBHOOK_SECRET", "webhook signature verification"))
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export const FREE_CARTS_THRESHOLD = 50;
export const REVENUE_SHARE_PERCENT = 2.5;
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
  sms: number
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

const planIdCache = new Map<string, string>()

export async function getOrCreateRazorpayPlan(planId: string, name: string, amount: number, period: 'monthly' | 'yearly'): Promise<string> {
  if (!razorpay) throw new Error('Razorpay not configured')

  const cacheKey = `${planId}_${period}`
  if (planIdCache.has(cacheKey)) return planIdCache.get(cacheKey)!

  const periodInterval = period === 'monthly' ? 'monthly' : 'yearly'
  const periodCount = 1

  try {
    const plans = await razorpay.plans.all({ count: 50 })
    const existing = (plans.items || []).find(
      (p: any) =>
        p.item?.name === `CartGain ${name}` &&
        p.period === periodInterval &&
        p.item?.amount === Math.round(amount * 100)
    )
    if (existing) {
      planIdCache.set(cacheKey, existing.id)
      return existing.id
    }
  } catch {
    // continue to create
  }

  const plan = await razorpay.plans.create({
    period: periodInterval,
    interval: periodCount,
    item: {
      name: `CartGain ${name}`,
      amount: Math.round(amount * 100),
      currency: 'INR',
      description: `CartGain ${name} - ${period} subscription`,
    },
    notes: {
      plan_id: planId,
      period,
    },
  })

  planIdCache.set(cacheKey, plan.id)
  return plan.id
}

export async function createRazorpaySubscription(planId: string, customerEmail: string, period: 'monthly' | 'yearly'): Promise<{
  subscriptionId: string
  shortUrl?: string
}> {
  if (!razorpay) throw new Error('Razorpay not configured')

  const plan = Object.values(PLANS).find(p => p.id === planId)
  if (!plan || plan.price === 0) throw new Error('Invalid plan')

  const amount = period === 'yearly' ? plan.yearlyPrice : plan.price
  const rzpPlanId = await getOrCreateRazorpayPlan(planId, plan.name, amount, period)

  const subscription = await razorpay.subscriptions.create({
    plan_id: rzpPlanId,
    customer_notify: true,
    quantity: 1,
    total_count: 100,
    expire_by: Math.round((Date.now() + 86400000) / 1000),
    notes: {
      plan_id: planId,
      period,
      plan_name: plan.name,
    },
  })

  return {
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url,
  }
}

export const PLAN_IDS = {
  FREE: 'free',
  GROWTH: 'growth',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const

// Legacy plan ids that existed before the unified pricing model. New code
// resolves them to their nearest unified tier so existing subscriptions keep
// working without a data migration.
export const LEGACY_PLAN_MAP: Record<string, string> = {
  starter: PLAN_IDS.GROWTH, // previous Starter (₹999/500 carts) → Growth
}

export function resolvePlanId(planId: string): string {
  const normalized = String(planId || '').toLowerCase().trim()
  // PLANS is keyed by uppercase convenience keys (FREE/GROWTH/PRO), while the
  // canonical ids, PLAN_IDS and what's stored on Subscription.plan and posted
  // to the payment API are all lowercase ("growth"). Resolve against the real
  // `.id` so a paid tier never collapses to free (that used to make
  // create-subscription return "Invalid plan" and zero out paid billing/gates).
  const match = Object.values(PLANS).find((p) => p.id === normalized)
  if (match) return match.id
  if (normalized in LEGACY_PLAN_MAP) return LEGACY_PLAN_MAP[normalized]
  return PLAN_IDS.FREE
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

export const PAID_PLAN_IDS = [PLAN_IDS.GROWTH, PLAN_IDS.PRO]

export const PLANS: Record<string, Plan> = {
  FREE: {
    id: PLAN_IDS.FREE,
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    maxCarts: FREE_CARTS_THRESHOLD,
    maxCampaigns: 1,
    maxMessagesPerCustomer: { email: 3, sms: 3, whatsapp: 3 },
    revSharePercent: 0,
    revShareCap: 0,
    bargainSessions: 30,
    bargainDeals: 5,
    bargainOverageDealPrice: 0,
    bargainOverageCartPrice: 0,
    storesLimit: 1,
    estimatedRecovery: { min: 0, max: 25000 },
    features: [
      "All channels: SMS, WhatsApp, Email",
      "AI-powered recovery optimization",
      "Cart recovery: up to 50 recovered carts — completely free",
      "Bargain: up to 30 negotiation sessions & 5 accepted deals",
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
    maxMessagesPerCustomer: { email: 10, sms: 10, whatsapp: 10 },
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
      "Bargain: 300 sessions & 30 accepted deals, then ₹25/extra deal",
      "No CartGain branding",
      "All AI personas + automatic language detection",
      "Per-product price floors & margin guides",
      "Up to 5 active campaigns · 3 stores",
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
    maxCampaigns: 20,
    maxMessagesPerCustomer: { email: 20, sms: 20, whatsapp: 20 },
    revSharePercent: 3,
    revShareCap: 10000,
    bargainSessions: 1500,
    bargainDeals: 150,
    bargainOverageDealPrice: 15,
    bargainOverageCartPrice: 2,
    storesLimit: Infinity,
    estimatedRecovery: { min: 250000, max: 1000000 },
    features: [
      "Everything in Growth, plus:",
      "Cart recovery: up to 3,000 recovered carts",
      "Bargain: 1,500 sessions & 150 accepted deals, then ₹15/extra deal",
      "A/B persona testing + margin simulator",
      "Custom widget branding & colors",
      "Up to 20 active campaigns · unlimited stores",
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
    maxMessagesPerCustomer: { email: Infinity, sms: Infinity, whatsapp: Infinity },
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
      "Custom contract, rev share & SLA",
      "Dedicated support",
    ],
  },
};
