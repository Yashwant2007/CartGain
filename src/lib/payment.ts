export { PLAN_IDS, FREE_CARTS_THRESHOLD, PAID_PLAN_IDS, resolvePlanId, getPlan, PLANS } from "./plan-constants";
export type { EstimatedRecovery, PerChannelLimits, Plan } from "./plan-constants";

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
