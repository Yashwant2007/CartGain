import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST } from '@/app/api/bargain/demo/route'
import prisma from '@/lib/db'
import { bargainRequestMetrics } from '@/lib/bargain/request-metrics'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { upsert: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
}))
jest.mock('@/lib/bargain/goals', () => ({
  buildGoalContextForNegotiation: jest.fn(async () => undefined),
  publicGoalView: jest.fn(() => undefined),
}))
jest.mock('@/lib/bargain/product-fetcher', () => ({ buildProductContext: jest.fn(async () => null) }))
jest.mock('@/lib/bargain/learning/service', () => ({
  previewDemoLearning: jest.fn(async () => null),
  learningSelectionForClient: jest.fn(() => undefined),
  recordLearningEvent: jest.fn(async () => {}),
  loadLearningConfig: jest.fn(async () => null),
}))
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn(async () => ({ products: [] })) }))

let mockNegotiationResult: any
jest.mock('@/lib/services/bargain', () => {
  const actual = jest.requireActual('@/lib/services/bargain')
  return {
    ...actual,
    negotiateStep: jest.fn(async () => mockNegotiationResult),
    computeMinPrice: jest.fn(async () => ({ minPrice: 300, isBargainable: true })),
  }
})

const prismaMock = prisma as unknown as {
  store: { findFirst: jest.Mock }
  bargainConfig: { upsert: jest.Mock }
}
const sessionMock = getServerSession as jest.Mock

function request() {
  return new NextRequest('https://cart-gain.com/api/bargain/demo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Tell me about this product',
      originalPrice: 600,
      minPrice: 300,
    }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  bargainRequestMetrics.reset()
  mockNegotiationResult = {
    reply: 'What price did you have in mind?',
    decision: 'chat',
    counterOffer: null,
    metadata: {},
  }
  sessionMock.mockResolvedValue({ user: { id: 'user-1' } })
  prismaMock.store.findFirst.mockResolvedValue({
    id: 'store-1',
    name: 'Test Store',
    domain: 'test.myshopify.com',
    currency: 'USD',
    apiKey: null,
    platform: 'shopify',
    timezone: 'UTC',
    shopifyRefreshToken: null,
    shopifyTokenExpiresAt: null,
  })
  prismaMock.bargainConfig.upsert.mockResolvedValue({
    storeId: 'store-1',
    aiPersona: 'friendly_shopkeeper',
  })
})

afterAll(() => {
  bargainRequestMetrics.reset()
})

describe('demo route request metrics', () => {
  it('records demo_total and demo_ai_turn for a normal turn', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)

    const stages = bargainRequestMetrics.snapshot().map((row) => row.stage)
    expect(stages).toContain('demo_total')
    expect(stages).toContain('demo_ai_turn')
    expect(bargainRequestMetrics.get('demo_total')?.count).toBe(1)
    expect(bargainRequestMetrics.get('demo_ai_turn')?.count).toBe(1)
  })

  it('classifies a reflex negotiation result under demo_reflex_turn', async () => {
    mockNegotiationResult = {
      reply: 'Done — that works.',
      decision: 'accept',
      counterOffer: 450,
      metadata: { aiSource: 'reflex' },
    }

    const res = await POST(request())
    expect(res.status).toBe(200)

    const stages = bargainRequestMetrics.snapshot().map((row) => row.stage)
    expect(stages).toContain('demo_total')
    expect(stages).toContain('demo_reflex_turn')
    expect(stages).not.toContain('demo_ai_turn')
  })
})
