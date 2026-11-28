/**
 * @jest-environment node
 *
 * Module 3 wiring: every successful accept must mint a secure quote (signed
 * token, ACCEPTED status, audit event) and surface `quoteToken` on the response
 * so checkout always has a server-authoritative deal to redeem. The legacy
 * BARGAIN_QUOTE flag no longer disables quote minting.
 */
import { POST } from '@/app/api/bargain/accept/route'
import prisma from '@/lib/db'
import { signQuoteToken, verifyQuoteToken } from '@/lib/bargain/quote'
import { validateOffer } from '@/lib/bargain/offer-validation'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { resolveVerifiedCartContext } from '@/lib/bargain/cart-context-server'
import { computeCartOffer } from '@/lib/bargain/cart-offer'

jest.mock('@/lib/db', () => {
  const mock: any = {
    bargainSession: { findUnique: jest.fn(), updateMany: jest.fn() },
    bargainMessage: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    cart: { findUnique: jest.fn() },
    bargainQuote: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    bargainQuoteEvent: { create: jest.fn() },
  }
  mock.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(mock) : Promise.all(arg),
  )
  return { __esModule: true, default: mock }
})

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('@/lib/bargain/session-bind', () => ({
  assertSessionOwnership: jest.fn(() => ({ ok: true })),
  verifySessionToken: jest.fn(() => true),
}))

jest.mock('@/lib/bargain/gate', () => ({
  getBargainGate: jest.fn(async () => ({ planId: 'free', subscriptionId: 'sub-1' })),
  decideDealMode: jest.fn(() => 'included'),
  recordBargainDealOps: jest.fn(() => []),
  BARGAIN_DEALS_EXHAUSTED: 'bargain_deals_exhausted',
}))

jest.mock('@/lib/services/bargain', () => ({
  computeMinPrice: jest.fn(async () => ({ minPrice: 700 })),
}))

jest.mock('@/lib/shopify', () => ({
  fetchShopifyProductDetail: jest.fn(async () => null),
  fetchShopifyProductPrice: jest.fn(async () => 1000),
}))

jest.mock('@/lib/financial-safety', () => ({
  buildExecutablePrice: jest.fn(() => ({
    ok: true,
    finalPrice: 850,
    discountPercent: 15,
    bulkQuantity: null,
    unitPriceMinor: 85000,
  })),
}))

jest.mock('@/lib/bargain/offer-validation', () => ({
  validateOffer: jest.fn(() => ({ ok: true })),
}))

jest.mock('@/lib/bargain/policy', () => ({
  bargainCampaignStatus: jest.fn(() => 'active'),
  couponMentionedInMessages: jest.fn(() => false),
}))

