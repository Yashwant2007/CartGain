import { buildQuickOffers } from '../offers'

describe('buildQuickOffers (floor-safe offer suggestions)', () => {
  it('returns the server counter first when the negotiation is live', () => {
    const offers = buildQuickOffers({
      lastCounter: 450,
      listedPrice: 500,
      sessionEnded: false,
      decision: 'counter',
    })
    expect(offers[0]).toBe(450)
    expect(offers.length).toBeGreaterThanOrEqual(1)
  })

  it('only derives chip values from the listed price + conservative discounts', () => {
    const listedPrice = 1000
    const offers = buildQuickOffers({
      lastCounter: null,
      listedPrice,
      sessionEnded: false,
      decision: 'idle',
    })
    // 11% → 890, 15% → 850 — both are LISTED-price maths, never floor data.
    expect(offers).toEqual([890, 850])
    for (const v of offers) {
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(listedPrice)
      // No suggested value may ever sit below the listed-price discounts
      // (a floor-derived chip would be able to undercut the merchant floor).
      expect(v).toBeGreaterThanOrEqual(Math.round(listedPrice * 0.85))
    }
  })

  it('keeps the served counter even if it is a deep discount (server-trusted)', () => {
    const offers = buildQuickOffers({
      lastCounter: 350,
      listedPrice: 1000,
      sessionEnded: false,
      decision: 'counter',
    })
    // The server put 350 on the table — prefill it verbatim (it IS the offer
    // the shopkeeper made; no client-side floor can be lower than it).
    expect(offers[0]).toBe(350)
  })

  it('drops the counter once the session is terminal or accepted', () => {
    expect(
      buildQuickOffers({ lastCounter: 450, listedPrice: 500, sessionEnded: true, decision: 'idle' }),
    ).toEqual([445, 425])
    expect(
      buildQuickOffers({ lastCounter: 450, listedPrice: 500, sessionEnded: false, decision: 'accept' }),
    ).toEqual([445, 425])
  })

  it('caps the chip count at three', () => {
    const offers = buildQuickOffers({
      lastCounter: 450,
      listedPrice: 500,
      sessionEnded: false,
      decision: 'counter',
    })
    expect(offers.length).toBeLessThanOrEqual(3)
  })

  it('never emits values for a non-positive listed price', () => {
    const offers = buildQuickOffers({
      lastCounter: null,
      listedPrice: 0,
      sessionEnded: false,
      decision: 'idle',
    })
    expect(offers).toEqual([])
  })
})