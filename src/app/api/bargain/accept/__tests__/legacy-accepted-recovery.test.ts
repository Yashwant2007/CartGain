/**
 * @jest-environment node
 *
 * Regression tests for /api/bargain/accept — recovering sessions stranded by
 * the old offer-path bug.
 *
 * Fault: the offer route persisted status 'accepted' the moment the engine
 * said "accept", but never minted a discount code and never let the shopper
 * confirm. The accept route's atomic claim only matched status 'active', so the
 * shopper's tap returned 409 "Cannot accept — session is accepted." — a
 * dead-ended sale with the merchant's floor already revealed.
 *
 * Fix: the offer route now keeps the session ACTIVE on a proposal, and the
 * accept claim recovers a legacy 'accepted' row that still has NO code.
 */
import { POST } from '@/app/api/bargain/accept/route'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { getBargainGate, decideDealMode, recordBargainDealOps } from '@/lib/bargain/gate'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: { findUnique: jest.fn(), updateMany: jest.fn() },
    bargainMessage: { findMany: jest.fn(), create: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    cart: { findUnique: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  },
}))

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
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))

jest.mock('@/lib/bargain/discount', () => ({
  generateBargainDiscountCode: jest.fn(async ({ code }: any) => ({ code, status: 'created' })),
}))

const prismaMock = prisma as any
const mintMock = generateBargainDiscountCode as jest.Mock
const gateMock = getBargainGate as jest.Mock
const decideMock = decideDealMode as jest.Mock
const opsMock = recordBargainDealOps as jest.Mock

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    storeId: 'store-1',
    shopifyProductId: 'gid://shopify/Product/1',
    variantId: null,
    originalPrice: 1000,
    currentOffer: 850,
    finalPrice: 850,
    status: 'accepted',
    attemptsUsed: 3,
    customerEmail: null,
    customerPhone: null,
    language: 'en',
    cartToken: null,
    bulkQuantity: null,
    discountCode: null,
    purchaseUrl: null,
    expiredAt: new Date('2030-01-01T00:00:00.000Z'),
    store: {
      id: 'store-1',
      domain: 'test.myshopify.com',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      name: 'Test Store',
    },
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
  prismaMock.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainMessage.findMany.mockResolvedValue([])
  prismaMock.bargainMessage.create.mockResolvedValue({})
  prismaMock.bargainConfig.findUnique.mockResolvedValue(null)
  gateMock.mockResolvedValue({ planId: 'free', subscriptionId: 'sub-1' })
  decideMock.mockReturnValue('included')
  opsMock.mockReturnValue([])
  mintMock.mockImplementation(async ({ code }: any) => ({ code, status: 'created' }))
})

describe('POST /api/bargain/accept — legacy "accepted, no code" recovery', () => {
  it('claims a stranded accepted session (no code) and mints the deal', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(session())

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.discountCode).toBe('BARGAIN_XYZ')
    expect(mintMock).toHaveBeenCalledTimes(1)

    // The claim must match BOTH an active session and a legacy accepted one
    // that never got a code — that is the whole recovery.
    expect(prismaMock.bargainSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'sess-1',
          status: { in: ['active', 'accepted'] },
          discountCode: null,
        }),
        data: { status: 'accepting' },
      }),
    )
  })

  it('still replays the code for an already-completed accepted session', async () => {
    prismaMock.bargainSession.findUnique.mockResolvedValue(
      session({ discountCode: 'BARGAIN_OLD' }),
    )

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.discountCode).toBe('BARGAIN_OLD')
    // Never re-mints or re-meters a completed deal.
    expect(mintMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.updateMany).not.toHaveBeenCalled()
  })
})
