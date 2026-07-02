import crypto from "crypto";

let razorpayInstance: any = null;

if (typeof window === 'undefined') {
  try {
    const Razorpay = require("razorpay");
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  } catch (e) {
    console.error("Failed to load Razorpay:", e);
  }
}

export const razorpay = razorpayInstance;

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export const FREE_CARTS_THRESHOLD = 50;
export const REVENUE_SHARE_PERCENT = 2.5;

// A recovery only counts (and is billed) if WE sent a recovery message that was
// followed by an order within this window. Industry-standard conversion window.
export const ATTRIBUTION_WINDOW_HOURS = 72;

export interface EstimatedRecovery {
  min: number;
  max: number;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  yearlyPrice: number;
  maxCarts: number;
  features: string[];
  revSharePercent: number;
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
  STARTER: 'starter',
  GROWTH: 'growth',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const

export const PAID_PLAN_IDS = [PLAN_IDS.STARTER, PLAN_IDS.GROWTH, PLAN_IDS.PRO]

export const PLANS: Record<string, Plan> = {
  FREE: {
    id: PLAN_IDS.FREE,
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    maxCarts: FREE_CARTS_THRESHOLD,
    revSharePercent: 0,
    estimatedRecovery: { min: 0, max: 25000 },
    features: [
      "All channels: SMS, WhatsApp, Email",
      "AI-powered recovery optimization",
      "Up to 50 recovered carts — completely free",
      "Real-time analytics dashboard",
      "Basic email support",
    ],
  },
  STARTER: {
    id: "starter",
    name: "Starter",
    price: 999,
    yearlyPrice: 9990,
    maxCarts: 500,
    revSharePercent: 3,
    estimatedRecovery: { min: 25000, max: 100000 },
    features: [
      "All channels: SMS, WhatsApp, Email",
      "AI-powered recovery optimization",
      "Real-time analytics dashboard",
      "3% revenue share on recovered revenue",
    ],
  },
  GROWTH: {
    id: "growth",
    name: "Growth",
    price: 2999,
    yearlyPrice: 29990,
    maxCarts: 3000,
    revSharePercent: 2.5,
    estimatedRecovery: { min: 100000, max: 500000 },
    features: [
      "Everything in Starter, plus:",
      "A/B testing for optimal messaging",
      "Priority email & chat support",
      "Custom discount rules & timing",
      "Advanced ROI & channel analytics",
      "2.5% revenue share on recovered revenue",
    ],
    recommended: true,
  },
  PRO: {
    id: "pro",
    name: "Pro",
    price: 8999,
    yearlyPrice: 89990,
    maxCarts: 15000,
    revSharePercent: 2,
    estimatedRecovery: { min: 500000, max: 2500000 },
    features: [
      "Everything in Growth, plus:",
      "White-label reports (your brand)",
      "Dedicated account manager",
      "Custom integrations & webhooks",
      "SLA guarantee with priority support",
      "2% revenue share on recovered revenue",
    ],
  },
  ENTERPRISE: {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    yearlyPrice: 0,
    maxCarts: Infinity,
    revSharePercent: 0,
    estimatedRecovery: { min: 2500000, max: 10000000 },
    features: [
      "Unlimited carts & recovery campaigns",
      "Everything in Pro",
      "Custom contract & SLA",
      "On-premise deployment option",
      "Volume-based revenue share discount",
    ],
  },
};
