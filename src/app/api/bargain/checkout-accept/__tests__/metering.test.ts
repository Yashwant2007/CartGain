/**
 * @jest-environment node
 *
 * Genesis 3.0 regression tests for /api/bargain/checkout-accept.
 *
 * The old endpoint minted a real Shopify discount code from client-supplied
 * prices with no signed deal authorisation. It now REQUIRES a server-issued,
 * HMAC-signed quote, verifies the product/variant/price/quantity/code and the
 * checkout-token/customer bindings, claims the quote with an atomic CAS, then
 * gates and meters the deal exactly like /api/bargain/accept.
 */
import { POST } from '@/app/api/bargain/checkout-accept/route'
import prisma from '@/lib/db'
import { getBargainGate, decideDealMode, recordBargainDealOps } from '@/lib/bargain/gate'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import {
  loadQuoteByToken,
  markQuoteCheckoutPending,
  quoteBindingMatches,
  quoteMatchesDeal,
  revalidateQuote,
} from '@/lib/bargain/quote'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    bargainSession: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
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
  fetchShopifyProductDetail: jest.fn(async () => null),
}))

jest.mock('@/lib/services/bargain', () => ({
  computeMinPrice: jest.fn(async () => ({ minPrice: 700 })),
}))

jest.mock('@/lib/bargain/discount', () => ({
  generateBargainDiscountCode: jest.fn(async ({ code }: any) => ({ code, status: 'created' })),
}))

jest.mock('@/lib/bargain/quote', () => ({
  loadQuoteByToken: jest.fn(async () => null),
  revalidateQuote: jest.fn(() => ({ ok: true })),
  markQuoteCheckoutPending: jest.fn(async () => ({})),
  quoteMatchesDeal: jest.fn(() => true),
  quoteBindingMatches: jest.fn(() => true),
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))

jest.mock('@/lib/bargain/gate', () => ({
  getBargainGate: jest.fn(async () => ({ planId: 'free', subscriptionId: 'sub-1' })),
  decideDealMode: jest.fn(() => 'included'),
  recordBargainDealOps: jest.fn(() => []),
  BARGAIN_DEALS_EXHAUSTED: 'bargain_deals_exhausted',
}))

const prismaMock = prisma as any
const getGateMock = getBargainGate as jest.Mock
const decideDealModeMock = decideDealMode as jest.Mock
const recordDealOpsMock = recordBargainDealOps as jest.Mock
const mintMock = generateBargainDiscountCode as jest.Mock
const loadQuoteMock = loadQuoteByToken as jest.Mock
const revalidateQuoteMock = revalidateQuote as jest.Mock
const markQuotePendingMock = markQuoteCheckoutPending as jest.Mock
const quoteMatchesMock = quoteMatchesDeal as jest.Mock
const quoteBindingMock = quoteBindingMatches as jest.Mock

const store = {
  id: 'store-1',
  userId: 'user-1',
  name: 'Test Store',
  domain: 'test',
  currency: 'INR',
  platform: 'shopify',
  timezone: 'Asia/Kolkata',
}

function validQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    storeId: 'store-1',
    sessionId: null,
    status: 'ACCEPTED',
    shopifyProductId: 'gid://shopify/Product/1',
    variantId: null,
    quantity: 1,
    originalPrice: 1000,
    finalPrice: 850,
    discountCode: 'BARGAIN_ABC',
    cartToken: 'checkout-token',
    customerEmail: null,
    customerFingerprint: null,
    shopifyCustomerId: null,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  }
}

function validCartQuote(overrides: Record<string, unknown> = {}) {
  return {
    ...validQuote({ sessionId: 'sess-cart', originalPrice: 1800, finalPrice: 1530 }),
    conditions: {
      kind: 'cart_offer',
      mode: 'bundle',
      subtotal: 1800,
      finalTotal: 1530,
      percentOff: 15,
    },
    ...overrides,
  }
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('https://cart-gain.com/api/bargain/checkout-accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      shopDomain: 'test.myshopify.com',
      platform: 'shopify',
      shopifyProductId: 'gid://shopify/Product/1',
      variantId: null,
      originalPrice: 1000,
      finalPrice: 850,
      discountPercent: 15,
      code: 'BARGAIN_ABC',
      quoteToken: 'bquote-1',
      cartToken: 'checkout-token',
      ...body,
    }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  loadQuoteMock.mockResolvedValue(validQuote())
  revalidateQuoteMock.mockReturnValue({ ok: true })
  markQuotePendingMock.mockResolvedValue({})
  quoteMatchesMock.mockReturnValue(true)
  quoteBindingMock.mockReturnValue(true)
  prismaMock.store.findFirst.mockResolvedValue({ ...store })
  prismaMock.bargainConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainSession.findFirst.mockResolvedValue(null)
  prismaMock.bargainSession.create.mockResolvedValue({})
  getGateMock.mockResolvedValue({ planId: 'free', subscriptionId: 'sub-1' })
  decideDealModeMock.mockReturnValue('included')
  recordDealOpsMock.mockReturnValue([])
  mintMock.mockImplementation(async ({ code }: any) => ({ code, status: 'created' }))
})

