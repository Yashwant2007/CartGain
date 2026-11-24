import { isSameSkuTotalPhrase, parseStructuredOffer } from '../offer-structure'

describe('structured offer interpretation', () => {
  it('treats a plain number as a single-unit offer', () => {
    expect(parseStructuredOffer('can you do 800')).toMatchObject({
      rawAmount: 800,
      unitPrice: 800,
      totalAmount: 800,
      quantity: 1,
      basis: 'single',
      needsClarification: false,
    })
  })

  it('treats an explicit per-unit amount as one unit repeated by quantity', () => {
    expect(parseStructuredOffer('₹500 each for 2')).toMatchObject({
      unitPrice: 500,
      totalAmount: 1000,
      quantity: 2,
      basis: 'per_unit',
      needsClarification: false,
    })
  })

  it('reads a same-sku total amount as the order total, not a second product', () => {
    const offer = parseStructuredOffer('₹1000 for both', null, 699.95)
    expect(offer).toMatchObject({
      rawAmount: 1000,
      unitPrice: 500,
      totalAmount: 1000,
      quantity: 2,
      basis: 'total',
      needsClarification: false,
      listTotal: 1399.9,
      savingsAmount: 399.9,
    })
    expect(offer.discountPercent).toBeCloseTo(28.57, 2)
    expect(isSameSkuTotalPhrase('₹1000 for both')).toBe(true)
  })

  it('preserves every minor unit of a repeated total', () => {
    expect(parseStructuredOffer('₹1000 for three')).toMatchObject({
      unitPrice: 333.33,
      totalAmount: 1000,
      quantity: 3,
      basis: 'total',
    })
  })

  it('asks for clarification when decimal amount basis is unclear', () => {
    expect(parseStructuredOffer('₹699.95 final', 2, 699.95)).toMatchObject({
      unitPrice: null,
      totalAmount: 699.95,
      quantity: 2,
      basis: 'unclear',
      needsClarification: true,
    })
  })

  it('asks for clarification for a multi-unit amount without per-unit or total wording', () => {
    expect(parseStructuredOffer('2 units at 700')).toMatchObject({
      quantity: 2,
      basis: 'unclear',
      needsClarification: true,
    })
  })

  it('reads a reversed same-sku total phrase', () => {
    expect(parseStructuredOffer('both for 1000', null, 700)).toMatchObject({
      unitPrice: 500,
      totalAmount: 1000,
      quantity: 2,
      basis: 'total',
      needsClarification: false,
      discountPercent: 28.57,
    })
  })

  it('keeps a quantity-only turn free of price claims', () => {
    expect(parseStructuredOffer('I need 10 units', null, 1000)).toMatchObject({
      rawAmount: null,
      unitPrice: null,
      totalAmount: null,
      quantity: 10,
      basis: 'none',
      needsClarification: false,
    })
  })

  it('keeps casual version numbers out of offer interpretation', () => {
    expect(parseStructuredOffer('gta 6 is going to be wild')).toMatchObject({
      rawAmount: null,
      basis: 'none',
      needsClarification: false,
    })
  })

  it('reports no savings for a generous over-list offer', () => {
    expect(parseStructuredOffer('can you do 1500', null, 1000)).toMatchObject({
      rawAmount: 1500,
      unitPrice: 1500,
      basis: 'single',
      savingsAmount: 0,
      discountPercent: 0,
    })
  })
})
