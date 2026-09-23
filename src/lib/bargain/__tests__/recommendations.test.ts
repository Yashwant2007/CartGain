import {
  normalizeRecoCandidate,
  scoreRecoCandidate,
  rankRecommendations,
  searchRecommendations,
  recommendationReason,
} from '../recommendations'

const store = { id: 's1', domain: 'demo.myshopify.com', apiKey: null, shopifyRefreshToken: null, shopifyTokenExpiresAt: null }
const fetchNone: any = async () => ({ products: [], nextCursor: null, prevCursor: null, error: null })

function rawProduct(over: Record<string, any> = {}) {
  return {
    id: '1001',
    title: 'Acne Care Gel',
    handle: 'acne-care-gel',
    product_type: 'skincare',
    tags: 'acne,skin,oil-control',
    status: 'active',
    image: { src: 'https://cdn.example/acne.jpg' },
    images: [{ src: 'https://cdn.example/acne.jpg' }],
    variants: [
      { id: '5001', title: '30g', price: 199, compare_at_price: 299, available: true, inventory_quantity: 12, inventory_policy: 'deny' },
    ],
    ...over,
  }
}

describe('normalizeRecoCandidate', () => {
  it('builds a candidate from a healthy product', () => {
    const c = normalizeRecoCandidate(rawProduct())!
    expect(c.productId).toBe('1001')
    expect(c.price).toBe(199)
    expect(c.compareAtPrice).toBe(299)
    expect(c.onSale).toBe(true)
    expect(c.available).toBe(true)
    expect(c.imageUrl).toContain('acne.jpg')
  })

  it('rejects draft/archived products', () => {
    expect(normalizeRecoCandidate(rawProduct({ status: 'draft' }))).toBeNull()
    expect(normalizeRecoCandidate(rawProduct({ status: 'archived' }))).toBeNull()
  })

  it('picks the first available variant with a price', () => {
    const c = normalizeRecoCandidate(rawProduct({
      variants: [
        { id: 'v1', title: 'out', price: 300, available: false, inventory_quantity: 0, inventory_policy: 'deny' },
        { id: 'v2', title: 'in', price: 250, available: true, inventory_quantity: 4, inventory_policy: 'deny' },
      ],
    }))!
    expect(c.variantId).toBe('v2')
    expect(c.price).toBe(250)
  })

  it('drops price-less products', () => {
    expect(normalizeRecoCandidate(rawProduct({ variants: [{ id: 'v1', price: null }] }))).toBeNull()
  })
})

const candidates = () => [
  normalizeRecoCandidate(rawProduct({ id: '1', title: 'Cheap Option', handle: 'cheap', variants: [{ id: 'v1', title: '', price: 120, available: true }] }))!,
  normalizeRecoCandidate(rawProduct({ id: '2', title: 'Mid Acne Kit', handle: 'mid', tags: 'acne,kit', variants: [{ id: 'v2', title: '', price: 450, available: true }] }))!,
  normalizeRecoCandidate(rawProduct({ id: '3', title: 'Premium Acne Kit', handle: 'prem', tags: 'acne,kit', variants: [{ id: 'v3', title: '', price: 900, available: false }] }))!,
  normalizeRecoCandidate(rawProduct({ id: '4', title: 'Star Product', handle: 'star', variants: [{ id: 'v4', title: '', price: 400, available: true }] }))!,
]

describe('scoreRecoCandidate', () => {
  it('favors in-budget candidates', () => {
    const inBudget = scoreRecoCandidate(candidates()[0], { budget: 150 })
    const over = scoreRecoCandidate(candidates()[1], { budget: 150 })
    expect(inBudget).toBeGreaterThan(over)
  })

  it('boosts need-token matches', () => {
    const match = scoreRecoCandidate(candidates()[1], { need: 'acne kit' })
    const unrelated = scoreRecoCandidate(candidates()[0], { need: 'acne kit' })
    expect(match).toBeGreaterThan(unrelated)
  })
})

