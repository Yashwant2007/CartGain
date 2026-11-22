const prismaMock = {
  razorpaySubscription: { findMany: jest.fn(), update: jest.fn() },
  razorpayUsageEvent: { findMany: jest.fn(), updateMany: jest.fn() },
  razorpayInvoice: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  store: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
}

const createPaymentLinkMock = jest.fn()
const redisSetNXOrNullMock = jest.fn()
const sendEmailMock = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))
jest.mock('@/lib/redis', () => ({ redisSetNXOrNull: (...args: any[]) => redisSetNXOrNullMock(...args) }))
jest.mock('@/lib/billing/razorpay/config', () => ({ getRazorpayConfig: jest.fn() }))
jest.mock('@/lib/billing/razorpay/client', () => ({ razorpayCreatePaymentLink: (...args: any[]) => createPaymentLinkMock(...args) }))
jest.mock('@/lib/jobs/processRevenueShareBilling', () => ({
  shouldInvoice: (amount: number, overage: number, floor: number) => amount > 0 && (overage > 0 || amount >= floor),
}))
jest.mock('@/lib/services/email', () => ({ sendEmail: (...args: any[]) => sendEmailMock(...args) }))
jest.mock('@/lib/app-base-url', () => ({ getAppBaseUrl: () => 'https://cart-gain.com' }))

import { processRazorpayBilling } from '../processRazorpayBilling'

const now = Date.now()
const periodStart = new Date(now - 31 * 24 * 60 * 60 * 1000)
const periodEnd = new Date(now - 24 * 60 * 60 * 1000)

function subscription(overrides: Record<string, any> = {}) {
  return {
    id: 'sub_local',
    userId: 'user_1',
    storeId: 'store_1',
    plan: 'growth',
    status: 'active',
    billingPeriod: 'monthly',
    provider: 'razorpay',
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
    pendingStartAt: null,
    ...overrides,
  }
}

function usageEvent(kind: string, chargeAmount: number) {
  return { id: `evt_${kind}_${chargeAmount}`, kind, chargeAmount }
}

describe('processRazorpayBilling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    redisSetNXOrNullMock.mockResolvedValue(true)
    prismaMock.razorpaySubscription.findMany.mockResolvedValue([subscription()])
    prismaMock.store.findUnique.mockResolvedValue({ id: 'store_1', platform: 'woocommerce' })
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1', email: 'merchant@example.com', name: 'Merchant' })
    prismaMock.razorpayInvoice.findFirst.mockResolvedValue(null)
    prismaMock.razorpayInvoice.create.mockImplementation(async ({ data }: any) => ({ id: 'inv_1', paymentLinkUrl: null, ...data }))
    prismaMock.razorpayInvoice.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, paymentLinkUrl: null, ...data }))
    createPaymentLinkMock.mockResolvedValue({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' })
    sendEmailMock.mockResolvedValue({})
  })

  it('skips the whole sweep when another worker holds the Redis lock', async () => {
    redisSetNXOrNullMock.mockResolvedValue(false)
    await expect(processRazorpayBilling()).resolves.toEqual({ processed: 0, skipped: 0, errors: [] })
    expect(prismaMock.razorpaySubscription.findMany).not.toHaveBeenCalled()
  })

  it('caps revenue share at the plan limit but bills overage in full', async () => {
    prismaMock.razorpayUsageEvent.findMany.mockResolvedValue([
      usageEvent('revenue_share', 6000),
      usageEvent('recovery_overage_message', 2),
      usageEvent('recovery_overage_cart', 3),
    ])

    const result = await processRazorpayBilling()

    expect(result.processed).toBe(1)
    expect(prismaMock.razorpayInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'usage', amount: 5005, status: 'pending' }),
    }))
    expect(prismaMock.razorpayInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ razorpayPaymentLinkId: 'plink_1', paymentLinkUrl: 'https://rzp.io/i/abc' }),
    }))
    expect(prismaMock.razorpayUsageEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ invoiceId: 'inv_1' }),
    }))
    expect(prismaMock.razorpaySubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        currentPeriodStart: expect.any(Date),
        currentPeriodEnd: expect.any(Date),
        revenueShareAccrued: 0,
      }),
    }))
  })

  it('cancels at period end without reviving a cancelled subscription', async () => {
    prismaMock.razorpaySubscription.findMany.mockResolvedValue([subscription({ cancelAtPeriodEnd: true })])
    prismaMock.razorpayUsageEvent.findMany.mockResolvedValue([usageEvent('revenue_share', 250)])

    const result = await processRazorpayBilling()

    expect(result.processed).toBe(1)
    const updateData = prismaMock.razorpaySubscription.update.mock.calls[0][0].data
    expect(updateData).toEqual(expect.objectContaining({
      status: 'cancelled',
      nextBillingAt: null,
      cancelAtPeriodEnd: false,
    }))
    expect(updateData).not.toHaveProperty('currentPeriodStart')
    expect(updateData).not.toHaveProperty('currentPeriodEnd')
  })

  it('skips subscriptions that are not attached to a WooCommerce store', async () => {
    prismaMock.store.findUnique.mockResolvedValue({ id: 'store_1', platform: 'shopify' })

    const result = await processRazorpayBilling()

    expect(result).toEqual({ processed: 0, skipped: 1, errors: [] })
    expect(prismaMock.razorpayInvoice.create).not.toHaveBeenCalled()
  })
})
