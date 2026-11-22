const prismaMock = {
  razorpaySubscription: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
  razorpayCustomer: { findUnique: jest.fn(), upsert: jest.fn() },
  razorpayInvoice: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  razorpayPayment: { upsert: jest.fn() },
  $transaction: jest.fn(),
}

const clientMock = {
  razorpayFetchPlan: jest.fn(),
  razorpayCreateCustomer: jest.fn(),
  razorpayCreateSubscription: jest.fn(),
  razorpayCancelSubscription: jest.fn(),
  razorpayFetchSubscription: jest.fn(),
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn() }))
jest.mock('@/lib/billing/razorpay/config', () => ({
  getRazorpayConfig: jest.fn(() => ({ keyId: 'key_test', keySecret: 'secret_test', webhookSecret: 'secret_test' })),
  getRazorpayPlanId: (planId: string, period: string) => `plan_${planId}_${period}`,
  RAZORPAY_CURRENCY: 'INR',
}))
jest.mock('@/lib/billing/razorpay/client', () => clientMock)
jest.mock('@/lib/billing/razorpay/signature', () => ({ verifyRazorpayPaymentSignature: jest.fn(() => true) }))

import {
  startWooCommerceRazorpaySubscription,
  verifyRazorpayCheckout,
} from '../service'

const store = {
  id: 'store_1',
  userId: 'user_1',
  name: 'Woo Store',
  domain: 'woo.test',
  platform: 'woocommerce',
}

const renewal = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)

function localSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 'rz_1',
    userId: 'user_1',
    storeId: 'store_1',
    plan: 'growth',
    status: 'active',
    billingPeriod: 'monthly',
    amount: 1499,
    currency: 'INR',
    razorpayCustomerId: 'cust_1',
    razorpaySubscriptionId: 'sub_growth_active',
    previousRazorpaySubscriptionId: null,
    pendingPlanId: null,
    pendingBillingPeriod: null,
    pendingAmount: null,
    pendingStartAt: null,
    pendingAuthorizedAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: renewal,
    nextBillingAt: renewal,
    ...overrides,
  }
}

function fetchedPlan(planId: string, amountPaise: number, period = 'monthly') {
  return { id: planId, amount: amountPaise, currency: 'INR', period, interval: 1, status: 'active' }
}

describe('Razorpay WooCommerce subscription lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clientMock.razorpayFetchPlan.mockImplementation(async (id: string) => {
      if (id === 'plan_growth_monthly') return fetchedPlan(id, 149900)
      if (id === 'plan_pro_monthly') return fetchedPlan(id, 399900)
      if (id === 'plan_pro_yearly') return fetchedPlan(id, 3999000, 'yearly')
      return fetchedPlan(id, 149900)
    })
    clientMock.razorpayCreateSubscription.mockResolvedValue({ id: 'sub_created' })
    clientMock.razorpayCancelSubscription.mockResolvedValue({})
    clientMock.razorpayFetchSubscription.mockResolvedValue({
      id: 'sub_created',
      status: 'created',
      plan_id: 'plan_pro_monthly',
      amount: 399900,
      currency: 'INR',
      customer_id: 'cust_1',
      notes: { cartgain_store_id: 'store_1' },
    })
    prismaMock.razorpaySubscription.findUnique.mockResolvedValue(null)
    prismaMock.razorpaySubscription.update.mockImplementation(async ({ data }: any) => ({ ...localSubscription(), ...data }))
    prismaMock.razorpayCustomer.findUnique.mockResolvedValue({ razorpayCustomerId: 'cust_1' })
    prismaMock.razorpayInvoice.findFirst.mockResolvedValue(null)
    prismaMock.$transaction.mockImplementation((ops: any[]) => Promise.all(ops))
  })

  it('resumes checkout for the same pending plan instead of creating another subscription', async () => {
    prismaMock.razorpaySubscription.findUnique.mockResolvedValue(localSubscription({
      razorpaySubscriptionId: 'sub_pro_pending',
      previousRazorpaySubscriptionId: 'sub_growth_active',
      pendingPlanId: 'pro',
      pendingBillingPeriod: 'monthly',
      pendingAmount: 3999,
      pendingStartAt: renewal,
    }))

    const result: any = await startWooCommerceRazorpaySubscription({
      store,
      planId: 'pro',
      period: 'monthly',
      email: 'merchant@example.com',
    })

    expect(result.subscriptionId).toBe('sub_pro_pending')
    expect(result.scheduled).toBe(true)
    expect(result.plan).toBe('pro')
    expect(clientMock.razorpayCreateSubscription).not.toHaveBeenCalled()
    expect(clientMock.razorpayCancelSubscription).not.toHaveBeenCalled()
  })

  it('reverts a pending change to the active gateway subscription before switching again', async () => {
    prismaMock.razorpaySubscription.findUnique.mockResolvedValue(localSubscription({
      razorpaySubscriptionId: 'sub_pro_pending',
      previousRazorpaySubscriptionId: 'sub_growth_active',
      pendingPlanId: 'pro',
      pendingBillingPeriod: 'monthly',
      pendingAmount: 3999,
      pendingStartAt: renewal,
    }))

    const result: any = await startWooCommerceRazorpaySubscription({
      store,
      planId: 'pro',
      period: 'yearly',
    })

    expect(clientMock.razorpayCancelSubscription).toHaveBeenCalledWith('sub_pro_pending', false)
    expect(clientMock.razorpayCancelSubscription).toHaveBeenCalledWith('sub_growth_active', true)
    expect(prismaMock.razorpaySubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        razorpaySubscriptionId: 'sub_growth_active',
        pendingPlanId: null,
      }),
    }))
    expect(prismaMock.razorpaySubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        razorpaySubscriptionId: 'sub_created',
        previousRazorpaySubscriptionId: 'sub_growth_active',
        pendingPlanId: 'pro',
        pendingBillingPeriod: 'yearly',
      }),
    }))
    expect(result.subscriptionId).toBe('sub_created')
    expect(result.scheduled).toBe(true)
  })

  it('records authorization for a scheduled plan without activating the new plan early', async () => {
    prismaMock.razorpaySubscription.findUnique.mockResolvedValue(localSubscription({
      razorpaySubscriptionId: 'sub_created',
      previousRazorpaySubscriptionId: 'sub_growth_active',
      pendingPlanId: 'pro',
      pendingBillingPeriod: 'monthly',
      pendingAmount: 3999,
      pendingStartAt: renewal,
    }))

    const result = await verifyRazorpayCheckout({
      storeId: 'store_1',
      userId: 'user_1',
      subscriptionId: 'sub_created',
      paymentId: 'pay_1',
      signature: 'sig',
    })

    expect(result).toEqual(expect.objectContaining({ status: 'scheduled', scheduled: true }))
    const update = prismaMock.razorpaySubscription.update.mock.calls[0][0].data
    expect(update.pendingAuthorizedAt).toBeInstanceOf(Date)
    expect(update).not.toHaveProperty('plan')
    expect(update).not.toHaveProperty('status')
  })
})
