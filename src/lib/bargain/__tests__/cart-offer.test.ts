import { normalizeCartContext, type CartContext } from '@/lib/bargain/cart-context'
import {
  computeCartOffer,
  formatCartOfferSummary,
  assertCartOfferIntegrity,
  type CartOfferInput,
} from '@/lib/bargain/cart-offer'

const context = (over: Record<string, unknown> = {}): CartContext => {
  const result = normalizeCartContext({
    platform: 'shopify',
    cartToken: 'tok',
    cartId: 'cid',
    currency: 'INR',
    lines: [
      { lineId: 'l1', title: 'A', quantity: 1, unitPrice: 600 },
      { lineId: 'l2', title: 'B', quantity: 1, unitPrice: 400 },
    ],
    ...over,
  })
  if (!result) throw new Error('fixture rejected')
  return result
}

const base = (over: Partial<CartOfferInput> = {}): CartOfferInput => ({
  mode: 'cart_percentage',
  context: context(),
  requestedPercent: 10,
  floorTotal: 800,
  ...over,
})

describe('computeCartOffer — percentage', () => {
  it('computes a floor-safe offer with proportional line allocation', () => {
    const result = computeCartOffer(base({ shippingCost: 49, paymentSurcharge: 1 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const offer = result.offer
    expect(offer.kind).toBe('percentage')
    expect(offer.subtotal).toBe(1000)
    expect(offer.discountAmount).toBe(100)
    expect(offer.finalTotal).toBe(900)
    expect(offer.percentOff).toBe(10)
    expect(offer.payableTotal).toBe(950)
    expect(offer.lineAdjustments).toEqual([
      { lineId: 'l1', discountAmount: 60, finalLineTotal: 540 },
      { lineId: 'l2', discountAmount: 40, finalLineTotal: 360 },
    ])
    expect(assertCartOfferIntegrity(offer)).toBe(true)
  })

  it('allows a final total exactly at the floor but rejects below it', () => {
    expect(computeCartOffer(base({ floorTotal: 900 })).ok).toBe(true)
    expect(computeCartOffer(base({ floorTotal: 900.01 }))).toEqual({ ok: false, reason: 'BELOW_FLOOR' })
  })

  it('rejects percentages outside 1..90 and missing percentages', () => {
    expect(computeCartOffer(base({ requestedPercent: 0 }))).toEqual({ ok: false, reason: 'INVALID_REQUEST' })
    expect(computeCartOffer(base({ requestedPercent: 91 }))).toEqual({ ok: false, reason: 'INVALID_REQUEST' })
    expect(computeCartOffer(base({ requestedPercent: undefined }))).toEqual({ ok: false, reason: 'INVALID_REQUEST' })
  })

  it('lets the last line absorb the integer rounding remainder', () => {
    const result = computeCartOffer(
      base({
        context: context({
          lines: [
            { lineId: 'a', unitPrice: 333.33, quantity: 1 },
            { lineId: 'b', unitPrice: 333.33, quantity: 1 },
            { lineId: 'c', unitPrice: 333.34, quantity: 1 },
          ],
        }),
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const discounts = result.offer.lineAdjustments.map((line) => Math.round(line.discountAmount * 100))
    expect(discounts).toEqual([3333, 3333, 3334])
    expect(discounts.reduce((sum, value) => sum + value, 0)).toBe(Math.round(result.offer.discountAmount * 100))
    expect(assertCartOfferIntegrity(result.offer)).toBe(true)
  })
})

describe('computeCartOffer — fixed and bundle', () => {
  it('computes a fixed discount and derives the displayed percentage', () => {
    const result = computeCartOffer(base({ mode: 'cart_fixed', requestedPercent: undefined, requestedAmount: 150 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.offer.kind).toBe('fixed')
    expect(result.offer.discountAmount).toBe(150)
    expect(result.offer.finalTotal).toBe(850)
    expect(result.offer.percentOff).toBe(15)
    expect(assertCartOfferIntegrity(result.offer)).toBe(true)
  })

  it('rejects fixed amounts above subtotal and non-positive amounts', () => {
    expect(
      computeCartOffer(base({ mode: 'cart_fixed', requestedPercent: undefined, requestedAmount: 1200 })),
    ).toEqual({ ok: false, reason: 'ABOVE_SUBTOTAL' })
    expect(
      computeCartOffer(base({ mode: 'cart_fixed', requestedPercent: undefined, requestedAmount: 0 })),
    ).toEqual({ ok: false, reason: 'INVALID_REQUEST' })
  })

  it('requires at least two lines for a bundle and allocates its discount', () => {
    const result = computeCartOffer(
      base({
        mode: 'bundle',
        context: context({ lines: [{ lineId: 'l1', title: 'A', quantity: 1, unitPrice: 600 }] }),
        requestedPercent: 12,
      }),
    )
    expect(result).toEqual({ ok: false, reason: 'NO_MULTI_ITEM' })

    const valid = computeCartOffer(base({ mode: 'bundle', requestedPercent: 12 }))
    expect(valid.ok).toBe(true)
    if (!valid.ok) return
    expect(valid.offer.kind).toBe('bundle')
    expect(valid.offer.discountAmount).toBe(120)
    expect(valid.offer.finalTotal).toBe(880)
    expect(assertCartOfferIntegrity(valid.offer)).toBe(true)
  })
})

describe('computeCartOffer — guards', () => {
  it('enforces the minimum order value', () => {
    expect(computeCartOffer(base({ minOrderValue: 1100 }))).toEqual({ ok: false, reason: 'BELOW_MIN_ORDER' })
    expect(computeCartOffer(base({ minOrderValue: 1000 })).ok).toBe(true)
  })

  it('rejects invalid contexts, floors and modes', () => {
    expect(computeCartOffer(base({ context: { ...context(), subtotal: NaN } }))).toEqual({
      ok: false,
      reason: 'INVALID_CONTEXT',
    })
    expect(computeCartOffer(base({ context: { ...context(), lines: [] } }))).toEqual({
      ok: false,
      reason: 'INVALID_CONTEXT',
    })
    expect(computeCartOffer(base({ floorTotal: NaN }))).toEqual({ ok: false, reason: 'INVALID_REQUEST' })
    expect(computeCartOffer(base({ mode: 'product_only' }))).toEqual({ ok: false, reason: 'INVALID_REQUEST' })
  })
})

describe('offer presentation and integrity', () => {
  it('formats a short customer-safe summary without the floor', () => {
    const result = computeCartOffer(base({ floorTotal: 777.77 }))
    if (!result.ok) throw new Error('fixture rejected')
    const summary = formatCartOfferSummary(result.offer)
    expect(summary).toContain('10% off')
    expect(summary).toContain('900.00 total')
    expect(summary).not.toContain('777.77')
    expect(summary.length).toBeLessThan(200)
    expect(formatCartOfferSummary(null)).toBe('Cart offer unavailable.')
  })

  it('detects tampered totals, percentages and allocations', () => {
    const result = computeCartOffer(base())
    if (!result.ok) throw new Error('fixture rejected')
    const offer = result.offer
    expect(assertCartOfferIntegrity(offer)).toBe(true)
    expect(assertCartOfferIntegrity({ ...offer, finalTotal: offer.finalTotal + 1 })).toBe(false)
    expect(assertCartOfferIntegrity({ ...offer, payableTotal: offer.payableTotal + 5 })).toBe(false)
    expect(assertCartOfferIntegrity({ ...offer, percentOff: 50 })).toBe(false)
    expect(
      assertCartOfferIntegrity({
        ...offer,
        lineAdjustments: [{ lineId: 'l1', discountAmount: 99, finalLineTotal: 501 }, ...offer.lineAdjustments.slice(1)],
      }),
    ).toBe(false)
    expect(assertCartOfferIntegrity(null)).toBe(false)
  })
})
