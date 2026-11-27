/**
 * @jest-environment node
 *
 * Regression tests for /api/bargain/checkout-accept hardening.
 *
 * Fault: the endpoint minted REAL Shopify discount codes from client-supplied
 * values (the Checkout UI Extension cannot carry a bargain session) with NO plan
 * gate and NO metering. Every checkout-origin deal bypassed the deal quota and
 * never booked a rev-share event — a billing/revenue black hole.
 *
 * Fix: gate on the plan deal quota BEFORE minting, then create a BargainSession
 * and meter the deal (recordBargainDealOps) exactly like /api/bargain/accept, so
 * the deal counts against quota and a rev-share event is booked. The issued code
 * is stored on the session so orders/create can attribute the purchase (the code
 * must actually appear on the order, so attribution cannot be faked).
 */
import { POST } from '@/app/api/bargain/checkout-accept/route'
import prisma from '@/lib/db'
import { getBargainGate, decideDealMode, recordBargainDealOps } from '@/lib/bargain/gate'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { loadQuoteByToken, markQuoteCheckoutPending, revalidateQuote } from '@/lib/bargain/quote'
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

const store = {
  id: 'store-1',
  userId: 'user-1',
  name: 'Test Store',
  domain: 'test',
  currency: 'INR',
  platform: 'shopify',
  timezone: 'Asia/Kolkata',
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('https://cart-gain.com/api/bargain/checkout-accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      shopDomain: 'test.myshopify.com',
      shopifyProductId: 'gid://shopify/Product/1',
      variantId: null,
      originalPrice: 1000,
      finalPrice: 850,
      discountPercent: 15,
      code: 'BARGAIN_ABC',
      ...body,
    }),
  }) as any
}

const originalQuoteFlag = process.env.BARGAIN_QUOTE

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.BARGAIN_QUOTE
  loadQuoteMock.mockResolvedValue(null)
  revalidateQuoteMock.mockReturnValue({ ok: true })
  markQuotePendingMock.mockResolvedValue({})
  prismaMock.store.findFirst.mockResolvedValue({ ...store })
  prismaMock.bargainConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainSession.findFirst.mockResolvedValue(null)
  prismaMock.bargainSession.create.mockResolvedValue({})
  decideDealModeMock.mockReturnValue('included')
  recordDealOpsMock.mockReturnValue([])
  mintMock.mockImplementation(async ({ code }: any) => ({ code, status: 'created' }))
})

afterAll(() => {
  if (originalQuoteFlag == null) delete process.env.BARGAIN_QUOTE
  else process.env.BARGAIN_QUOTE = originalQuoteFlag
})

