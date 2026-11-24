/**
 * @jest-environment node
 */
import { acceptBundleQuoteForSession } from '@/lib/bargain/bundle-accept'
import prisma from '@/lib/db'
import { findBundleQuoteByToken } from '@/lib/bargain/bundle-quote'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { computeMinPrice } from '@/lib/services/bargain'
import { generateBargainBundleDiscountCode } from '@/lib/bargain/discount'
import { getBargainGate } from '@/lib/bargain/gate'
import { track } from '@/lib/analytics/track'

jest.mock('@/lib/db', () => {
  const mock: any = {
    bargainSession: { updateMany: jest.fn(), findUnique: jest.fn() },
    bargainConfig: { findUnique: jest.fn() },
    bargainBundleQuote: { updateMany: jest.fn() },
    bargainMessage: { findMany: jest.fn(), create: jest.fn() },
    cart: { findUnique: jest.fn() },
  }
  mock.$transaction = jest.fn(async (ops: any[]) => Promise.all(ops))
  return { __esModule: true, default: mock }
})

jest.mock('@/lib/bargain/bundle-quote', () => ({
  findBundleQuoteByToken: jest.fn(),
}))

jest.mock('@/lib/shopify', () => ({
  fetchShopifyProductPrice: jest.fn(),
}))

jest.mock('@/lib/services/bargain', () => ({
  computeMinPrice: jest.fn(),
}))

jest.mock('@/lib/bargain/discount', () => ({
  generateBargainBundleDiscountCode: jest.fn(),
}))

jest.mock('@/lib/bargain/gate', () => ({
  getBargainGate: jest.fn(async () => ({ planId: 'free', subscriptionId: null })),
  decideDealMode: jest.fn(() => 'included'),
  recordBargainDealOps: jest.fn(() => []),
  BARGAIN_DEALS_EXHAUSTED: 'bargain_deals_exhausted',
}))

jest.mock('@/lib/bargain/policy', () => ({
  bargainCampaignStatus: jest.fn(() => 'active'),
  couponMentionedInMessages: jest.fn(() => false),
}))

jest.mock('@/lib/bargain/learning/outcomes', () => ({
  recordLearningAcceptance: jest.fn(async () => {}),
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))

jest.mock('@/lib/bargain/payment', () => ({
  detectPaymentIntent: jest.fn(() => 'unknown'),
}))

jest.mock('@/lib/woocommerce/bargain-adapter', () => ({
  bargainPlatformFor: jest.fn(() => 'shopify'),
}))

const prismaMock = prisma as any
const findQuoteMock = findBundleQuoteByToken as jest.Mock
const fetchPriceMock = fetchShopifyProductPrice as jest.Mock
const computeMinPriceMock = computeMinPrice as jest.Mock
const createCodeMock = generateBargainBundleDiscountCode as jest.Mock
const trackMock = track as jest.Mock
const getGateMock = getBargainGate as jest.Mock

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    storeId: 'store-1',
    sessionId: 'sess-1',
    status: 'CREATED',
    discountCode: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    discountPercent: 15,
    listTotal: 1800,
    floorTotal: 1300,
    offerTotal: 1530,
    items: [
      { productId: '1', variantId: null, title: 'Serum', price: 1000, floor: 700, quantity: 1 },
      { productId: '2', variantId: null, title: 'Moisturizer', price: 800, floor: 600, quantity: 1 },
    ],
    ...overrides,
  }
}

function session() {
  return {
    id: 'sess-1',
    storeId: 'store-1',
    status: 'active',
    attemptsUsed: 2,
    customerEmail: 'buyer@example.com',
    cartToken: 'cart-1',
    expiredAt: new Date(Date.now() + 60 * 60 * 1000),
    store: { id: 'store-1', domain: 'test.myshopify.com', currency: 'INR', name: 'Test Store' },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  findQuoteMock.mockResolvedValue(quote())
  fetchPriceMock.mockImplementation(async (_store: any, productId: string) => productId === '1' ? 1000 : 800)
  computeMinPriceMock.mockImplementation(async ({ shopifyProductId }: any) => ({
    isBargainable: true,
    minPrice: shopifyProductId === '1' ? 700 : 600,
  }))
  createCodeMock.mockResolvedValue({ code: 'GAINBUNDLE', status: 'created', verified: true })
  getGateMock.mockResolvedValue({ planId: 'free', subscriptionId: null })
  prismaMock.bargainConfig.findUnique.mockResolvedValue({ maxAttempts: 3, couponStackingEnabled: false })
  prismaMock.bargainSession.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainSession.findUnique.mockResolvedValue(null)
  prismaMock.bargainBundleQuote.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.bargainMessage.findMany.mockResolvedValue([])
  prismaMock.bargainMessage.create.mockResolvedValue({})
  prismaMock.cart.findUnique.mockResolvedValue({ customerId: 'gid://shopify/Customer/9' })
})

describe('bundle quote acceptance', () => {
  it('revalidates live prices, mints one bundle code, and commits the accepted session', async () => {
    const res = await acceptBundleQuoteForSession({ session: session(), token: 'bbundle:token' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      sessionId: 'sess-1',
      finalPrice: 1530,
      discountPercent: 15,
      discountCode: 'GAINBUNDLE',
      bundle: true,
      purchaseUrl: 'https://test.myshopify.com/discount/GAINBUNDLE',
    })
    expect(createCodeMock).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({ productId: '1' })]),
      listTotal: 1800,
      offerTotal: 1530,
      discountPercent: 15,
    }))
    const updateCalls = prismaMock.bargainSession.updateMany.mock.calls
    expect(updateCalls[updateCalls.length - 1][0].data).toMatchObject({
      status: 'accepted',
      finalPrice: 1530,
      discountCode: 'GAINBUNDLE',
    })
    expect(trackMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'cartgain_bundle_accepted' }))
  })

  it('refuses a stale bundle when a live item price moved', async () => {
    fetchPriceMock.mockImplementation(async (_store: any, productId: string) => productId === '1' ? 1000 : 900)

    const res = await acceptBundleQuoteForSession({ session: session(), token: 'bbundle:token' })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.message).toContain('prices changed')
    expect(createCodeMock).not.toHaveBeenCalled()
    expect(prismaMock.bargainSession.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a token bound to another session', async () => {
    findQuoteMock.mockResolvedValue(quote({ sessionId: 'other-session' }))

    const res = await acceptBundleQuoteForSession({ session: session(), token: 'bbundle:token' })

    expect(res.status).toBe(403)
    expect(createCodeMock).not.toHaveBeenCalled()
  })
})
