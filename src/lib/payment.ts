import crypto from "crypto";

let razorpayInstance: any = null;

// Server-side only initialization
if (typeof window === 'undefined') {
  try {
    // eslint-disable-next-line global-require
    const Razorpay = require("razorpay");
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  } catch (e) {
    // Fail silently if razorpay not available
    console.error("Failed to load Razorpay:", e);
  }
}

export const razorpay = razorpayInstance;

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export const PLANS = {
  FREE: {
    id: "free",
    name: "Free Forever",
    price: 0,
    smsCredits: 0,
    whatsappCredits: 0,
    emailCredits: 50,
    features: ["First cart recovered free", "Email only", "Basic analytics"],
  },
  PAY_AS_YOU_GO: {
    id: "payg",
    name: "Pay As You Go",
    smsRate: 0.02,
    whatsappRate: 0.005,
    emailRate: 0,
    features: ["All channels included", "No monthly minimum", "AI optimization"],
  },
  PRO: {
    id: "pro",
    name: "Pro",
    price: 99,
    smsCredits: 5000,
    whatsappCredits: 1000,
    emailCredits: Infinity,
    features: ["Priority support", "Custom integrations", "White-label reports"],
  },
};
