jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    message: { findFirst: jest.fn(), update: jest.fn(async () => undefined) },
    recoveredCart: { create: jest.fn(async () => undefined), count: jest.fn(), findFirst: jest.fn(), update: jest.fn(async () => undefined) },
    cart: { update: jest.fn(async () => undefined) },
    analytics: { upsert: jest.fn(async () => undefined), findUnique: jest.fn(async () => null), update: jest.fn(async () => undefined) },
    razorpaySubscription: { update: jest.fn(async () => undefined) },
  },
}))

jest.mock('@/lib/bargain/goals', () => ({
  attributeBargainGoal: jest.fn(async () => undefined),
  netBargainGoalRefund: jest.fn(async () => undefined),
}))

jest.mock('@/lib/bargain/learning/outcomes', () => ({
  recordLearningRefund: jest.fn(async () => undefined),
}))

jest.mock('@/lib/bargain/purchase', () => ({
  attributeBargainPurchase: jest.fn(async () => undefined),
  rememberConfirmedOrder: jest.fn(async () => undefined),
  netBargainPurchaseRefund: jest.fn(async () => undefined),
}))

jest.mock('@/lib/bargain/quote', () => ({
  findQuoteByDiscountCode: jest.fn(),
  redeemQuote: jest.fn(async () => undefined),
}))

jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(async () => undefined),
}))

jest.mock('@/lib/payment', () => ({
  ATTRIBUTION_WINDOW_HOURS: 72,
  FREE_CARTS_THRESHOLD: 50,
  getPlan: jest.fn(),
  resolvePlanId: jest.fn(),
}))

jest.mock('@/lib/billing/store-subscription', () => ({
  resolveStoreSubscription: jest.fn(),
}))

jest.mock('@/lib/billing/razorpay/service', () => ({
  recordRazorpayUsageEvent: jest.fn(async (params) => ({ id: 'usage-1', ...params })),
}))

import prisma from '@/lib/db'
import { getPlan, resolvePlanId } from '@/lib/payment'
import { resolveStoreSubscription } from '@/lib/billing/store-subscription'
import { recordRazorpayUsageEvent } from '@/lib/billing/razorpay/service'
import { attributeWooRecoveryOrder, netWooOrderRefund } from '../order-attribution'

const store = {
  id: 'store-1',
  userId: 'user-1',
  domain: 'shop.example.com',
  timezone: 'Asia/Kolkata',
}

const order = {
  platformOrderId: '9001',
  cartId: 'wc-cart-token',
  externalCustomerId: '9',
  status: 'completed',
  currency: 'INR',
  total: 180,
  subtotal: 200,
  discountTotal: 20,
  customerEmail: 'ada@example.com',
  customerPhone: '+919876543210',
  customerName: 'Ada Lovelace',
  couponCodes: [],
  items: [],
  placedAt: new Date('2026-01-02T03:04:05.000Z'),
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.message.findFirst as jest.Mock).mockResolvedValue({
    id: 'msg-1',
    status: 'delivered',
    channel: 'email',
    sentAt: new Date('2026-01-02T02:00:00.000Z'),
  })
  ;(prisma.recoveredCart.count as jest.Mock).mockResolvedValue(100)
  ;(resolveStoreSubscription as jest.Mock).mockResolvedValue({
    kind: 'razorpay',
    id: 'rzp-sub-1',
    userId: store.userId,
    storeId: store.id,
    status: 'active',
    plan: 'growth',
  })
  ;(getPlan as jest.Mock).mockReturnValue({ revSharePercent: 10 })
  ;(resolvePlanId as jest.Mock).mockReturnValue('growth')
})

describe('WooCommerce revenue share', () => {
  it('records Razorpay usage instead of a Shopify revenue share event', async () => {
    const ok = await attributeWooRecoveryOrder(store, order, 'cart-1')

    expect(ok).toBe(true)
    expect(recordRazorpayUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'rzp-sub-1',
        kind: 'revenue_share',
        referenceId: 'cart-1',
        chargeAmount: 18,
        revSharePercent: 10,
      }),
    )
    expect(prisma.razorpaySubscription.update).toHaveBeenCalledWith({
      where: { id: 'rzp-sub-1' },
      data: { revenueShareAccrued: { increment: 18 } },
    })
  })

  it('nets an uninvoiced Razorpay usage event on refund', async () => {
    ;(prisma.recoveredCart.findFirst as jest.Mock).mockResolvedValue({
      id: 'rec-1',
      cartId: 'cart-1',
      recoveredValue: 200,
      netRevenue: 180,
      totalRefunded: 0,
      revenueShareEvent: null,
    })
    const razorpayUsageEvent = {
      findFirst: jest.fn(async () => ({
        id: 'usage-1',
        chargeAmount: 18,
        revSharePercent: 10,
        invoicedAt: null,
        invoiceId: null,
      })),
      update: jest.fn(async () => undefined),
    }
    ;(prisma as any).razorpayUsageEvent = razorpayUsageEvent
    ;(prisma as any).$transaction = jest.fn(async (cb: any) => cb(prisma))

    await netWooOrderRefund(store, { ...order, refundedTotal: 100 }, 'refund')

    expect(razorpayUsageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'usage-1' },
        data: expect.objectContaining({ chargeAmount: 8 }),
      }),
    )
    expect(prisma.razorpaySubscription.update).toHaveBeenCalledWith({
      where: { id: 'rzp-sub-1' },
      data: { revenueShareAccrued: { decrement: 10 } },
    })
  })
})
