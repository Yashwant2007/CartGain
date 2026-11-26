import {
  allowsRecommendations,
  decideRecommendation,
  normalizeRecoCandidate,
  normalizeProductId,
  rankRecommendations,
  readRecommendationHistory,
  recommendationEventMetadata,
  recommendationExcludedProductIds,
  recommendationReason,
  recommendationReasonForCard,
  recommendationShownMetadata,
  recommendationStoppedInHistory,
  recommendationStoppedMetadata,
  scoreRecoCandidate,
  searchRecommendations,
  withRecommendationShown,
} from '../recommendations'
import { analyzeIntent } from '../intent'

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

  it('attaches a non-empty honest reason to every card', () => {
    const { cards } = rankRecommendations(candidates(), { budget: 200, need: 'acne' })
    expect(cards.every(c => typeof c.reason === 'string' && c.reason.length > 0)).toBe(true)
  })
})

describe('recommendationReasonForCard', () => {
  const base = { title: 'Acne Care Gel', productType: 'skincare', tags: ['acne'], price: 199, compareAtPrice: null, onSale: false, available: true, budgetFit: 'unknown' as const }

  it('prefers the budget fit when the shopper shared one', () => {
    expect(recommendationReasonForCard({ ...base, budgetFit: 'under' })).toMatch(/budget/i)
  })

  it('mentions a live sale', () => {
    expect(recommendationReasonForCard({ ...base, onSale: true, compareAtPrice: 299 })).toMatch(/sale/i)
  })

  it('matches the stated need against the title/type/tags', () => {
    expect(recommendationReasonForCard(base, { need: 'acne' })).toMatch(/looking for/i)
  })

  it('falls back to a safe generic reason and never invents benefits', () => {
    const reason = recommendationReasonForCard(base, { need: 'winter jacket' })
    expect(reason).toBe('Another option in this store')
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

describe('decideRecommendation', () => {
  const base = { minPrice: 300 }

  it('stays quiet after the shopper asks for no more products', () => {
    const message = 'no more products, I just want this one'
    const out = decideRecommendation({
      ...base,
      intent: analyzeIntent(message),
      message,
      budget: 100,
    })
    expect(out.decision).toBe('DO_NOT_RECOMMEND')
    expect(out.recommend).toBe(false)
  })

  it('routes a discount request to the current product (A)', () => {
    const a = analyzeIntent('can you give me a discount?')
    const out = decideRecommendation({ ...base, intent: a, message: 'can you give me a discount?' })
    expect(a.shopperCategory).toBe('A')
    expect(out.decision).toBe('NEGOTIATE_CURRENT_PRODUCT')
    expect(out.recommend).toBe(false)
  })

  it('routes a hard budget under the floor to alternatives (B)', () => {
    const message = 'i only have 200 rupees to spend'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message, budget: 200 })
    expect(a.shopperCategory).toBe('B')
    expect(out.decision).toBe('RECOMMEND_ALTERNATIVES')
    expect(out.recommend).toBe(true)
  })

  it('routes a quality question to a clarifying answer (C)', () => {
    const message = 'is the build quality good?'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('C')
    expect(out.decision).toBe('ASK_CLARIFYING_QUESTION')
  })

  it('routes product information to a verified answer (D)', () => {
    const message = 'what material is it made of?'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('D')
    expect(out.decision).toBe('ASK_CLARIFYING_QUESTION')
  })

  it('routes trust concerns to a verified answer (E)', () => {
    const message = 'is this genuine or fake?'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('E')
    expect(out.decision).toBe('ASK_CLARIFYING_QUESTION')
  })

  it('routes comparison to current-product negotiation (F)', () => {
    const message = 'amazon is selling this cheaper'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('F')
    expect(out.decision).toBe('NEGOTIATE_CURRENT_PRODUCT')
  })

  it('routes fit and availability to a clarifying answer (G)', () => {
    const message = 'do you have this in size L? i need it in L'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('G')
    expect(out.decision).toBe('ASK_CLARIFYING_QUESTION')
  })

  it('routes purchase-ready shoppers to checkout (H)', () => {
    const message = "ok deal done, i'll take it"
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('H')
    expect(out.decision).toBe('PROCEED_TO_CHECKOUT')
  })

  it('routes hesitation and walkout without an ask back to negotiation (I)', () => {
    const message = 'let me think about it'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message, walkout: true })
    expect(a.shopperCategory).toBe('I')
    expect(out.decision).toBe('RESUME_NEGOTIATION')
  })

  it('routes an explicit alternatives ask to alternatives (J)', () => {
    const message = 'show me other options'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('J')
    expect(out.decision).toBe('RECOMMEND_ALTERNATIVES')
  })

  it('routes a complement ask to complementary cards (K)', () => {
    const message = 'what goes with this?'
    const a = analyzeIntent(message)
    const out = decideRecommendation({ ...base, intent: a, message })
    expect(a.shopperCategory).toBe('K')
    expect(out.decision).toBe('SHOW_COMPLEMENTARY_PRODUCT')
  })

  it('suppresses recommendations after acceptance or a purchase', () => {
    const a = analyzeIntent('show me other options')
    expect(decideRecommendation({ ...base, intent: a, sessionStatus: 'accepted' }).decision).toBe('DO_NOT_RECOMMEND')
    expect(decideRecommendation({ ...base, intent: a, purchased: true }).decision).toBe('DO_NOT_RECOMMEND')
    expect(decideRecommendation({ ...base, intent: a, acceptingDeal: true }).decision).toBe('DO_NOT_RECOMMEND')
  })

  it('suppresses recommendations on terminal engine turns', () => {
    const a = analyzeIntent('show me other options')
    expect(decideRecommendation({ ...base, intent: a, sessionStatus: 'rejected' }).recommend).toBe(false)
    expect(decideRecommendation({ ...base, intent: a, engineDecision: 'accept' }).recommend).toBe(false)
    expect(allowsRecommendations('RESUME_NEGOTIATION')).toBe(false)
  })
})

