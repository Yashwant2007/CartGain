import { alignStatedOfferPrice, rewriteStatedPrice, stripUnverifiedProductClaims, type NegotiationContext } from '@/lib/services/bargain'

const bulkCtx = {
  currencySymbol: '₹',
  originalPrice: 999,
  bulkQuantity: 2,
  customerOfferTotal: 1000,
} as NegotiationContext

describe('rewriteStatedPrice', () => {
  it('rewrites plain and grouped money figures to the real counter', () => {
    expect(rewriteStatedPrice('How about ₹2,200?', 2200, 2453.5)).toBe('How about ₹2,453.5?')
    expect(rewriteStatedPrice('I can do Rs 2200', 2200, 2453.5)).toBe('I can do Rs 2453.5')
  })

  it('preserves the decimal style used in the reply', () => {
    expect(rewriteStatedPrice('Let us settle at ₹2,200.00.', 2200, 2453.5)).toBe(
      'Let us settle at ₹2,453.50.',
    )
  })

  it('never rewrites a larger number that merely contains the old figure', () => {
    expect(rewriteStatedPrice('The bundle is ₹22,000.', 2200, 2453.5)).toBe(
      'The bundle is ₹22,000.',
    )
  })

  it('is a no-op when the stated price already matches', () => {
    expect(rewriteStatedPrice('₹2,453.50 is fair', 2453.5, 2453.5)).toBe(
      '₹2,453.50 is fair',
    )
  })
})

describe('alignStatedOfferPrice', () => {
  it('aligns invented bulk totals with the authoritative total and counter', () => {
    const aligned = alignStatedOfferPrice(
      "I understand you're aiming for ₹1500 total. The lowest I can move to is ₹1979.54 for both units.",
      979.54,
      bulkCtx,
      500,
    )

    expect(aligned).toContain('₹1,000 total')
    expect(aligned).toContain('₹1,959.08 total')
    expect(aligned).toContain('₹979.54 per unit')
    expect(aligned).not.toContain('₹1500')
    expect(aligned).not.toContain('₹1979.54')
  })

  it('leaves an already consistent bulk quote untouched', () => {
    const reply = '₹979.54 per unit, ₹1,959.08 total.'
    expect(alignStatedOfferPrice(reply, 979.54, bulkCtx, 500)).toBe(reply)
  })

  it('labels a single counter as both per-unit and total for a bulk order', () => {
    const aligned = alignStatedOfferPrice(
      'I can meet you at ₹914.16 for the two units.',
      914.16,
      { ...bulkCtx, customerOfferTotal: 1800 },
      900,
    )

    expect(aligned).toContain('₹914.16 per unit (₹1,828.32 total)')
  })
})

describe('stripUnverifiedProductClaims', () => {
  it('removes invented warranty and quality claims', () => {
    expect(stripUnverifiedProductClaims(
      'I can meet you at ₹914.16 for the two units, reflecting the quality components and a two‑year warranty.',
      bulkCtx,
    )).toBe('I can meet you at ₹914.16 for the two units.')
  })

  it('keeps verified warranty claims', () => {
    const reply = 'It comes with a two-year warranty.'
    const ctx = { ...bulkCtx, product: { description: 'Two-year warranty included.' } } as NegotiationContext

    expect(stripUnverifiedProductClaims(reply, ctx)).toBe(reply)
  })
})
