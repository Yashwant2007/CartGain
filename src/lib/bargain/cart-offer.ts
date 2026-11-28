import type { BargainCartMode, CartContext } from '@/lib/bargain/cart-context'

export type CartOfferKind = 'percentage' | 'fixed' | 'bundle'

export interface CartOfferInput {
  mode: BargainCartMode
  context: CartContext
  requestedPercent?: number | null
  requestedAmount?: number | null
  floorTotal: number
  minOrderValue?: number | null
  shippingCost?: number | null
  paymentSurcharge?: number | null
}

export interface CartLineAdjustment {
  lineId: string
  discountAmount: number
  finalLineTotal: number
}

export interface CartOffer {
  kind: CartOfferKind
  subtotal: number
  discountAmount: number
  finalTotal: number
  percentOff: number
  quantity: number
  floorTotal: number
  shippingCost: number
  paymentSurcharge: number
  payableTotal: number
  lineAdjustments: CartLineAdjustment[]
}

export type CartOfferFailureReason =
  | 'INVALID_CONTEXT'
  | 'BELOW_FLOOR'
  | 'ABOVE_SUBTOTAL'
  | 'BELOW_MIN_ORDER'
  | 'INVALID_REQUEST'
  | 'NO_MULTI_ITEM'

export type CartOfferResult =
  | { ok: true; offer: CartOffer }
  | { ok: false; reason: CartOfferFailureReason }

const MAX_MINOR = 100_000_000_000

function toMinor(amount: number): number {
  return Math.round(amount * 100)
}

function fromMinor(minor: number): number {
  return Math.round(minor) / 100
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) return Number(value)
  return NaN
}

function amountOr(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === '') return fallback
  const n = numeric(value)
  if (!Number.isFinite(n) || n < 0 || toMinor(n) > MAX_MINOR) return null
  return fromMinor(toMinor(n))
}

function failure(reason: CartOfferFailureReason): CartOfferResult {
  return { ok: false, reason }
}

function allocateDiscount(target: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
  if (target <= 0 || weightTotal <= 0) return weights.map(() => 0)
  const out = weights.map((weight, index) =>
    index === weights.length - 1 ? 0 : Math.min(weight, Math.floor((target * weight) / weightTotal)),
  )
  let remaining = target - out.reduce((sum, value) => sum + value, 0)
  for (let index = weights.length - 1; index >= 0 && remaining > 0; index--) {
    const add = Math.min(weights[index] - out[index], remaining)
    out[index] += add
    remaining -= add
  }
  return out
}