describe('rankRecommendations', () => {
  it('excludes the current product', () => {
    const { cards } = rankRecommendations(candidates(), { excludeProductId: '2' })
    expect(cards.some(c => c.productId === '2')).toBe(false)
    expect(cards).toHaveLength(3)
  })

  it('puts budget-fit products first', () => {
    const { cards } = rankRecommendations(candidates(), { budget: 200 })
    expect(cards[0].productId).toBe('1') // 120 ≤ 200 and available
    expect(cards.map(c => c.budgetFit)).toContain('over')
  })

  it('respects limit and reports truncation', () => {
    const { cards, truncated } = rankRecommendations(candidates(), { limit: 2, budget: 500 })
    expect(cards).toHaveLength(2)
    expect(truncated).toBe(true)
  })

  it('ranks deterministically for equal scores', () => {
    const a = rankRecommendations(candidates(), { budget: 500 })
    const b = rankRecommendations(candidates(), { budget: 500 })
    expect(a.cards.map(c => c.productId)).toEqual(b.cards.map(c => c.productId))
  })
})

describe('searchRecommendations', () => {
  it('sanitizes cards — no merchant financial secrets ever leave', async () => {
    const out = await searchRecommendations(
      { store, shopifyProductId: '1', currency: 'INR', budget: 500, need: 'acne' },
      async () => ({
        products: [
          rawProduct({ id: '2', title: 'Kit A', handle: 'kit-a', variants: [{ id: 'v2', title: '', price: 300, compare_at_price: 420, available: true }] }),
          rawProduct({ id: '1', title: 'Kit B', handle: 'kit-b', variants: [{ id: 'v1', title: '', price: 100, available: true }] }),
        ],
        nextCursor: null, prevCursor: null, error: null,
      }),
      500,
    )
    expect(out.cards).toHaveLength(1) // current product (id 1) excluded
    const card = out.cards[0]
    expect(card.productId).toBe('2')
    expect(card.price).toBe(300)
    expect(card.budgetFit).toBe('under')
    expect(card.onSale).toBe(true)
    expect(card.productUrl).toContain('/products/kit-a?variant=v2')
    // the classified card must never carry floor/margin/max-discount integers
    const serialized = JSON.stringify(card)
    expect(serialized).not.toMatch(/minPrice|maxDiscount|floor|maxPercent|margin/)
  })

  it('marks cards above a strict budget as over', async () => {
    const out = await searchRecommendations(
      { store, shopifyProductId: '0', currency: 'INR', budget: 200 },
      async () => ({
        products: [rawProduct({ id: '9', title: 'Costly', variants: [{ id: 'v9', title: '', price: 900, available: true }] })],
        nextCursor: null, prevCursor: null, error: null,
      }),
    )
    expect(out.cards[0].budgetFit).toBe('over')
  })

  it('returns the reset empty set on a failed catalog fetch', async () => {
    const out = await searchRecommendations({ store, shopifyProductId: '1', currency: 'INR' }, async () => ({
      products: [], nextCursor: null, prevCursor: null, error: 'boom',
    }))
    expect(out.cards).toEqual([])
    expect(out.truncated).toBe(false)
  })

  it('propagates a normalized error from fetchProducts when available', async () => {
    const out = await searchRecommendations({ store, shopifyProductId: '1', currency: 'INR' }, fetchNone)
    expect(out.cards).toEqual([])
  })
})

describe('recommendationReason', () => {
  it('fires on an explicit alternative ask', () => {
    expect(recommendationReason('RECOMMENDATION_REQUEST', false, null, null, 200)).toBe('requested')
  })
  it('fires when the AI requests recommendation cards', () => {
    expect(recommendationReason('GENERIC_CHAT', true, null, null, 200)).toBe('requested')
  })
  it('fires on product discovery', () => {
    expect(recommendationReason('PRODUCT_DISCOVERY', false, null, null, 200)).toBe('discovery')
  })
  it('fires when a stated budget sits under the floor', () => {
    expect(recommendationReason('BUDGET_CONSTRAINT', false, 100, null, 250)).toBe('budget')
  })
  it('fires on a lowball deep below the floor', () => {
    expect(recommendationReason('PRICE_ONLY', false, null, 100, 250)).toBe('lowball') // 100 < 0.45*250=112.5
  })
  it('stays quiet on an ordinary counter', () => {
    expect(recommendationReason('PRICE_ONLY', false, null, 200, 100)).toBeNull()
  })
})