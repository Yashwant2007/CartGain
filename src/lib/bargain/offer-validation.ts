// AI Salesperson — offer validation with machine-readable reason codes.
//
// Deterministic pre-acceptance gate. It turns every non-acceptable outcome into
// a stable, machine-readable `reason` the widget/dashboard can act on, and it
// re-checks hard prerequisites (availability, campaign window, coupon stacking,
// attempt budget) that a greedy model accept should never side-step. It does NOT
// replace the existing financial floor clamp (buildExecutablePrice) — it runs
// alongside it so a reason code always accompanies a rejection.

export type OfferValidationReason =
  | 'OFFER_ACCEPTED'
  | 'INVALID_PRICE'
  | 'BELOW_FLOOR_REJECTED'
  | 'NEGOTIATION_LIMIT_REACHED'
  | 'VARIANT_UNAVAILABLE'
  | 'PRODUCT_UNAVAILABLE'
  | 'CAMPAIGN_EXPIRED'
  | 'COUPON_STACKING_BLOCKED'

export interface ValidateOfferInput {
  requestedPrice: number
  originalPrice: number
  floorPrice: number
  attemptsUsed?: number
  maxAttempts?: number
  variantAvailable?: boolean | null
  productAvailable?: boolean | null
  campaignActive?: boolean | null
  couponMentioned?: boolean
  couponsAllowed?: boolean
}

export interface OfferValidationResult {
  ok: boolean
  reason: OfferValidationReason | null
  requestedPrice: number
  originalPrice: number
  floorPrice: number
  /** Mapped reply the customer-facing layer may use (not a floor reveal). */
  message: string | null
}

const HUMAN: Record<OfferValidationReason, string | null> = {
  OFFER_ACCEPTED: null,
  INVALID_PRICE: 'That price doesn\'t look right — let\'s agree on a clean number.',
  BELOW_FLOOR_REJECTED: 'The listed price may have changed — please refresh and renegotiate.',
  NEGOTIATION_LIMIT_REACHED: 'This conversation has reached its deal limit.',
  VARIANT_UNAVAILABLE: 'That specific option isn\'t available right now — ask about another variant.',
  PRODUCT_UNAVAILABLE: 'This item is currently unavailable — let\'s find a similar one.',
  CAMPAIGN_EXPIRED: 'That offer window has ended — a fresh deal can be started anytime.',
  COUPON_STACKING_BLOCKED: 'This price can\'t be combined with another discount code.',
}

export function validateOffer(input: ValidateOfferInput): OfferValidationResult {
  const base = {
    requestedPrice: input.requestedPrice,
    originalPrice: input.originalPrice,
    floorPrice: input.floorPrice,
    message: null as string | null,
  }

  const reject = (reason: OfferValidationReason): OfferValidationResult => ({
    ok: false,
    reason,
    ...base,
    message: HUMAN[reason],
  })

  if (
    !Number.isFinite(input.requestedPrice) ||
    input.requestedPrice <= 0 ||
    input.requestedPrice > input.originalPrice * 2 ||
    input.requestedPrice < input.originalPrice * 0.001
  ) {
    return reject('INVALID_PRICE')
  }

  if (input.couponMentioned && input.couponsAllowed === false) {
    return reject('COUPON_STACKING_BLOCKED')
  }
  if (input.campaignActive === false) {
    return reject('CAMPAIGN_EXPIRED')
  }
  if (input.productAvailable === false) {
    return reject('PRODUCT_UNAVAILABLE')
  }
  if (input.variantAvailable === false) {
    return reject('VARIANT_UNAVAILABLE')
  }
  if (input.attemptsUsed != null && input.maxAttempts != null && input.attemptsUsed >= input.maxAttempts) {
    return reject('NEGOTIATION_LIMIT_REACHED')
  }
  if (input.requestedPrice < input.floorPrice) {
    return reject('BELOW_FLOOR_REJECTED')
  }

  return {
    ok: true,
    reason: 'OFFER_ACCEPTED',
    ...base,
  }
}