export function computeCartOffer(input: CartOfferInput): CartOfferResult {
  if (!input || !input.context || typeof input.context !== 'object') return failure('INVALID_CONTEXT')
  const context: CartContext = input.context
  if (
    !Number.isFinite(context.subtotal) ||
    context.subtotal <= 0 ||
    !Array.isArray(context.lines) ||
    context.lines.length === 0
  ) {
    return failure('INVALID_CONTEXT')
  }

  const subtotalMinor = toMinor(context.subtotal)
  if (subtotalMinor <= 0 || subtotalMinor > MAX_MINOR) return failure('INVALID_CONTEXT')

  const lineTotals = context.lines.map((line) => {
    if (!line || typeof line.lineId !== 'string' || !line.lineId) return -1
    if (!Number.isFinite(line.lineTotal) || line.lineTotal < 0) return -1
    const minor = toMinor(line.lineTotal)
    return minor >= 0 && minor <= MAX_MINOR ? minor : -1
  })
  if (lineTotals.some((minor) => minor < 0)) return failure('INVALID_CONTEXT')
  const lineTotalSum = lineTotals.reduce((sum, minor) => sum + minor, 0)
  if (lineTotalSum <= 0 || subtotalMinor > lineTotalSum + 1) return failure('INVALID_CONTEXT')

  const mode: BargainCartMode = input.mode
  if (mode !== 'cart_percentage' && mode !== 'cart_fixed' && mode !== 'bundle') {
    return failure('INVALID_REQUEST')
  }
  if (mode === 'bundle' && context.lines.length < 2) return failure('NO_MULTI_ITEM')

  const floor = amountOr(input.floorTotal, NaN)
  const minOrder = amountOr(input.minOrderValue, 0)
  const shipping = amountOr(input.shippingCost, 0)
  const surcharge = amountOr(input.paymentSurcharge, 0)
  if (floor === null || minOrder === null || shipping === null || surcharge === null) {
    return failure('INVALID_REQUEST')
  }
  const floorMinor = toMinor(floor)
  if (floorMinor > subtotalMinor + 1) return failure('INVALID_REQUEST')
  if (subtotalMinor < toMinor(minOrder)) return failure('BELOW_MIN_ORDER')

  const percentRaw = input.requestedPercent
  const amountRaw = input.requestedAmount
  const percent =
    percentRaw === undefined || percentRaw === null
      ? null
      : (() => {
          const n = numeric(percentRaw)
          return Number.isFinite(n) && n >= 1 && n <= 90 ? n : NaN
        })()
  if (percentRaw !== undefined && percentRaw !== null && Number.isNaN(percent)) {
    return failure('INVALID_REQUEST')
  }

  const requestedAmount =
    amountRaw === undefined || amountRaw === null ? null : (() => {
      const n = numeric(amountRaw)
      if (!Number.isFinite(n) || n <= 0 || toMinor(n) > MAX_MINOR) return NaN
      return fromMinor(toMinor(n))
    })()
  if (amountRaw !== undefined && amountRaw !== null && Number.isNaN(requestedAmount)) {
    return failure('INVALID_REQUEST')
  }
  if (requestedAmount !== null && toMinor(requestedAmount) > subtotalMinor) {
    return failure('ABOVE_SUBTOTAL')
  }

  let kind: CartOfferKind
  let discountMinor: number
  if (mode === 'cart_percentage') {
    if (percent === null) return failure('INVALID_REQUEST')
    kind = 'percentage'
    discountMinor = Math.round((subtotalMinor * percent) / 100)
  } else if (mode === 'cart_fixed') {
    if (requestedAmount === null) return failure('INVALID_REQUEST')
    kind = 'fixed'
    discountMinor = toMinor(requestedAmount)
  } else if (mode === 'bundle') {
    if (percent !== null) {
      kind = 'bundle'
      discountMinor = Math.round((subtotalMinor * percent) / 100)
    } else if (requestedAmount !== null) {
      kind = 'bundle'
      discountMinor = toMinor(requestedAmount)
    } else {
      return failure('INVALID_REQUEST')
    }
  } else {
    return failure('INVALID_REQUEST')
  }

  if (discountMinor <= 0 || discountMinor > subtotalMinor) return failure('INVALID_REQUEST')
  const finalMinor = subtotalMinor - discountMinor
  if (finalMinor < floorMinor) return failure('BELOW_FLOOR')

  const impliedPercent = round2((discountMinor * 100) / subtotalMinor)
  if (impliedPercent > 90) return failure('INVALID_REQUEST')
  const percentOff = percent === null ? impliedPercent : round2(percent)

  const payableMinor = finalMinor + toMinor(shipping) + toMinor(surcharge)
  if (payableMinor > MAX_MINOR) return failure('INVALID_REQUEST')

  const allocated = allocateDiscount(discountMinor, lineTotals)
  const lineAdjustments: CartLineAdjustment[] = context.lines.map((line, index) => ({
    lineId: line.lineId,
    discountAmount: fromMinor(allocated[index]),
    finalLineTotal: fromMinor(lineTotals[index] - allocated[index]),
  }))

  return {
    ok: true,
    offer: {
      kind,
      subtotal: fromMinor(subtotalMinor),
      discountAmount: fromMinor(discountMinor),
      finalTotal: fromMinor(finalMinor),
      percentOff,
      quantity: context.lines.reduce((sum, line) => sum + Math.floor(line.quantity), 0),
      floorTotal: fromMinor(floorMinor),
      shippingCost: fromMinor(toMinor(shipping)),
      paymentSurcharge: fromMinor(toMinor(surcharge)),
      payableTotal: fromMinor(payableMinor),
      lineAdjustments,
    },
  }
}

export function formatCartOfferSummary(offer: CartOffer | null | undefined): string {
  if (!offer || !Number.isFinite(offer.finalTotal)) return 'Cart offer unavailable.'
  const label = Number.isFinite(offer.percentOff) ? `${round2(offer.percentOff)}% off` : 'Cart offer'
  return `${label}: ${offer.discountAmount.toFixed(2)} saved, ${offer.finalTotal.toFixed(2)} total before any shipping or payment charges.`
}

export function assertCartOfferIntegrity(offer: CartOffer | null | undefined): boolean {
  if (!offer || typeof offer !== 'object') return false
  const numericFields = [
    offer.subtotal,
    offer.discountAmount,
    offer.finalTotal,
    offer.percentOff,
    offer.floorTotal,
    offer.shippingCost,
    offer.paymentSurcharge,
    offer.payableTotal,
  ]
  if (numericFields.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    return false
  }
  if (!Number.isInteger(offer.quantity) || offer.quantity < 1) return false
  if (!Array.isArray(offer.lineAdjustments) || offer.lineAdjustments.length === 0) return false

  const subtotal = toMinor(offer.subtotal)
  const discount = toMinor(offer.discountAmount)
  const final = toMinor(offer.finalTotal)
  if (subtotal <= 0 || discount <= 0 || discount > subtotal) return false
  if (Math.abs(subtotal - discount - final) > 1) return false
  if (final < toMinor(offer.floorTotal) - 1) return false

  const implied = round2((discount * 100) / subtotal)
  if (Math.abs(offer.percentOff - implied) > 0.011) return false
  const roundTrip = Math.round(subtotal * (1 - offer.percentOff / 100))
  if (Math.abs(roundTrip - final) > 1) return false

  const expectedPayable = toMinor(offer.finalTotal) + toMinor(offer.shippingCost) + toMinor(offer.paymentSurcharge)
  if (Math.abs(toMinor(offer.payableTotal) - expectedPayable) > 1) return false

  let allocated = 0
  for (const adjustment of offer.lineAdjustments) {
    if (!adjustment || typeof adjustment.lineId !== 'string' || !adjustment.lineId) return false
    if (
      !Number.isFinite(adjustment.discountAmount) ||
      !Number.isFinite(adjustment.finalLineTotal) ||
      adjustment.discountAmount < 0 ||
      adjustment.finalLineTotal < 0
    ) {
      return false
    }
    allocated += toMinor(adjustment.discountAmount)
  }
  return Math.abs(allocated - discount) <= 1
}
