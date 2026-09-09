// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL SAFETY LAYER — bargain/revenue engine
// ─────────────────────────────────────────────────────────────────────────────
// The merchant minimum price is a HARD, mathematical constraint that lives OUTSIDE
// the AI's authority. No prompt injection, no rounding trick, no coupon-stacking,
// no retry/replay and no race can push the charged price below the merchant floor.
//
// Every amount here is computed in INTEGER minor units (paise for INR, cents for
// other 2-decimal currencies) so floating-point drift cannot hide a breach. The
// discount *percentage* encoded into a Shopify code is a real number; the
// percentage alone cannot round its way below the floor once this layer returns
// an executable price.
//
// The invariant enforced here is:
//
//   chargeMinor(original, percent) >= floorMinor        (floor in minor units)
//
// where floorMinor is the merchant floor evaluated at the SAME authoritative price
// (the Shopify re-fetched price at acceptance time) and bulk-floored when the deal
// is quantity-bound.
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutablePrice =
  | {
      ok: true
      /** The price a single unit will actually be charged (currency units). */
      finalPrice: number
      /** Exact discount percentage (up to 2 decimals) to encode in Shopify. */
      discountPercent: number
      /** Charged unit price in minor units after applying `discountPercent`. */
      unitPriceMinor: number
      /** Merchant floor in minor units at the authoritative price. */
      floorMinor: number
      /**
       * Minimum order subtotal (minor units) the discount code requires.
       * Bound to the negotiated quantity so a bulk discount cannot be used
       * to undercut the single-unit floor on a 1-unit purchase.
       */
      minSubtotalMinor: number
      /** Quantity the deal is bound to (>= 1). */
      bulkQuantity: number
    }
  | {
      ok: false
      reason:
        | 'invalid_original_price'
        | 'invalid_final_price'
        | 'final_price_exceeds_original'
        | 'below_floor'
        | 'charge_below_floor_unresolvable'
      floorMinor: number
      finalPriceMinor: number
    }

const MAX_UNITS = 100

/** Convert a currency amount to integer minor units, rounding to the nearest minor. */
export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100)
}

/** Convert integer minor units back to a clean 2-decimal currency amount. */
export function fromMinorUnits(minor: number): number {
  return Math.round(minor) / 100
}

/** Clamp a percentage into the valid [0, 100] range. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  const rounded = Math.round(percent * 100) / 100
  return Math.min(100, Math.max(0, rounded))
}

/**
 * Exact percentage that maps `original` -> `target`, to 2 decimals.
 * Round-trips: consuming `exactPercentOff(o, t)` with `orig` reproduces
 * `t` when `t >= floor` at the same price basis.
 */
export function exactPercentOff(original: number, target: number): number {
  if (!Number.isFinite(original) || original <= 0 || !Number.isFinite(target) || target <= 0) return 0
  return clampPercent((1 - target / original) * 100)
}

/**
 * Charged unit price in minor units for `original * (1 - percent/100)`,
 * rounding the final product to the nearest minor unit exactly as Shopify
 * computes a percentage discount on an item price.
 */
export function chargedUnitPriceMinor(original: number, percent: number): number {
  if (!Number.isFinite(original) || original <= 0) return 0
  const unitMinor = Math.round(original * 100)
  const remainingFraction = 1 - clampPercent(percent) / 100
  return Math.round(unitMinor * remainingFraction)
}

/** True when the charged unit price stays at or above the merchant floor. */
export function isAtOrAboveFloor(unitPriceMinor: number, floorMinor: number, toleranceMinor = 0): boolean {
  return unitPriceMinor >= floorMinor - toleranceMinor
}

/**
 * Validate the floor invariant: does `finalPrice` clear `floorPrice` at the
 * given price basis? Exported for the accept route's pre-check so tampered or
 * stale sessions fail fast with a precise reason.
 */
export function checkFloor(
  originalPrice: number,
  finalPrice: number,
  floorPrice: number
): { ok: boolean; reason?: string } {
  const finalMinor = toMinorUnits(finalPrice)
  const floorMinor = toMinorUnits(floorPrice)
  if (finalMinor < floorMinor) return { ok: false, reason: 'below_floor' }
  if (finalMinor > toMinorUnits(originalPrice)) return { ok: false, reason: 'final_price_exceeds_original' }
  return { ok: true }
}

