/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { POST } from '@/app/api/bargain/demo/route'
import prisma from '@/lib/db'
import { fetchShopifyProducts } from '@/lib/shopify'

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
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn() }))

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
const fetchMock = fetchShopifyProducts as jest.Mock

function request(body: Record<string, unknown>) {
  return new NextRequest('https://cart-gain.com/api/bargain/demo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      originalPrice: 600,
      minPrice: 300,
      shopifyProductId: 'gid://shopify/Product/1',
      productTitle: 'Anchor Item',
      ...body,
    }),
  })
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

beforeEach(() => {
  jest.clearAllMocks()
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
    shopifyRefreshToken: 'token',
    shopifyTokenExpiresAt: null,
  })
  prismaMock.bargainConfig.upsert.mockResolvedValue({
    storeId: 'store-1',
    aiPersona: 'friendly_shopkeeper',
    recommendationsEnabled: true,
    alternativeRecommendationsEnabled: true,
  })
  fetchMock.mockResolvedValue(catalog())
})

describe('demo route recommendation parity', () => {
  it('does not recommend on a discount request', async () => {
    const res = await POST(request({ message: 'can you give me a discount?' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recommendationDecision).toBe('NEGOTIATE_CURRENT_PRODUCT')
    expect(body.recommendations).toBeUndefined()
  })

  it('uses replayed metadata to avoid repeating shown or dismissed products', async () => {
    const res = await POST(request({
      message: 'show me other options',
      history: [
        {
          role: 'ai',
          content: 'Here are some options',
          metadata: { recommendations: { productIds: ['2'], reason: 'requested', at: '2026-01-01T00:00:00.000Z' } },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          role: 'system',
          content: 'recommendation_feedback',
          metadata: { recommendationEvent: { action: 'dismissed', productId: '3', at: '2026-01-01T00:01:00.000Z' } },
          createdAt: '2026-01-01T00:01:00.000Z',
        },
      ],
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recommendations.map((card: any) => card.productId)).toEqual(['4'])
    expect(body.recommendationHistory.shownProductIds).toEqual(expect.arrayContaining(['2']))
    expect(body.recommendationHistory.dismissedProductIds).toEqual(expect.arrayContaining(['3']))
  })

  it('stops recommending when the demo exchange is already accepted', async () => {
    const res = await POST(request({
      message: 'what else do you have?',
      dealAccepted: true,
      finalPrice: 450,
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.recommendationDecision).toBe('DO_NOT_RECOMMEND')
    expect(body.recommendations).toBeUndefined()
  })
})
