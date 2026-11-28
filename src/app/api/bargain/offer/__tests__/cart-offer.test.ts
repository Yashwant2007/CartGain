import { POST } from '@/app/api/bargain/offer/route'
import prisma from '@/lib/db'
import { signSessionToken } from '@/lib/bargain/session-bind'
import { normalizeCartContext } from '@/lib/bargain/cart-context'
import { track } from '@/lib/analytics/track'
import { recordLearningEvent } from '@/lib/bargain/learning/service'
import { negotiateStep } from '@/lib/services/bargain'

let mockCartContext: ReturnType<typeof normalizeCartContext> = null
let mockModelCalls = 0

jest.mock('@/lib/db', () => {
  const mock: any = {
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
    bargainQuote: { create: jest.fn(async ({ data }: any) => data) },
    bargainQuoteEvent: { create: jest.fn(async () => ({})) },
  }
  mock.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(mock) : Promise.all(arg)))
  return { __esModule: true, default: mock }
})

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
jest.mock('@/lib/bargain/cart-context-server', () => ({
  resolveVerifiedCartContext: jest.fn(async () => mockCartContext),
}))

jest.mock('@/lib/services/bargain', () => {
  const actual = jest.requireActual('@/lib/services/bargain')
  return {
    ...actual,
    negotiateStep: jest.fn(async () => {
      mockModelCalls += 1
      return {
        reply: 'model reply',
        decision: 'counter',
        counterOffer: 100,
        tactic: 'counter',
        sentiment: 'neutral',
        metadata: {},
      }
    }),
    computeMinPrice: jest.fn(async () => ({ minPrice: 50, source: 'test' })),
  }
})

const prismaMock = prisma as unknown as {
  bargainSession: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock }
  bargainConfig: { findUnique: jest.Mock }
  merchantConfig: { findUnique: jest.Mock }
  bargainProduct: { findUnique: jest.Mock }
  bargainMessage: { create: jest.Mock }
  bargainTurnClaim: { create: jest.Mock; delete: jest.Mock }
  bargainQuote: { create: jest.Mock }
  bargainQuoteEvent: { create: jest.Mock }
  $transaction: jest.Mock
}
const trackMock = track as jest.Mock
const negotiateMock = negotiateStep as jest.Mock
const learningMock = recordLearningEvent as jest.Mock

function request(message: string) {
  return new Request('https://cart-gain.com/api/bargain/offer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'sess-cart',
      sessionToken: signSessionToken('sess-cart'),
      platform: 'shopify',
      message,
      turnId: 'turn-cart',
      cartContext: { requestedMode: 'bundle' },
    }),
  }) as any
}

function session() {
  return {
    id: 'sess-cart',
    shopifyProductId: 'gid://shopify/Product/1',
    originalPrice: 100,
    currentOffer: null,
    finalPrice: null,
    discountCode: null,
    purchaseUrl: null,
    claimToken: null,
    status: 'active',
    attemptsUsed: 0,
    expiredAt: new Date(Date.now() + 60_000),
    customerEmail: null,
    customerPhone: null,
    customerFingerprint: 'fingerprint',
    language: 'auto',
    cartToken: 'cart-token',
    store: { id: 'store-1', currency: 'USD', timezone: 'UTC', name: 'Test Store' },
    messages: [],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LINK_SECRET = 'test-secret-at-least-16-chars-long'
  mockModelCalls = 0
  mockCartContext = normalizeCartContext({
    platform: 'shopify',
    cartToken: 'cart-token',
    cartId: 'cart-token',
    storeId: 'test.myshopify.com',
    currency: 'USD',
    requestedMode: 'bundle',
    config: { bundleOffersEnabled: true, cartWideBargainingEnabled: true },
    lines: [
      { lineId: 'line-1', productId: 'gid://shopify/Product/1', title: 'Serum', quantity: 1, unitPrice: 100, lineTotal: 100 },
      { lineId: 'line-2', productId: 'gid://shopify/Product/2', title: 'Moisturizer', quantity: 1, unitPrice: 80, lineTotal: 80 },
    ],
    subtotal: 180,
    totalValue: 190,
    discountCodes: [],
    source: 'server',
  })
  prismaMock.bargainSession.findUnique.mockResolvedValue(session())
  prismaMock.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainSession.update.mockResolvedValue({})
  prismaMock.bargainMessage.create.mockResolvedValue({})
  prismaMock.bargainConfig.findUnique.mockResolvedValue({
    enabled: true,
    maxAttempts: 5,
    aiPersona: 'friendly_shopkeeper',
    language: 'auto',
    recommendationsEnabled: false,
    alternativeRecommendationsEnabled: false,
    bundleNegotiationEnabled: true,
    bundleDiscountPercent: 10,
  })
  prismaMock.merchantConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainProduct.findUnique.mockResolvedValue({ minPrice: 50, isBargainable: true })
})

describe('offer route cart offer', () => {
  it('returns a floor-safe whole-cart counter without calling the model', async () => {
    const res = await POST(request('deal for the whole cart'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      decision: 'counter',
      sessionStatus: 'active',
      sessionId: 'sess-cart',
      counterOffer: 162,
      cartOffer: {
        mode: 'bundle',
        subtotal: 180,
        discountAmount: 18,
        finalTotal: 162,
        percentOff: 10,
        quantity: 2,
        payableTotal: 162,
      },
    })
    expect(body.cartOffer).not.toHaveProperty('floorTotal')
    expect(body.cartOffer).not.toHaveProperty('lineAdjustments')
    expect(body.engineResponse).toBeTruthy()
    expect(mockModelCalls).toBe(0)
    expect(negotiateMock).not.toHaveBeenCalled()
    expect(trackMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'cartgain_cart_offer' }))
    expect(prismaMock.bargainMessage.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.bargainMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: 'customer',
        metadata: expect.objectContaining({ cartRequested: true, cartMode: 'bundle' }),
      }),
    }))
    expect(learningMock).not.toHaveBeenCalled()
  })

  it('returns a signed cart quote token with floor-safe cart conditions', async () => {
    const res = await POST(request('deal for the whole cart'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(typeof body.quoteToken).toBe('string')
    expect(body.quoteToken).toBeTruthy()
    expect(prismaMock.bargainQuote.create).toHaveBeenCalledTimes(1)
    const created = prismaMock.bargainQuote.create.mock.calls[0][0].data
    expect(created.conditions).toMatchObject({
      kind: 'cart_offer',
      mode: 'bundle',
      subtotal: 180,
      finalTotal: 162,
      percentOff: 10,
    })
    expect(created.conditions).not.toHaveProperty('floorTotal')
  })
})

afterAll(() => {
  delete process.env.LINK_SECRET
})
