/**
 * @jest-environment node
 */
import { POST } from '@/app/api/bargain/offer/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'
import { createBundleQuote } from '@/lib/bargain/bundle-quote'
import { computeMinPrice } from '@/lib/services/bargain'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    merchantConfig: { findUnique: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
    cart: { findUnique: jest.fn() },
    bargainMessage: { create: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}))

jest.mock('@/lib/bargain/bundle-quote', () => ({
  createBundleQuote: jest.fn(async () => 'bbundle:token-123'),
  BUNDLE_QUOTE_TTL_MS: 24 * 60 * 60 * 1000,
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
jest.mock('@/lib/shopify', () => ({ fetchShopifyProducts: jest.fn(async () => []) }))

jest.mock('@/lib/services/bargain', () => {
  const actual = jest.requireActual('@/lib/services/bargain')
  return {
    ...actual,
    negotiateStep: jest.fn(async () => { throw new Error('bundle turns must not call the AI') }),
    computeMinPrice: jest.fn(async ({ shopifyProductId }: any) => ({
      isBargainable: true,
      minPrice: shopifyProductId === '1' ? 700 : 600,
    })),
  }
})

const prismaMock = prisma as any
const createBundleQuoteMock = createBundleQuote as jest.Mock
const computeMinPriceMock = computeMinPrice as jest.Mock

function request() {
  return new Request('https://cart-gain.com/api/bargain/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'sess-1',
      message: 'serum and moisturizer together',
      cartToken: 'cart-1',
      sessionToken: signSessionToken('sess-1'),
    }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.bargainSession.findUnique.mockResolvedValue({
    id: 'sess-1',
    storeId: 'store-1',
    shopifyProductId: '1',
    shopifyVariantId: null,
    originalPrice: 1000,
    currentOffer: null,
    finalPrice: null,
    discountCode: null,
    purchaseUrl: null,
    claimToken: null,
    status: 'active',
    attemptsUsed: 1,
    customerEmail: null,
    customerPhone: null,
    cartToken: 'cart-1',
    language: 'auto',
    messages: [],
    expiredAt: new Date(Date.now() + 60 * 60 * 1000),
    store: { id: 'store-1', domain: 'test.myshopify.com', currency: 'INR', timezone: 'UTC', name: 'Test Store' },
  })
  prismaMock.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainSession.update.mockResolvedValue({})
  prismaMock.bargainConfig.findUnique.mockResolvedValue({
    enabled: true,
    maxAttempts: 3,
    recommendationsEnabled: false,
    alternativeRecommendationsEnabled: false,
    bundleNegotiationEnabled: true,
    bundleDiscountPercent: 10,
  })
  prismaMock.merchantConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainProduct.findUnique.mockResolvedValue(null)
  prismaMock.cart.findUnique.mockResolvedValue({
    items: [{ productId: 'gid://shopify/Product/2', variantId: null, name: 'Moisturizer', price: 800, quantity: 1 }],
  })
  prismaMock.bargainMessage.create.mockResolvedValue({})
  computeMinPriceMock.mockImplementation(async ({ shopifyProductId }: any) => ({
    isBargainable: true,
    minPrice: shopifyProductId === '1' ? 700 : 600,
  }))
})

describe('offer route bundle quote wiring', () => {
  it('persists a signed bundle quote and returns it without calling the AI', async () => {
    const res = await POST(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.decision).toBe('counter')
    expect(body.counterOffer).toBe(1620)
    expect(body.bundleOffer).toMatchObject({
      token: 'bbundle:token-123',
      listTotal: 1800,
      offerTotal: 1620,
      discountPercent: 10,
    })
    expect(createBundleQuoteMock).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 'store-1',
      sessionId: 'sess-1',
      listTotal: 1800,
      offerTotal: 1620,
    }))
    expect(computeMinPriceMock).toHaveBeenCalled()
    expect(computeMinPriceMock.mock.calls.length).toBeGreaterThanOrEqual(2)

    const aiMessage = (prismaMock.bargainMessage.create.mock.calls as any[][])
      .map((call) => call[0].data)
      .find((data: any) => data.role === 'ai')
    expect(aiMessage.metadata).toMatchObject({ decision: 'counter', tactic: 'bundle_offer' })
    expect(aiMessage.metadata.bundleOffer.token).toBe('bbundle:token-123')
    expect(aiMessage.offeredPrice).toBe(1620)
  })
})
