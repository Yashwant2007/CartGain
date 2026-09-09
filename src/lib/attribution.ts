// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL ATTRIBUTION MODEL — revenue engine
// ─────────────────────────────────────────────────────────────────────────────
// Whenever a reported "recovered cart / recovered revenue" number exists, it must
// trace to this model. The model is deliberately CONSERVATIVE: when the evidence
// cannot show CartGain caused or materially contributed to a purchase, it is NOT
// attributed. (Day 8–10 revenue-engine adversarial testing — spec §10.)
//
// Attribution eligibility — ALL conditions must hold:
//   1. An order for EXACTLY this cart (token binding) — `store.cartId == token`.
//      A "same customer bought something later from a different cart" is NOT
//      attributed: the token differs, so the sale is outside the model.
//   2. The cart abandoned: a recovery message was SENT to it in status
//      ['sent','delivered'].
//   3. The message was sent BEFORE the order was created.
//   4. The message was sent within ATTRIBUTION_WINDOW_HOURS before the order.
//   5. The order was placed by the same store (cross-tenant never matches — cart
//      rows are scoped by (storeId, cartId)).
//   6. The order has never been credited before (one credit per shopifyOrderId —
//      enforced by the unique index on RecoveredCart.shopifyOrderId).
//
// Revenue definition (what "recovered revenue" means):
//   recoveredRevenue = netRevenue = max(0, grossOrderTotal − orderDiscounts)
//   where declining metrics report RECOGNIZED revenue:
//   recognizedNet = max(0, netRevenue − cumulativeRefunded)
//   A refund/cancellation nets revenue in the day it is recorded. Full
//   cancellation also decrements the recovered-cart count by one.
// ─────────────────────────────────────────────────────────────────────────────

import { ATTRIBUTION_WINDOW_HOURS } from '@/lib/payment'

/** Message statuses that count as "delivered to the buyer". */
export const ATTRIBUTABLE_MESSAGE_STATUSES = ['sent', 'delivered'] as const

/**
 * Pure eligibility predicate for a single recovery message.
 * `orderCreatedAt` and `sentAt` must be valid Dates.
 */
export function isMessageAttributable(opts: {
  messageStatus: string
  sentAt: Date | null
  orderCreatedAt: Date
  windowHours?: number
}): boolean {
  const { messageStatus, sentAt, orderCreatedAt, windowHours = ATTRIBUTION_WINDOW_HOURS } = opts
  if (!ATTRIBUTABLE_MESSAGE_STATUSES.includes(messageStatus as any)) return false
  if (!sentAt) return false
  // Causal ordering: a message can only earn credit if it went out first.
  if (sentAt.getTime() > orderCreatedAt.getTime()) return false
  const windowStart = orderCreatedAt.getTime() - windowHours * 60 * 60 * 1000
  return sentAt.getTime() >= windowStart
}

export type RefundNettingResult = {
  newTotalRefunded: number
  deltaRefunded: number
  recognizedNet: number
  fullyRefunded: boolean
  analyticsRevenueDelta: number
  analyticsCartsDelta: number
}

/**
 * Compute the netting a refund / cancellation applies to a credited recovery.
 * Pure and deterministic so reporting invariants are unit-testable.
 *
 *   recognizedNet = max(0, netRevenue − cumulativeRefunded)
 *   cumulativeRefunded = min(recoveredValue, prevTotalRefunded + thisRefund)
 */
export function computeRefundNetting(opts: {
  recoveredValue: number
  netRevenue: number
  prevTotalRefunded: number
  refundAmount: number
  reason: 'refund' | 'cancelled'
}): RefundNettingResult {
  const { recoveredValue, netRevenue, prevTotalRefunded } = opts
  const thisRefund = opts.reason === 'cancelled'
    ? Math.max(0, recoveredValue)
    : Math.max(0, opts.refundAmount)
  const newTotalRefunded = Math.min(recoveredValue, prevTotalRefunded + thisRefund)
  const deltaRefunded = Math.max(0, newTotalRefunded - prevTotalRefunded)
  const recognizedNet = Math.max(0, netRevenue - newTotalRefunded)
  const fullyRefunded = recognizedNet <= 0
  return {
    newTotalRefunded,
    deltaRefunded,
    recognizedNet,
    fullyRefunded,
    analyticsRevenueDelta: deltaRefunded,
    analyticsCartsDelta: fullyRefunded ? -1 : 0,
  }
}

/** Alias that keeps docs/tests readable. */
export const recoveredRevenue = computeRefundNetting