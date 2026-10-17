// Unit tests for the post-bargain purchase window + attribution.
// Pure helpers are tested directly; DB-backed flows run against a mocked Prisma.
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bargainMessage: { findFirst: jest.fn() },
    cart: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/bargain/discount', () => ({
  generateBargainDiscountCode: jest.fn(),
}))

jest.mock('@/lib/services/bargain', () => ({
  computeMinPrice: jest.fn(),
}))

jest.mock('@/lib/bargain/gate', () => ({
  getBargainGate: jest.fn(),
}))

jest.mock('@/lib/analytics/track', () => ({ track: jest.fn().mockResolvedValue(undefined) }))

import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { computeMinPrice } from '@/lib/services/bargain'
import { getBargainGate } from '@/lib/bargain/gate'
import {
  buildBargainCheckoutUrl,
  generateBargainCode,
  generateClaimToken,
  issueRetentionDiscount,
  attributeBargainPurchase,
} from '@/lib/bargain/purchase'

const mockPrisma = prisma as any
const mockDiscount = generateBargainDiscountCode as jest.Mock
const mockFloor = computeMinPrice as jest.Mock
const mockGate = getBargainGate as jest.Mock

const STORE = {
  id: 'store1',
  userId: 'user1',
  name: 'Test Store',
  domain: 'test.myshopify.com',
  currency: 'INR',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('buildBargainCheckoutUrl', () => {
  it('builds a discount link with a variant cart redirect', () => {
    const url = buildBargainCheckoutUrl({
      domain: 'shop.myshopify.com',
      code: 'BARGAIN-AB12CD34',
      variantId: 'gid://shopify/ProductVariant/555',
      quantity: 1,
    })
    expect(url).toBe('https://shop.myshopify.com/discount/BARGAIN-AB12CD34?redirect=%2Fcart%2F555%3A1')
  })

  it('encodes the redirect and quantity', () => {
    const url = buildBargainCheckoutUrl({
      domain: 'shop.myshopify.com',
      code: 'BARGAIN-AB12CD34',
      variantId: '555',
      quantity: 3,
    })
    expect(url).toBe('https://shop.myshopify.com/discount/BARGAIN-AB12CD34?redirect=%2Fcart%2F555%3A3')
  })

  it('falls back to the plain discount link when there is no variant', () => {
    const url = buildBargainCheckoutUrl({ domain: 'https://shop.myshopify.com/', code: 'BARGAIN-AB12CD34' })
    expect(url).toBe('https://shop.myshopify.com/discount/BARGAIN-AB12CD34')
  })
})

describe('code + token generation', () => {
  it('generates a non-guessable BARGAIN- code', () => {
    const code = generateBargainCode()
    expect(code).toMatch(/^BARGAIN-[0-9A-F]{8}$/)
    expect(generateBargainCode()).not.toBe(code)
  })

  it('generates a unique opaque claim token', () => {
    const a = generateClaimToken()
    const b = generateClaimToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(20)
  })
})

function sessionFixture(over: Record<string, any> = {}) {
  return {
    id: 'sess1',
    storeId: 'store1',
    shopifyProductId: 'p1',
    variantId: null,
    originalPrice: 1000,
    currentOffer: 1000,
    finalPrice: null,
    bulkQuantity: null,
    discountCode: null,
    discountCodeCustomerEmail: null,
    discountCodeCartToken: null,
    purchaseUrl: null,
    customerEmail: 'buyer@example.com',
    customerToken: null,
    cartToken: 'cart1',
    store: { domain: 'test-store.myshopify.com', currency: 'INR', apiKey: 'tok' },
    ...over,
  }
}

describe('issueRetentionDiscount', () => {
  beforeEach(() => {
    ;(computeMinPrice as jest.Mock).mockResolvedValue({ minPrice: 700 })
    ;(generateBargainDiscountCode as jest.Mock).mockImplementation(async (o: any) => ({ code: o.code, status: 'created' }))
  })

  it('mints a code at the last price WE offered when the deal was not accepted', async () => {
    ;(prisma.bargainSession.findUnique as jest.Mock).mockResolvedValue(sessionFixture())
    ;(prisma.bargainMessage.findFirst as jest.Mock).mockResolvedValue({ offeredPrice: 820 })
    ;(prisma.bargainSession.update as jest.Mock).mockResolvedValue({})

    const result = await issueRetentionDiscount('sess1')

    expect(result).not.toBeNull()
    expect(result!.finalPrice).toBe(820)
    expect(result!.code).toMatch(/^BARGAIN-[0-9A-F]{8}$/)
    expect(result!.purchaseUrl).toContain('/discount/')
    const updateArg = (prisma.bargainSession.update as jest.Mock).mock.calls[0][0]
    expect(updateArg.data.discountCode).toBe(result!.code)
    expect(updateArg.data.finalPrice).toBe(820)
    expect(updateArg.data.purchaseUrl).toBe(result!.purchaseUrl)
  })

  it('clamps a below-floor offer up to the floor', async () => {
    ;(prisma.bargainSession.findUnique as jest.Mock).mockResolvedValue(sessionFixture())
    ;(prisma.bargainMessage.findFirst as jest.Mock).mockResolvedValue({ offeredPrice: 500 })
    ;(prisma.bargainSession.update as jest.Mock).mockResolvedValue({})

    const result = await issueRetentionDiscount('sess1')
    expect(result!.finalPrice).toBe(700)
  })

  it('returns null when there is no discount to give (offer at list)', async () => {
    ;(prisma.bargainSession.findUnique as jest.Mock).mockResolvedValue(sessionFixture())
    ;(prisma.bargainMessage.findFirst as jest.Mock).mockResolvedValue({ offeredPrice: 1000 })

    expect(await issueRetentionDiscount('sess1')).toBeNull()
    expect(prisma.bargainSession.update).not.toHaveBeenCalled()
  })

  it('binds the retention code to the cart\'s Shopify customer', async () => {
    ;(prisma.bargainSession.findUnique as jest.Mock).mockResolvedValue(sessionFixture())
    ;(prisma.bargainMessage.findFirst as jest.Mock).mockResolvedValue({ offeredPrice: 820 })
    ;(prisma.bargainSession.update as jest.Mock).mockResolvedValue({})
    ;(prisma.cart.findUnique as jest.Mock).mockResolvedValue({ customerId: 'cust_123' })

    await issueRetentionDiscount('sess1')

    const discountArg = (generateBargainDiscountCode as jest.Mock).mock.calls[0][0]
    expect(discountArg.shopifyCustomerId).toBe('cust_123')
  })

  it('leaves the code unbound when the cart owner is unknown', async () => {
    ;(prisma.bargainSession.findUnique as jest.Mock).mockResolvedValue(sessionFixture())
    ;(prisma.bargainMessage.findFirst as jest.Mock).mockResolvedValue({ offeredPrice: 820 })
    ;(prisma.bargainSession.update as jest.Mock).mockResolvedValue({})
    ;(prisma.cart.findUnique as jest.Mock).mockResolvedValue(null)

    await issueRetentionDiscount('sess1')

    const discountArg = (generateBargainDiscountCode as jest.Mock).mock.calls[0][0]
    expect(discountArg.shopifyCustomerId).toBeNull()
  })

  it('resurfaces an already-issued code (idempotent)', async () => {
    ;(prisma.bargainSession.findUnique as jest.Mock).mockResolvedValue(
      sessionFixture({ discountCode: 'BARGAIN-EXISTING', finalPrice: 850, purchaseUrl: 'https://shop/discount/BARGAIN-EXISTING' }),
    )

    const result = await issueRetentionDiscount('sess1')
    expect(result!.code).toBe('BARGAIN-EXISTING')
    expect(result!.finalPrice).toBe(850)
    expect(prisma.bargainMessage.findFirst).not.toHaveBeenCalled()
    expect(generateBargainDiscountCode).not.toHaveBeenCalled()
  })
})

describe('attributeBargainPurchase', () => {
  function txMock(claimCount = 1, existingEvent: any = null) {
    const tx = {
      bargainSession: { updateMany: jest.fn().mockResolvedValue({ count: claimCount }) },
      analytics: { upsert: jest.fn().mockResolvedValue({}) },
      bargainRevenueShareEvent: {
        findUnique: jest.fn().mockResolvedValue(existingEvent),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      subscription: { update: jest.fn().mockResolvedValue({}) },
    }
    return tx
  }

  const params = {
    store: { id: 'store1', userId: 'user1', timezone: 'UTC' },
    shopifyOrderId: 'order9',
    orderAmount: 820,
    orderCreatedAt: new Date(),
    email: 'buyer@example.com',
    appliedCodes: ['BARGAIN-XYZ'],
  }

  beforeEach(() => {
    ;(getBargainGate as jest.Mock).mockResolvedValue({ subscriptionId: 'sub1', plan: { revSharePercent: 3.5 } })
    ;(prisma.bargainSession.findFirst as jest.Mock).mockResolvedValue({
      id: 'sess1',
      finalPrice: 820,
      originalPrice: 1000,
      shopifyProductId: 'p1',
    })
  })

  it('marks the session purchased and books analytics + rev share once', async () => {
    const tx = txMock(1, null)
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx))

    const ok = await attributeBargainPurchase(params)
    expect(ok).toBe(true)

    const claimWhere = tx.bargainSession.updateMany.mock.calls[0][0].where
    expect(claimWhere).toEqual({ id: 'sess1', purchasedOrderId: null })
    expect(tx.analytics.upsert).toHaveBeenCalledTimes(1)
    expect(tx.bargainRevenueShareEvent.create).toHaveBeenCalledTimes(1)
    const createArg = tx.bargainRevenueShareEvent.create.mock.calls[0][0].data
    expect(createArg.netAmount).toBe(820)
    expect(createArg.shopifyOrderId).toBe('order9')
    // 3.5% of 820 = 28.7
    expect(createArg.revShareAmount).toBeCloseTo(28.7)
  })

  it('links the order to an existing accept-time event instead of double-booking', async () => {
    const tx = txMock(1, { id: 'evt1' })
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx))

    await attributeBargainPurchase(params)
    expect(tx.bargainRevenueShareEvent.update).toHaveBeenCalledTimes(1)
    expect(tx.bargainRevenueShareEvent.create).not.toHaveBeenCalled()
  })

  it('does not double-credit when the order was already claimed', async () => {
    const tx = txMock(0, null)
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx))

    const ok = await attributeBargainPurchase(params)
    expect(ok).toBe(false)
    expect(tx.analytics.upsert).not.toHaveBeenCalled()
    expect(tx.bargainRevenueShareEvent.create).not.toHaveBeenCalled()
  })

  it('returns false when no session matches the order', async () => {
    ;(prisma.bargainSession.findFirst as jest.Mock).mockResolvedValue(null)
    expect(await attributeBargainPurchase(params)).toBe(false)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