describe('recommendation history', () => {
  const messageAt = (at: string, metadata: Record<string, unknown>) => ({ metadata, createdAt: at })

  it('rebuilds shown and feedback state from persisted message metadata', () => {
    const history = readRecommendationHistory([
      messageAt('2026-01-01T00:00:00.000Z', recommendationShownMetadata({ productIds: ['gid://shopify/Product/2'], reason: 'budget', decision: 'RECOMMEND_ALTERNATIVES' })),
      messageAt('2026-01-01T00:01:00.000Z', recommendationEventMetadata({ action: 'dismissed', productId: '2' })),
      messageAt('2026-01-01T00:02:00.000Z', recommendationEventMetadata({ action: 'rejected', productId: '3' })),
    ])
    expect(normalizeProductId('gid://shopify/Product/2')).toBe('2')
    expect(history.shownProductIds).toContain('2')
    expect(history.dismissedProductIds).toContain('2')
    expect(history.rejectedProductIds).toContain('3')
    expect(history.lastShownProductIds).toEqual(['2'])
    expect(history.entries.find((entry) => entry.productId === '2')?.actions).toEqual(expect.arrayContaining(['shown', 'dismissed']))
    expect(recommendationExcludedProductIds(history)).toEqual(expect.arrayContaining(['2', '3']))
  })

  it('records an explicit stop so later turns stay quiet', () => {
    const history = readRecommendationHistory([
      messageAt('2026-01-01T00:00:00.000Z', recommendationStoppedMetadata()),
    ])
    expect(recommendationStoppedInHistory(history)).toBe(true)
    expect(history.stoppedAt).toBeTruthy()
  })

  it('never repeats rejected or dismissed products and finds new alternatives', async () => {
    const history = readRecommendationHistory([
      messageAt('2026-01-01T00:00:00.000Z', recommendationShownMetadata({ productIds: ['2', '3'] })),
      messageAt('2026-01-01T00:01:00.000Z', recommendationEventMetadata({ action: 'rejected', productId: '2' })),
      messageAt('2026-01-01T00:02:00.000Z', recommendationEventMetadata({ action: 'dismissed', productId: '3' })),
    ])
    const fetch = async () => ({
      products: [
        rawProduct({ id: '2', title: 'Old rejected', handle: 'old-1' }),
        rawProduct({ id: '3', title: 'Old dismissed', handle: 'old-2' }),
        rawProduct({ id: '4', title: 'Fresh A', handle: 'fresh-a', variants: [{ id: 'v4', price: 180, available: true }] }),
        rawProduct({ id: '5', title: 'Fresh B', handle: 'fresh-b', variants: [{ id: 'v5', price: 190, available: true }] }),
      ],
      nextCursor: null, prevCursor: null, error: null,
    })
    const first = await searchRecommendations({ store, shopifyProductId: '1', currency: 'INR', budget: 200 }, fetch, null, { history, strictBudget: true })
    expect(first.cards.map((c) => c.productId).sort()).toEqual(['4', '5'])
    const nextHistory = withRecommendationShown(history, { productIds: first.cards.map((c) => c.productId) })
    const second = await searchRecommendations({ store, shopifyProductId: '1', currency: 'INR', budget: 200 }, fetch, null, { history: nextHistory, strictBudget: true })
    expect(second.cards).toEqual([])
  })

  it('returns no cards when nothing suitable is left', async () => {
    const out = await searchRecommendations(
      { store, shopifyProductId: '1', currency: 'INR', budget: 100 },
      async () => ({
        products: [rawProduct({ id: '2', variants: [{ id: 'v2', price: 900, available: true }] })],
        nextCursor: null, prevCursor: null, error: null,
      }),
      null,
      { strictBudget: true },
    )
    expect(out.cards).toEqual([])
  })

  it('keeps a verified direct product URL on the card', async () => {
    const out = await searchRecommendations(
      { store, shopifyProductId: '1', currency: 'INR' },
      async () => ({
        products: [rawProduct({
          id: '2',
          productUrl: 'https://shop.example/products/hand-watch?variant=v2',
          variants: [{ id: 'v2', title: '', price: 400, available: true }],
        })],
        nextCursor: null, prevCursor: null, error: null,
      }),
    )
    expect(out.cards[0].productUrl).toBe('https://shop.example/products/hand-watch?variant=v2')
  })

  it('caps a bundle of alternatives at two cards and keeps them unique', async () => {
    const out = await searchRecommendations(
      { store, shopifyProductId: '1', currency: 'INR' },
      async () => ({
        products: ['2', '3', '4', '5'].map((id) => rawProduct({ id, title: `Option ${id}`, handle: `option-${id}`, variants: [{ id: `v${id}`, price: 100, available: true }] })),
        nextCursor: null, prevCursor: null, error: null,
      }),
    )
    expect(out.cards).toHaveLength(2)
    expect(new Set(out.cards.map((c) => c.productId)).size).toBe(2)
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