/**
 * Build an executable, floor-safe price from (original, final, floor, bulk).
 *
 * Semantics:
 *  - `originalPrice` is the AUTHORITATIVE current price (re-fetched at accept).
 *  - `finalPrice` is what the customer agreed to.
 *  - `floorPrice` is the merchant floor evaluated at `originalPrice` (bulk-aware).
 *  - `bulkQuantity` binds the discount to a minimum quantity so a bulk-negotiated
 *    per-unit price can't be used on a 1-unit purchase below the single-unit floor.
 *
 * Returns `ok:false` when the agreement breaches the floor (stale/tampered
 * session) — the caller must REJECT, never silently charge the higher floor.
 * The only time the returned finalPrice differs from the input is the pure
 * rounding-correction path: inputs that clear the floor in minor units but whose
 * percent-encoding would round a hair below it are re-derived exactly at the
 * floor (a rounding artifact, not a negotiation concession).
 */
export function buildExecutablePrice(opts: {
  originalPrice: number
  finalPrice: number
  floorPrice: number
  bulkQuantity?: number | null
}): ExecutablePrice {
  const originalMinor = toMinorUnits(opts.originalPrice)
  const finalMinor = toMinorUnits(opts.finalPrice)
  const floorMinor = toMinorUnits(opts.floorPrice)
  const bulk = Math.min(MAX_UNITS, Math.max(1, Math.floor(opts.bulkQuantity ?? 1)))

  if (originalMinor <= 0) return { ok: false, reason: 'invalid_original_price', floorMinor, finalPriceMinor: finalMinor }
  if (finalMinor <= 0) return { ok: false, reason: 'invalid_final_price', floorMinor, finalPriceMinor: finalMinor }
  if (finalMinor > originalMinor) {
    return { ok: false, reason: 'final_price_exceeds_original', floorMinor, finalPriceMinor: finalMinor }
  }

  // Hard financial invariant: the agreed price must clear the merchant floor.
  if (finalMinor < floorMinor) {
    return { ok: false, reason: 'below_floor', floorMinor, finalPriceMinor: finalMinor }
  }

  // Express the deal as an exact percentage of the authoritative price.
  const percent = exactPercentOff(opts.originalPrice, opts.finalPrice)
  const chargeMinor = chargedUnitPriceMinor(opts.originalPrice, percent)

  // Percentage-encoding safety net: even though `finalMinor >= floorMinor`,
  // the percent's 2-decimal rounding could shift the charged amount a hair
  // below the floor. Re-derive AT the floor (never below it).
  if (!isAtOrAboveFloor(chargeMinor, floorMinor)) {
    const percentAtFloor = exactPercentOff(opts.originalPrice, fromMinorUnits(floorMinor))
    const chargeAtFloor = chargedUnitPriceMinor(opts.originalPrice, percentAtFloor)
    if (!isAtOrAboveFloor(chargeAtFloor, floorMinor)) {
      // e.g. unit price < 0.01 — cannot express a floor in minor units at all.
      return { ok: false, reason: 'charge_below_floor_unresolvable', floorMinor, finalPriceMinor: chargeAtFloor }
    }
    return {
      ok: true,
      finalPrice: fromMinorUnits(chargeAtFloor),
      discountPercent: percentAtFloor,
      unitPriceMinor: chargeAtFloor,
      floorMinor,
      minSubtotalMinor: originalMinor * bulk,
      bulkQuantity: bulk,
    }
  }

  return {
    ok: true,
    finalPrice: fromMinorUnits(chargeMinor),
    discountPercent: percent,
    unitPriceMinor: chargeMinor,
    floorMinor,
    minSubtotalMinor: originalMinor * bulk,
    bulkQuantity: bulk,
  }
}

/**
 * Guard FOR ORDER-LEVEL discount codes (whole-cart percentage). A percentage off
 * the entire order discounts unrelated products, so the discount depth is clamped
 * to what the margin floor allows for the featured product. Returns the safe
 * percent (2 decimals) or an error when the requested depth exceeds the margin.
 */
export function clampOrderPercentForProduct(opts: {
  originalPrice: number
  floorPrice: number
  requestedPercent: number
}): { ok: true; percent: number } | { ok: false; reason: 'below_floor' | 'invalid_input'; maxPercent: number } {
  const { originalPrice, floorPrice, requestedPercent } = opts
  if (!Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isFinite(floorPrice) || floorPrice <= 0) {
    return { ok: false, reason: 'invalid_input', maxPercent: 0 }
  }
  const maxPercent = exactPercentOff(originalPrice, Math.min(floorPrice, originalPrice))
  if (!Number.isFinite(requestedPercent) || requestedPercent < 0 || requestedPercent > 100) {
    return { ok: false, reason: 'invalid_input', maxPercent }
  }
  const requested = Math.round(requestedPercent * 100) / 100
  if (requested > maxPercent) {
    return { ok: false, reason: 'below_floor', maxPercent }
  }
  return { ok: true, percent: requested }
}