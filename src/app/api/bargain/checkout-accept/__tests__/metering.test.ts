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
      code: 'BARGAIN_ABC',
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
