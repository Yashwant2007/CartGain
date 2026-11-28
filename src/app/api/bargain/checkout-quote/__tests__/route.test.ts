/**
 * @jest-environment node
 *
 * Genesis 3.0 regression tests for the Checkout UI quote authority.
 * The extension is untrusted: it may request a price, but the server re-reads
 * the live Shopify price/floor, mints a signed checkout-bound quote, and never
 * returns a price/floor that was not authorised here.
 */
import { OPTIONS, POST } from '@/app/api/bargain/checkout-quote/route'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { computeMinPrice } from '@/lib/services/bargain'
import { acceptQuote, createQuote } from '@/lib/bargain/quote'
import { track } from '@/lib/analytics/track'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('@/lib/redis', () => ({
  redisIncr: jest.fn(async () => 1),
  redisExpire: jest.fn(async () => true),
}))

jest.mock('@/lib/shopify', () => ({
  fetchShopifyProductPrice: jest.fn(async () => 1000),
}))

jest.mock('@/lib/services/bargain', () => ({
  computeMinPrice: jest.fn(async () => ({ minPrice: 700 })),
}))

jest.mock('@/lib/bargain/quote', () => ({
  createQuote: jest.fn(),
  acceptQuote: jest.fn(),
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))

jest.mock('@/lib/woocommerce/bargain-adapter', () => ({
  bargainPlatformFor: jest.fn((_storeId: string | null, platform: string) => platform),
  resolveActiveWooCommerceStore: jest.fn(async () => null),
}))

const prismaMock = prisma as any
const rateMock = checkSimpleRateLimit as jest.Mock
const priceMock = fetchShopifyProductPrice as jest.Mock
const floorMock = computeMinPrice as jest.Mock
const createQuoteMock = createQuote as jest.Mock
const acceptQuoteMock = acceptQuote as jest.Mock
const trackMock = track as jest.Mock

const store = {
  id: 'store-1',
  domain: 'test.myshopify.com',
  currency: 'INR',
  platform: 'shopify',
}

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    token: 'bquote-signed',
    status: 'CREATED',
    shopifyProductId: 'gid://shopify/Product/1',
    variantId: null,
    quantity: 1,
    originalPrice: 1000,
    finalPrice: 850,
    discountPercent: 15,
    currency: 'INR',
    discountCode: 'BARGAIN_QUOTE1',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeRequest(body: Record<string, unknown> = {}, origin?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (origin) headers.origin = origin
  return new Request('https://cart-gain.com/api/bargain/checkout-quote', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      shopDomain: 'test.myshopify.com',
      platform: 'shopify',
      productId: 'gid://shopify/Product/1',
      variantId: null,
      requestedPrice: 850,
      cartToken: 'checkout-token',
      shopifyCustomerId: 'gid://shopify/Customer/555',
      customerEmail: 'buyer@example.com',
      ...body,
    }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LINK_SECRET = 'test-secret-at-least-16-chars-long'
  rateMock.mockImplementation(async () => ({ allowed: true, retryAfter: 0 }))
  priceMock.mockResolvedValue(1000)
  floorMock.mockResolvedValue({ minPrice: 700 })
  prismaMock.store.findFirst.mockResolvedValue({ ...store })
  prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, emergencyPaused: false })
  createQuoteMock.mockResolvedValue(quote())
  acceptQuoteMock.mockResolvedValue(quote({ status: 'ACCEPTED' }))
})

afterAll(() => {
  delete process.env.LINK_SECRET
  delete process.env.BARGAIN_QUOTE
})

describe('POST /api/bargain/checkout-quote', () => {
  it('mints a checkout-bound signed quote from server-authoritative prices', async () => {
    process.env.BARGAIN_QUOTE = 'false'
    const res = await POST(makeRequest({}, 'https://checkout.shopify.com'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      quoteToken: 'bquote-signed',
      originalPrice: 1000,
      finalPrice: 850,
      discountPercent: 15,
      discountCode: 'BARGAIN_QUOTE1',
    })
    expect(createQuoteMock).toHaveBeenCalledTimes(1)
    expect(createQuoteMock.mock.calls[0][0]).toMatchObject({
      force: true,
      storeId: 'store-1',
      cartToken: 'checkout-token',
      shopifyProductId: 'gid://shopify/Product/1',
      originalPrice: 1000,
      finalPrice: 850,
      floorPrice: 700,
      discountCode: expect.any(String),
      customerEmail: 'buyer@example.com',
      shopifyCustomerId: '555',
      conditions: { source: 'checkout_ui_extension', platform: 'shopify' },
    })
    expect(acceptQuoteMock).toHaveBeenCalledWith(quote())
    expect(trackMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'cartgain_checkout_quote_issued',
      storeId: 'store-1',
    }))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://checkout.shopify.com')
  })

  it('rejects an untrusted checkout origin', async () => {
    const res = await OPTIONS(makeRequest({}, 'https://attacker.example'))

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('')
  })

  it('requires a checkout token binding', async () => {
    const res = await POST(makeRequest({ cartToken: undefined }))

    expect(res.status).toBe(400)
    expect(createQuoteMock).not.toHaveBeenCalled()
  })

  it('refuses an order-level discount request', async () => {
    const res = await POST(makeRequest({ orderLevel: true }))

    expect(res.status).toBe(400)
    expect(createQuoteMock).not.toHaveBeenCalled()
  })

  it('does not honour a price below the live floor', async () => {
    const res = await POST(makeRequest({ requestedPrice: 650 }))

    expect(res.status).toBe(409)
    expect(createQuoteMock).not.toHaveBeenCalled()
  })

  it('does not mint a quote when the store is not found', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)

    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
    expect(createQuoteMock).not.toHaveBeenCalled()
  })

  it('does not mint a quote when bargaining is disabled', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: false })

    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    expect(createQuoteMock).not.toHaveBeenCalled()
  })

  it('fails closed when the quote cannot be confirmed', async () => {
    acceptQuoteMock.mockResolvedValue(null)

    const res = await POST(makeRequest())
    expect(res.status).toBe(409)
  })

  it('rate-limits quote requests separately from code redemption', async () => {
    rateMock.mockImplementation(async (key: string) =>
      key.includes('checkout_quote')
        ? { allowed: false, retryAfter: 7 }
        : { allowed: true, retryAfter: 0 },
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('7')
    expect(createQuoteMock).not.toHaveBeenCalled()
  })
})
