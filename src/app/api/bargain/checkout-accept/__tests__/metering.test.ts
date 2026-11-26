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
      code: undefined,
      orderLevel: false,
      ...body,
    }),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.store.findFirst.mockResolvedValue({ ...store })
  prismaMock.bargainConfig.findUnique.mockResolvedValue(null)
  prismaMock.bargainSession.findFirst.mockResolvedValue(null)
  prismaMock.bargainSession.create.mockResolvedValue({})
  decideDealModeMock.mockReturnValue('included')
  recordDealOpsMock.mockReturnValue([])
  mintMock.mockImplementation(async ({ code }: any) => ({ code, status: 'created' }))
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
  })

  it('returns a purchase URL that applies the negotiated code to the variant cart', async () => {
    const res = await POST(makeRequest({ variantId: 'gid://shopify/ProductVariant/777' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.purchaseUrl).toBe(`https://test/cart/777:1?discount=${body.code}`)
    expect(prismaMock.bargainSession.create.mock.calls[0][0].data.purchaseUrl).toBe(body.purchaseUrl)
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
      discountCode: body.code,
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

  it('ignores an echoed code when the caller cannot prove ownership', async () => {
    prismaMock.bargainSession.findFirst.mockResolvedValue(null)

    const res = await POST(makeRequest({ code: 'BARGAIN_ABC' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.code).toMatch(/^BARGAIN-[0-9A-F]{8}$/)
    expect(body.code).not.toBe('BARGAIN_ABC')
    expect(mintMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.bargainSession.create).toHaveBeenCalledTimes(1)
  })

  it('replays an echoed code only when it is bound to the same buyer email', async () => {
    prismaMock.bargainSession.findFirst.mockResolvedValue({ discountCode: 'BARGAIN_BOUND' })

    const res = await POST(makeRequest({ code: 'BARGAIN_BOUND', customerEmail: 'Buyer@Example.com' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, code: 'BARGAIN_BOUND' })
    expect(prismaMock.bargainSession.findFirst.mock.calls[0][0].where.OR).toEqual([
      { discountCodeCustomerEmail: 'buyer@example.com' },
    ])
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.create).not.toHaveBeenCalled()
    expect(recordDealOpsMock).not.toHaveBeenCalled()
  })

  it('replays an echoed code only when it is bound to the same Shopify customer id', async () => {
    prismaMock.bargainSession.findFirst.mockResolvedValue({ discountCode: 'BARGAIN_BOUND' })

    const res = await POST(makeRequest({ code: 'BARGAIN_BOUND', shopifyCustomerId: 'gid://shopify/Customer/555' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, code: 'BARGAIN_BOUND' })
    expect(prismaMock.bargainSession.findFirst.mock.calls[0][0].where.OR).toEqual([
      { externalCustomerId: '555' },
    ])
    expect(mintMock).not.toHaveBeenCalled()
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

  it('stores the normalized customer email as the code binding on the deal session', async () => {
    await POST(makeRequest({ customerEmail: 'Buyer@Example.com' }))
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created.customerEmail).toBe('buyer@example.com')
    expect(created.discountCodeCustomerEmail).toBe('buyer@example.com')
  })

  it('stores the normalized customer id as the code binding on the deal session', async () => {
    await POST(makeRequest({ shopifyCustomerId: 'gid://shopify/Customer/555' }))
    const created = prismaMock.bargainSession.create.mock.calls[0][0].data
    expect(created.externalCustomerId).toBe('555')
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
