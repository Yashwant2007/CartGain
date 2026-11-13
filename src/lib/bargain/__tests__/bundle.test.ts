import {
  floorSafeDiscountPercent,
  buildBundle,
  validateBundleOffer,
  allocateDiscount,
  bundleSummary,
  type BundleItem,
} from '../bundle'

const item = (over: Partial<BundleItem>): BundleItem => ({
  productId: 'p1',
  title: 'Item',
  price: 100,
  floor: 80,
  quantity: 1,
  ...over,
})

describe('floorSafeDiscountPercent', () => {
  it('caps the % at the tightest per-item margin', () => {
    // item A allows 20% off (100→80), item B only 10% (100→90)
    const items = [item({ productId: 'a', price: 100, floor: 80 }), item({ productId: 'b', price: 100, floor: 90 })]
    expect(floorSafeDiscountPercent(items, 30)).toBe(10)
  })
  it('never exceeds the desired percent', () => {
    const items = [item({ productId: 'a', price: 100, floor: 50 })]
    expect(floorSafeDiscountPercent(items, 15)).toBe(15)
  })
  it('is 0 when an item has no margin', () => {
    const items = [item({ productId: 'a', price: 100, floor: 100 })]
    expect(floorSafeDiscountPercent(items, 20)).toBe(0)
  })
})

describe('buildBundle', () => {
  it('returns null for a single distinct product', () => {
    expect(buildBundle([item({ productId: 'a' })], { discountPercent: 10 })).toBeNull()
    expect(buildBundle([item({ productId: 'a' }), item({ productId: 'a' })], { discountPercent: 10 })).toBeNull()
  })
  it('sums list + floor totals and applies a floor-safe percent', () => {
    const q = buildBundle(
      [item({ productId: 'a', price: 500, floor: 400 }), item({ productId: 'b', price: 300, floor: 285 })],
      { discountPercent: 20 },
    )!
    expect(q.listTotal).toBe(800)
    expect(q.floorTotal).toBe(685)
    // item b only allows 5% (285/300), so the bundle is capped at 5%
    expect(q.discountPercent).toBe(5)
    expect(q.offerTotal).toBe(760)
    expect(q.offerTotal).toBeGreaterThanOrEqual(q.floorTotal)
  })
  it('never drops below the sum of floors even for a huge desired discount', () => {
    const q = buildBundle(
      [item({ productId: 'a', price: 100, floor: 95 }), item({ productId: 'b', price: 100, floor: 95 })],
      { discountPercent: 90 },
    )!
    expect(q.offerTotal).toBeGreaterThanOrEqual(q.floorTotal)
    expect(q.offerTotal).toBe(190)
  })
  it('drops non-positive items and caps the count', () => {
    const items = Array.from({ length: 9 }, (_, i) => item({ productId: `p${i}` }))
    items.push(item({ productId: 'bad', price: 0 }))
    const q = buildBundle(items, { discountPercent: 10 })!
    expect(q.items).toHaveLength(5)
  })
})

describe('validateBundleOffer', () => {
  it('accepts an in-range bundle', () => {
    const q = buildBundle([item({ productId: 'a' }), item({ productId: 'b' })], { discountPercent: 10 })!
    expect(validateBundleOffer(q).ok).toBe(true)
  })
  it('rejects below-floor, above-list and non-bundles', () => {
    const q = buildBundle([item({ productId: 'a' }), item({ productId: 'b' })], { discountPercent: 10 })!
    expect(validateBundleOffer({ ...q, offerTotal: q.floorTotal - 1 }).reason).toBe('below_floor')
    expect(validateBundleOffer({ ...q, offerTotal: q.listTotal + 1 }).reason).toBe('above_list')
    expect(validateBundleOffer({ ...q, items: [q.items[0]] }).reason).toBe('not_a_bundle')
  })
})

describe('allocateDiscount', () => {
  it('splits proportionally and sums exactly to the offer total', () => {
    const q = buildBundle(
      [item({ productId: 'a', price: 600, floor: 400 }), item({ productId: 'b', price: 400, floor: 300 })],
      { discountPercent: 10 },
    )!
    const alloc = allocateDiscount(q.items, q.offerTotal)
    const sum = Math.round(alloc.reduce((s, a) => s + a.offerPrice, 0) * 100) / 100
    expect(sum).toBe(q.offerTotal)
  })
  it('never allocates an item below its floor', () => {
    const items = [item({ productId: 'a', price: 100, floor: 95 }), item({ productId: 'b', price: 100, floor: 20 })]
    const alloc = allocateDiscount(items, 150)
    for (let i = 0; i < alloc.length; i++) {
      expect(alloc[i].offerPrice).toBeGreaterThanOrEqual(items[i].floor * items[i].quantity - 0.001)
    }
  })
})

describe('bundleSummary', () => {
  it('joins names, honouring quantities', () => {
    expect(bundleSummary([item({ productId: 'a', title: 'Serum' }), item({ productId: 'b', title: 'Cream', quantity: 2 })], '₹'))
      .toBe('Serum + 2× Cream')
    expect(bundleSummary([item({ productId: 'a', title: 'A' }), item({ productId: 'b', title: 'B' }), item({ productId: 'c', title: 'C' })], '₹'))
      .toBe('A, B + C')
  })
})