describe('POST /api/bargain/checkout-accept — signed quote authority', () => {
  it('always uses the code authorised by the quote, never a client-invented code', async () => {
    const res = await POST(makeRequest({ code: 'ATTACKER_CODE' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.message).toBe('Quote code mismatch')
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('requires a quote token even when BARGAIN_QUOTE is off', async () => {
    process.env.BARGAIN_QUOTE = 'false'
    const res = await POST(makeRequest({ quoteToken: undefined, code: undefined }))

    expect(res.status).toBe(400)
    expect(loadQuoteMock).not.toHaveBeenCalled()
    expect(mintMock).not.toHaveBeenCalled()
    delete process.env.BARGAIN_QUOTE
  })

  it('refuses an unknown quote before idempotent replay', async () => {
    loadQuoteMock.mockResolvedValueOnce(null)
    prismaMock.bargainSession.findFirst.mockResolvedValue({ discountCode: 'BARGAIN_ABC' })

    const res = await POST(makeRequest())
    expect(res.status).toBe(409)
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('refuses a terminal quote', async () => {
    loadQuoteMock.mockResolvedValueOnce(validQuote({ status: 'REDEEMED' }))

    const res = await POST(makeRequest())
    expect(res.status).toBe(409)
    expect(revalidateQuoteMock).not.toHaveBeenCalled()
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('refuses a quote that does not match the checkout deal', async () => {
    quoteMatchesMock.mockReturnValueOnce(false)

    const res = await POST(makeRequest())
    expect(res.status).toBe(409)
    expect(res.status).toBe(409)
    expect(bodyMessage(await res.json())).toContain('does not match')
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('refuses a quote bound to a different checkout token/customer', async () => {
    quoteBindingMock.mockReturnValueOnce(false)

    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('honours an accepted quote, claims it, and meters the deal', async () => {
    const quote = validQuote()
    loadQuoteMock.mockResolvedValueOnce(quote)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, code: 'BARGAIN_ABC', platform: 'shopify' })
    expect(revalidateQuoteMock).toHaveBeenCalledWith(quote, { price: 1000, floor: 700 })
    expect(markQuotePendingMock).toHaveBeenCalledWith(quote)
    expect(mintMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.bargainSession.create).toHaveBeenCalledTimes(1)
    expect(recordDealOpsMock).toHaveBeenCalledTimes(1)
  })

  it('returns an already-authorised cart quote code without minting or re-metering', async () => {
    const quote = validCartQuote()
    loadQuoteMock.mockResolvedValueOnce(quote)
    prismaMock.bargainSession.findFirst.mockResolvedValueOnce({
      discountCode: 'BARGAIN_ABC',
      purchaseUrl: 'https://test/discount/BARGAIN_ABC',
    })

    const res = await POST(makeRequest({ originalPrice: 1800, finalPrice: 1530 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      code: 'BARGAIN_ABC',
      scope: 'cart',
      purchaseUrl: 'https://test/discount/BARGAIN_ABC',
    })
    expect(markQuotePendingMock).toHaveBeenCalledWith(quote)
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
    expect(recordDealOpsMock).not.toHaveBeenCalled()
  })

  it('refuses a client-invented code for a cart quote', async () => {
    loadQuoteMock.mockResolvedValueOnce(validCartQuote())

    const res = await POST(makeRequest({ code: 'ATTACKER_CODE', originalPrice: 1800, finalPrice: 1530 }))

    expect(res.status).toBe(409)
    expect(bodyMessage(await res.json())).toBe('Quote code mismatch')
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('stores checkout binding fields on the accepted session', async () => {
    await POST(makeRequest({ shopifyCustomerId: 'gid://shopify/Customer/555', customerEmail: 'buyer@example.com' }))
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data

    expect(created).toMatchObject({
      cartToken: 'checkout-token',
      discountCodeCartToken: 'checkout-token',
      discountCodeCustomerEmail: 'buyer@example.com',
      customerEmail: 'buyer@example.com',
      externalCustomerId: '555',
      platform: 'shopify',
      status: 'accepted',
    })
  })

  it('fails closed when the quote cannot be atomically claimed', async () => {
    markQuotePendingMock.mockResolvedValueOnce(null)

    const res = await POST(makeRequest())
    expect(res.status).toBe(409)
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
  })
})

function bodyMessage(body: { message?: string }) {
  return body.message ?? ''
}

describe('POST /api/bargain/checkout-accept — plan gate + metering', () => {
  it('mints and meters the deal when quota remains', async () => {
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mintMock).toHaveBeenCalledTimes(1)
    expect(checkSimpleRateLimit).toHaveBeenCalledWith(expect.stringContaining('bargain_checkout_accept_'))
    expect(checkSimpleRateLimit).toHaveBeenCalledWith('bargain_codes_store-1', {
      maxRequests: 250,
      windowMs: 60 * 60 * 1000,
    })
    expect(prismaMock.bargainSession.create).toHaveBeenCalledTimes(1)
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created).toMatchObject({
      storeId: 'store-1',
      discountCode: 'BARGAIN_ABC',
      finalPrice: 850,
      bargainFloor: 700,
      status: 'accepted',
    })
    expect(recordDealOpsMock.mock.calls[0]).toEqual([
      expect.objectContaining({ subscriptionId: 'sub-1' }),
      created.id,
      1000,
      850,
      'included',
    ])
  })

  it('returns a purchase URL that applies the negotiated code to the variant cart', async () => {
    const res = await POST(makeRequest({ variantId: 'gid://shopify/ProductVariant/777' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.purchaseUrl).toBe('https://test/cart/777:1?discount=BARGAIN_ABC')
    expect(prismaMock.bargainSession.create.mock.calls[0][0].data.purchaseUrl).toBe(body.purchaseUrl)
    expect(mintMock.mock.calls[0][0]).toMatchObject({
      shopifyProductId: 'gid://shopify/Product/1',
      variantId: 'gid://shopify/ProductVariant/777',
    })
  })

  it('refuses a pending code and never records an accepted deal', async () => {
    mintMock.mockResolvedValueOnce({ code: 'BARGAIN_PENDING', status: 'pending', verified: false })

    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
    expect(recordDealOpsMock).not.toHaveBeenCalled()
  })

  it('BLOCKS (402) an exhausted free store before minting a single code', async () => {
    decideDealModeMock.mockReturnValue('blocked_free')

    const res = await POST(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(402)
    expect(body.code).toBe('bargain_deals_exhausted')
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
  })

  it('BLOCKS (402) a paid store whose overage is disabled', async () => {
    decideDealModeMock.mockReturnValue('blocked_no_overage')

    const res = await POST(makeRequest())
    expect(res.status).toBe(402)
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('meters an overage deal when the free quota is spent but overage is on', async () => {
    decideDealModeMock.mockReturnValue('overage')

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(recordDealOpsMock.mock.calls[0][4]).toBe('overage')
  })

  it('is idempotent — a retried quote/code is NOT re-minted or double-metered', async () => {
    prismaMock.bargainSession.findFirst.mockResolvedValue({ discountCode: 'BARGAIN_ABC' })

    const res = await POST(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, code: 'BARGAIN_ABC' })
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
    expect(recordDealOpsMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/bargain/checkout-accept — buyer binding', () => {
  it('normalizes a gid customer id before it reaches Shopify', async () => {
    await POST(makeRequest({ shopifyCustomerId: 'gid://shopify/Customer/555' }))
    expect(mintMock.mock.calls[0][0].shopifyCustomerId).toBe('555')
  })

  it('normalizes a raw numeric customer id', async () => {
    await POST(makeRequest({ shopifyCustomerId: '555' }))
    expect(mintMock.mock.calls[0][0].shopifyCustomerId).toBe('555')
  })

  it('IGNORES a malformed customer id', async () => {
    await POST(makeRequest({ shopifyCustomerId: 'gid://shopify/Customer/1) { evil' }))
    expect(mintMock.mock.calls[0][0].shopifyCustomerId).toBeNull()
  })

  it('drops a non-email value rather than persisting it', async () => {
    await POST(makeRequest({ customerEmail: 'not-an-email' }))
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created.customerEmail).toBeNull()
  })
})

describe('POST /api/bargain/checkout-accept — master controls', () => {
  it('blocks acceptance when the merchant has disabled bargaining', async () => {
    prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: false })

    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
  })

  it('stamps acceptedAt on the created session', async () => {
    await POST(makeRequest())
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created.acceptedAt).toBeInstanceOf(Date)
  })

  it('rejects a client-declared whole-cart discount', async () => {
    const res = await POST(makeRequest({ orderLevel: true }))
    expect(res.status).toBe(400)
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
  })
})
