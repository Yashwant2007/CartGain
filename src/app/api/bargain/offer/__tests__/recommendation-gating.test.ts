/**
 * @jest-environment node
 */
import { POST } from '@/app/api/bargain/offer/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'
import { fetchShopifyProducts } from '@/lib/shopify'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    bargainConfig: { findUnique: jest.fn() },
    merchantConfig: { findUnique: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
    bargainMessage: { create: jest.fn() },
    bargainTurnClaim: { create: jest.fn(async () => ({})), delete: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}))

jest.mock('@/lib/data-protection', () => ({ logDataAccess: jest.fn(async () => {}) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))
jest.mock('@/lib/bargain/product-fetcher', () => ({ buildProductContext: jest.fn(async () => null) }))
jest.mock('@/lib/bargain/goals', () => ({
  buildGoalContextForNegotiation: jest.fn(async () => undefined),
  publicGoalView: jest.fn(() => undefined),
}))
jest.mock('@/lib/bargain/learning/service', () => ({
  resolveSessionLearning: jest.fn(async () => null),
  recordLearningEvent: jest.fn(async () => {}),
  loadLearningConfig: jest.fn(async () => null),
}))
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn() }))

let mockNegotiationResult: any
jest.mock('@/lib/services/bargain', () => {
  const actual = jest.requireActual('@/lib/services/bargain')
  return {
    ...actual,
    negotiateStep: jest.fn(async () => mockNegotiationResult),
  }
})

const prismaMock = prisma as unknown as {
  bargainSession: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
  merchantConfig: { findUnique: jest.Mock }
  bargainProduct: { findUnique: jest.Mock }
  bargainMessage: { create: jest.Mock }
  bargainTurnClaim: { create: jest.Mock; delete: jest.Mock }
}
const fetchMock = fetchShopifyProducts as jest.Mock

function request(message: string) {
  return new Request('https://cart-gain.com/api/bargain/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sess-1', message, sessionToken: signSessionToken('sess-1') }),
  }) as any
}

function session(messages: any[] = []) {
  return {
    id: 'sess-1',
    shopifyProductId: 'gid://shopify/Product/1',
    originalPrice: 600,
    currentOffer: null,
    finalPrice: null,
    status: 'active',
    attemptsUsed: 0,
    customerEmail: null,
    customerPhone: null,
    language: 'auto',
    store: { id: 'store-1', currency: 'USD', timezone: 'UTC', name: 'Test Store' },
    messages,
  }
}

function catalog() {
  return {
    products: [
      {
        id: 'gid://shopify/Product/1',
        title: 'Anchor Item',
        status: 'active',
        variants: [{ id: 'gid://shopify/ProductVariant/1', title: 'Default', price: '600', available: true }],
      },
      {
        id: 'gid://shopify/Product/2',
        title: 'Budget Pick',
        status: 'active',
        variants: [{ id: 'gid://shopify/ProductVariant/2', title: 'Default', price: '180', available: true }],
      },
      {
        id: 'gid://shopify/Product/3',
        title: 'Cheap Pick',
        status: 'active',
        variants: [{ id: 'gid://shopify/ProductVariant/3', title: 'Default', price: '250', available: true }],
      },
      {
        id: 'gid://shopify/Product/4',
        title: 'Other Pick',
        status: 'active',
        variants: [{ id: 'gid://shopify/ProductVariant/4', title: 'Default', price: '200', available: true }],
      },
    ],
    nextCursor: null,
    error: null,
  }
}

function aiMessageMetadata() {
  const call = [...prismaMock.bargainMessage.create.mock.calls]
    .reverse()
    .find(([args]) => args.data.role === 'ai')
  return (call?.[0] as any)?.data.metadata ?? {}
}

beforeEach(() => {
  jest.clearAllMocks()
  mockNegotiationResult = {
    reply: 'What price did you have in mind?',
    decision: 'chat',
    counterOffer: null,
    metadata: {},
  }
  prismaMock.bargainSession.findUnique.mockResolvedValue(session())
  prismaMock.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainSession.update.mockResolvedValue({})
  prismaMock.bargainMessage.create.mockResolvedValue({})
  prismaMock.bargainConfig.findUnique.mockResolvedValue({
    enabled: true,
    maxAttempts: 3,
    aiPersona: 'friendly_shopkeeper',
    language: 'auto',
    couponsAllowed: false,
    recommendationsEnabled: true,
    alternativeRecommendationsEnabled: true,
  })
  prismaMock.merchantConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainProduct.findUnique.mockResolvedValue({ minPrice: 300, isBargainable: true })
  fetchMock.mockResolvedValue(catalog())
})

describe('offer route recommendation gating', () => {
  it('does not recommend on a discount request', async () => {
    const res = await POST(request('can you give me a discount?'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recommendationDecision).toBe('NEGOTIATE_CURRENT_PRODUCT')
    expect(body.recommendations).toBeUndefined()
  })

  it('recommends only suitable alternatives when the budget is below the floor', async () => {
    const res = await POST(request('i only have 200 rupees to spend'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recommendationDecision).toBe('RECOMMEND_ALTERNATIVES')
    expect(body.recommendationReason).toBe('budget')
    expect(body.recommendations.length).toBeGreaterThan(0)
    expect(body.recommendations.every((card: any) => card.price <= 200)).toBe(true)
    expect(aiMessageMetadata().recommendations).toEqual(expect.objectContaining({
      productIds: body.recommendations.map((card: any) => card.productId),
      decision: 'RECOMMEND_ALTERNATIVES',
    }))
  })

  it('does not repeat products shown, dismissed, or rejected in persisted history', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(session([
      {
        role: 'ai',
        content: 'Here are some options',
        metadata: { recommendations: { productIds: ['2'], reason: 'requested', at: '2026-01-01T00:00:00.000Z' } },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        role: 'system',
        content: 'recommendation_feedback',
        metadata: { recommendationEvent: { action: 'dismissed', productId: '3', at: '2026-01-01T00:01:00.000Z' } },
        createdAt: new Date('2026-01-01T00:01:00.000Z'),
      },
    ]))

    const res = await POST(request('show me other options'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recommendations.map((card: any) => card.productId)).toEqual(['4'])
    expect(body.recommendationHistory.shownProductIds).toEqual(expect.arrayContaining(['2']))
    expect(body.recommendationHistory.dismissedProductIds).toEqual(expect.arrayContaining(['3']))
  })

  it('stops recommending once the engine accepts the deal', async () => {
    mockNegotiationResult = {
      reply: 'Deal — tap accept to lock it in.',
      decision: 'accept',
      counterOffer: 450,
      metadata: {},
    }

    const res = await POST(request('I can do 450'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.decision).toBe('accept')
    expect(body.recommendationDecision).toBe('DO_NOT_RECOMMEND')
    expect(body.recommendations).toBeUndefined()
  })
})