jest.mock('@/lib/bargain/purchase', () => ({
  generateBargainCode: jest.fn(() => 'BARGAIN_XYZ'),
  buildBargainCheckoutUrl: jest.fn(() => 'https://test.myshopify.com/cart'),
  buildBargainCartCheckoutUrl: jest.fn(() => 'https://test.myshopify.com/discount/BARGAIN_XYZ?redirect=%2Fcart%2Fcart-1'),
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/bargain/learning/outcomes', () => ({ recordLearningAcceptance: jest.fn(async () => {}) }))
jest.mock('@/lib/bargain/discount', () => ({
  generateBargainDiscountCode: jest.fn(async ({ code }: any) => ({ code, status: 'created' })),
  generateBargainCartDiscountCode: jest.fn(async ({ code }: any) => ({ code, status: 'created' })),
}))

jest.mock('@/lib/bargain/cart-context-server', () => ({
  resolveVerifiedCartContext: jest.fn(async () => null),
}))

jest.mock('@/lib/bargain/cart-offer', () => ({
  computeCartOffer: jest.fn(() => ({ ok: false })),
}))

const mockPrisma = prisma as any

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    storeId: 'store-1',
    shopifyProductId: 'gid://shopify/Product/1',
    variantId: null,
    originalPrice: 1000,
    currentOffer: 850,
    finalPrice: 850,
    status: 'active',
    attemptsUsed: 1,
    customerEmail: 'buyer@example.com',
    customerPhone: null,
    customerFingerprint: 'fingerprint-1',
    language: 'en',
    cartToken: null,
    bulkQuantity: null,
    discountCode: null,
    purchaseUrl: null,
    expiredAt: new Date('2030-01-01T00:00:00.000Z'),
    store: { id: 'store-1', domain: 'test.myshopify.com', currency: 'INR', timezone: 'Asia/Kolkata', name: 'Test Store' },
    ...overrides,
  }
}

function makeRequest() {
  return new Request('https://cart-gain.com/api/bargain/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'sess-1', sessionToken: 'tok' }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LINK_SECRET = 'test-secret-at-least-16-chars-long'
  mockPrisma.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.bargainSession.findUnique.mockResolvedValue(session())
  mockPrisma.bargainMessage.findMany.mockResolvedValue([
    { id: 'm1', createdAt: new Date(), offeredPrice: 850, metadata: { decision: 'counter' }, content: 'I can do 850' },
  ])
  mockPrisma.bargainMessage.findFirst.mockResolvedValue(null)
  mockPrisma.bargainMessage.create.mockResolvedValue({})
  mockPrisma.bargainConfig.findUnique.mockResolvedValue(null)
  mockPrisma.bargainQuote.create.mockImplementation(({ data }: any) => Promise.resolve(data))
  mockPrisma.bargainQuote.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.bargainQuoteEvent.create.mockResolvedValue({})
  jest.mocked(resolveVerifiedCartContext).mockResolvedValue(null as any)
  jest.mocked(computeCartOffer).mockReturnValue({ ok: false } as any)
})

afterAll(() => {
  delete process.env.LINK_SECRET
  delete process.env.BARGAIN_QUOTE
})

describe('accept → secure quote wiring', () => {
  it('mints an ACCEPTED quote and returns a verifiable quoteToken when the flag is on', async () => {
    process.env.BARGAIN_QUOTE = 'true'
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.discountCode).toBe('BARGAIN_XYZ')
    expect(typeof body.quoteToken).toBe('string')
    expect(body.quoteToken).toBeTruthy()

    expect(mockPrisma.bargainQuote.create).toHaveBeenCalledTimes(1)
    const created = mockPrisma.bargainQuote.create.mock.calls[0][0].data
    expect(created.status).toBe('CREATED')
    expect(created.storeId).toBe('store-1')
    expect(created.sessionId).toBe('sess-1')
    expect(created.floorPrice).toBe(700)
    // The token must verify against exactly the quote id that was created.
    expect(verifyQuoteToken(created.id, body.quoteToken)).toBe(true)
    // …and the quote advanced to ACCEPTED (CAS update fired).
    expect(mockPrisma.bargainQuote.updateMany).toHaveBeenCalled()
  })

  it('still mints a quote when the legacy flag is off', async () => {
    process.env.BARGAIN_QUOTE = 'false'
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(typeof body.quoteToken).toBe('string')
    expect(body.quoteToken).toBeTruthy()
    expect(mockPrisma.bargainQuote.create).toHaveBeenCalledTimes(1)
  })

  it('blocks acceptance when the merchant has disabled bargaining', async () => {
    mockPrisma.bargainConfig.findUnique.mockResolvedValue({ enabled: false })
    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(mockPrisma.bargainSession.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.bargainQuote.create).not.toHaveBeenCalled()
  })

  it('stamps acceptedAt on the session that claims the deal', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const update = mockPrisma.bargainSession.updateMany.mock.calls.find(
      ([args]: any[]) => args?.data?.status === 'accepted',
    )
    expect(update?.[0].data.acceptedAt).toBeInstanceOf(Date)
  })

  it('explains a price change instead of claiming tampering when the live price moved', async () => {
    jest.mocked(fetchShopifyProductPrice).mockResolvedValueOnce(1800)
    mockPrisma.bargainSession.findUnique.mockResolvedValueOnce(session({
      originalPrice: 2000,
      currentOffer: 2000,
      finalPrice: 2000,
      status: 'accepted',
    }))
    jest.mocked(validateOffer).mockReturnValueOnce({
      ok: false,
      reason: 'INVALID_PRICE',
      requestedPrice: 2000,
      originalPrice: 1800,
      floorPrice: 700,
      message: null,
    })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.code).toBe('OFFER_REJECTED_PRICE_CHANGED')
    expect(body.reason).toBe('PRICE_CHANGED')
    expect(body.currentPrice).toBe(1800)
    expect(body.agreedPrice).toBe(2000)
    expect(body.message).toContain('1,800')
    expect(body.message).toContain('2,000')
    expect(body.message).not.toMatch(/tamper/i)
    expect(mockPrisma.bargainSession.updateMany).not.toHaveBeenCalled()
  })

  it('returns authoritative original price, shipping total, and payment view on success', async () => {
    mockPrisma.bargainConfig.findUnique.mockResolvedValueOnce({
      enabled: true,
      shippingAwareEnabled: true,
      shippingFlatCost: 40,
      freeShippingThreshold: 1000,
      paymentAwareEnabled: true,
      prepaidIncentivePercent: 5,
    })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.originalPrice).toBe(1000)
    expect(body.finalPrice).toBe(850)
    expect(body.shipping).toMatchObject({
      subtotal: 850,
      shippingCost: 40,
      total: 890,
      freeShipping: false,
    })
    expect(body.payment).toMatchObject({ intent: 'unknown', prepaidSaving: null })
  })

  it('redeems a signed cart quote with authoritative cart totals', async () => {
    const quoteToken = signQuoteToken('quote-cart-1')!
    mockPrisma.bargainQuote.findUnique.mockResolvedValue({
      id: 'quote-cart-1',
      token: quoteToken,
      storeId: 'store-1',
      sessionId: 'sess-1',
      shopifyProductId: 'gid://shopify/Product/1',
      cartToken: 'cart-1',
      customerEmail: 'buyer@example.com',
      customerFingerprint: 'fingerprint-1',
      originalPrice: 1000,
      finalPrice: 850,
      discountPercent: 15,
      floorPrice: 700,
      currency: 'INR',
      status: 'CREATED',
      discountCode: null,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      conditions: {
        kind: 'cart_offer',
        versionHash: 'v1',
        cartContext: {},
        percentOff: 15,
      },
    })
    jest.mocked(resolveVerifiedCartContext).mockResolvedValue({
      versionHash: 'v1',
      mode: 'cart_percentage',
      lines: [{
        lineId: 'line-1',
        productId: 'gid://shopify/Product/1',
        variantId: null,
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
        title: 'Test product',
      }],
      subtotal: 1000,
      customerId: null,
      cartToken: 'cart-1',
    } as any)
    jest.mocked(computeCartOffer).mockReturnValue({
      ok: true,
      offer: {
        kind: 'cart_offer',
        mode: 'cart_percentage',
        subtotal: 1000,
        finalTotal: 850,
        floorTotal: 700,
        discountAmount: 150,
        percentOff: 15,
        quantity: 1,
        lineAdjustments: [],
      },
    } as any)

    const res = await POST(new Request('https://cart-gain.com/api/bargain/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess-1',
        sessionToken: 'tok',
        quoteToken,
        cartToken: 'cart-1',
        customerFingerprint: 'fingerprint-1',
        customerEmail: 'buyer@example.com',
      }),
    }) as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.finalPrice).toBe(850)
    expect(body.discountPercent).toBe(15)
    expect(body.discountCode).toBe('BARGAIN_XYZ')
    expect(body.purchaseUrl).toContain('/discount/BARGAIN_XYZ')
    expect(mockPrisma.bargainQuote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
    )
  })
})