describe('POST /api/bargain/checkout-accept — plan gate + metering', () => {
  it('issues the code server-side when the client does not supply one', async () => {
    const res = await POST(makeRequest({ code: undefined }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.code).toMatch(/^BARGAIN-[0-9A-F]{8}$/)
    expect(mintMock).toHaveBeenCalledTimes(1)
    expect(mintMock.mock.calls[0][0].code).toBe(body.code)
    expect(checkSimpleRateLimit).toHaveBeenCalledWith(expect.stringContaining('bargain_checkout_accept_'))
    expect(checkSimpleRateLimit).toHaveBeenCalledWith('bargain_codes_store-1', {
      maxRequests: 250,
      windowMs: 60 * 60 * 1000,
    })
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
    expect(prismaMock.bargainSession.create.mock.calls[0][0].data).toMatchObject({
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

  it('mints a Shopify code AND meters the deal when quota remains', async () => {
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mintMock).toHaveBeenCalledTimes(1)

    // The deal is recorded against the plan: one BargainSession is created…
    expect(prismaMock.bargainSession.create).toHaveBeenCalledTimes(1)
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created).toMatchObject({
      storeId: 'store-1',
      discountCode: 'BARGAIN_ABC',
      finalPrice: 850,
      bargainFloor: 700,
      status: 'accepted',
    })

    // …and the deal meter/rev-share ops run against the new session id.
    expect(recordDealOpsMock).toHaveBeenCalledTimes(1)
    expect(recordDealOpsMock.mock.calls[0]).toEqual([
      expect.objectContaining({ subscriptionId: 'sub-1' }),
      created.id,
      1000,
      850,
      'included',
    ])
  })

  it('BLOCKS (402) an exhausted free store before minting a single code', async () => {
    decideDealModeMock.mockReturnValue('blocked_free')

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(402)
    expect(body.code).toBe('bargain_deals_exhausted')
    // Nothing was minted or metered — the leak is closed.
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
    expect(recordDealOpsMock).not.toHaveBeenCalled()
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

  it('is idempotent — a retried code is NOT re-minted or double-metered', async () => {
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
  it('binds the code to the customer when a gid id is supplied', async () => {
    await POST(makeRequest({ shopifyCustomerId: 'gid://shopify/Customer/555' }))

    const opts = mintMock.mock.calls[0][0]
    // Normalized to the raw numeric id `buildCustomerSelection` expects.
    expect(opts.shopifyCustomerId).toBe('555')
  })

  it('binds the code when a raw numeric customer id is supplied', async () => {
    await POST(makeRequest({ shopifyCustomerId: '555' }))
    expect(mintMock.mock.calls[0][0].shopifyCustomerId).toBe('555')
  })

  it('IGNORES a malformed customer id (never reaches the Shopify discount body)', async () => {
    await POST(makeRequest({ shopifyCustomerId: 'gid://shopify/Customer/1) { evil' }))
    expect(mintMock.mock.calls[0][0].shopifyCustomerId).toBeNull()
  })

  it('stores the customer email on the deal session when provided', async () => {
    await POST(makeRequest({ customerEmail: 'buyer@example.com' }))
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created.customerEmail).toBe('buyer@example.com')
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
})

describe('POST /api/bargain/checkout-accept — product scope + quotes', () => {
  it('rejects a client-declared whole-cart discount', async () => {
    const res = await POST(makeRequest({ orderLevel: true }))
    expect(res.status).toBe(400)
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
  })

  it('requires a quote token when BARGAIN_QUOTE is enabled', async () => {
    process.env.BARGAIN_QUOTE = 'true'
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    expect(loadQuoteMock).not.toHaveBeenCalled()
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('refuses an unknown quote before idempotent replay', async () => {
    process.env.BARGAIN_QUOTE = 'true'
    loadQuoteMock.mockResolvedValueOnce(null)
    prismaMock.bargainSession.findFirst.mockResolvedValue({ discountCode: 'BARGAIN_ABC' })

    const res = await POST(makeRequest({ quoteToken: 'bquote-unknown' }))
    expect(res.status).toBe(409)
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('refuses a terminal quote', async () => {
    process.env.BARGAIN_QUOTE = 'true'
    loadQuoteMock.mockResolvedValueOnce({
      id: 'q1',
      storeId: 'store-1',
      status: 'REDEEMED',
      shopifyProductId: 'gid://shopify/Product/1',
      variantId: null,
      originalPrice: 1000,
      finalPrice: 850,
      discountCode: 'BARGAIN_ABC',
      expiresAt: new Date(Date.now() + 60_000),
    })

    const res = await POST(makeRequest({ quoteToken: 'bquote-1' }))
    expect(res.status).toBe(409)
    expect(revalidateQuoteMock).not.toHaveBeenCalled()
    expect(mintMock).not.toHaveBeenCalled()
  })

  it('honours an accepted quote and marks checkout pending', async () => {
    process.env.BARGAIN_QUOTE = 'true'
    const quote = {
      id: 'q1',
      storeId: 'store-1',
      status: 'ACCEPTED',
      shopifyProductId: 'gid://shopify/Product/1',
      variantId: null,
      originalPrice: 1000,
      finalPrice: 850,
      discountCode: 'BARGAIN_ABC',
      expiresAt: new Date(Date.now() + 60_000),
    }
    loadQuoteMock.mockResolvedValueOnce(quote)

    const res = await POST(makeRequest({ quoteToken: 'bquote-1' }))

    expect(res.status).toBe(200)
    expect(revalidateQuoteMock).toHaveBeenCalledWith(quote, { price: 1000, floor: 700 })
    expect(markQuotePendingMock).toHaveBeenCalledWith(quote)
    expect(mintMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the legacy path when BARGAIN_QUOTE is off', async () => {
    process.env.BARGAIN_QUOTE = 'false'
    loadQuoteMock.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ quoteToken: 'bquote-bogus' }))
    expect(res.status).toBe(200)
    expect(mintMock).toHaveBeenCalledTimes(1)
  })
})
