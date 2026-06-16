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

export const PLANS: Record<string, Plan> = {
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
      "First 50 carts recovered at 0% revenue share",
      "3% revenue share on recovered carts after first 50",
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
      "First 50 carts recovered at 0% revenue share",
      "2.5% revenue share on recovered carts after first 50",
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
      "First 50 carts recovered at 0% revenue share",
      "2% revenue share on recovered carts after first 50",
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
