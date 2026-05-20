import crypto from "crypto";

let razorpayInstance: any = null;

// Server-side only initialization
if (typeof window === 'undefined') {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (keyId && keySecret) {
      // eslint-disable-next-line global-require
      const Razorpay = require("razorpay");
      razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
  } catch (e) {
    console.warn("Failed to load Razorpay client:", e);
  }
}

export const razorpay = razorpayInstance;

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (signature.length !== expected.length) return false;

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
