const prismaMock = {
  webhookEvent: { findUnique: jest.fn(), create: jest.fn() },
  razorpaySubscription: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  razorpayPayment: { upsert: jest.fn() },
  razorpayInvoice: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  razorpayUsageEvent: { create: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
}

const captureErrorMock = jest.fn()

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))
jest.mock('@/lib/billing/razorpay/config', () => ({
  getRazorpayConfig: jest.fn(() => ({ keyId: 'key_test', keySecret: 'secret_test', webhookSecret: 'secret_test' })),
  getRazorpayPlanId: (planId: string, period: string) => `plan_${planId}_${period}`,
  RAZORPAY_CURRENCY: 'INR',
}))
jest.mock('@/lib/observability/logger', () => ({ captureError: (...args: any[]) => captureErrorMock(...args) }))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn() }))

import { processRazorpayWebhook } from '../service'

const now = Math.floor(Date.now() / 1000)

function localSubscription(overrides: Record<string, any> = {}) {
  return {
    id: 'sub_local',
    userId: 'user_1',
    storeId: 'store_1',
    plan: 'growth',
    status: 'active',
    billingPeriod: 'monthly',
    amount: 1499,
    currency: 'INR',
    razorpaySubscriptionId: 'sub_1',
    previousRazorpaySubscriptionId: null,
    pendingPlanId: null,
    pendingBillingPeriod: null,
    pendingAmount: null,
    pendingStartAt: null,
    pendingAuthorizedAt: null,
    currentPeriodStart: new Date(now * 1000),
    currentPeriodEnd: new Date((now + 2592000) * 1000),
    lastPaymentId: null,
    lastEventAt: null,
    ...overrides,
  }
}

function event(overrides: Record<string, any> = {}) {
  return {
    id: 'evt_1',
    event: 'subscription.charged',
    created: now,
    payload: {
      subscription: {
        entity: {
          id: 'sub_1',
          status: 'active',
          amount: 149900,
          currency: 'INR',
          current_start: now,
          current_end: now + 2592000,
        },
      },
      payment: { entity: { id: 'pay_1', status: 'captured', amount: 149900, currency: 'INR' } },
    },
    ...overrides,
  }
}

describe('processRazorpayWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.webhookEvent.findUnique.mockResolvedValue(null)
    prismaMock.webhookEvent.create.mockResolvedValue({ id: 'dedupe_1' })
    prismaMock.razorpaySubscription.findFirst.mockResolvedValue(localSubscription())
    prismaMock.razorpayPayment.upsert.mockResolvedValue({})
    prismaMock.razorpayInvoice.findFirst.mockResolvedValue(null)
    prismaMock.razorpayInvoice.create.mockResolvedValue({ id: 'inv_1' })
    prismaMock.$transaction.mockImplementation((ops: any[]) => Promise.all(ops))
  })

  it('treats duplicate event ids as no-ops before any billing write', async () => {
    prismaMock.webhookEvent.findUnique.mockResolvedValue({ id: 'dedupe_1' })
    await expect(processRazorpayWebhook(event())).resolves.toEqual({ duplicate: true })
    expect(prismaMock.razorpayPayment.upsert).not.toHaveBeenCalled()
    expect(prismaMock.razorpayInvoice.create).not.toHaveBeenCalled()
  })

  it('keeps unmatched events retryable instead of burning the dedupe marker', async () => {
    prismaMock.razorpaySubscription.findFirst.mockResolvedValue(null)
    await expect(processRazorpayWebhook(event())).resolves.toEqual({ handled: false, reason: 'no_matching_subscription' })
    expect(prismaMock.razorpayInvoice.create).not.toHaveBeenCalled()
    expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled()
  })

  it('keeps amount mismatches retryable and does not mark the event as processed', async () => {
    const payload = event()
    payload.payload.subscription.entity.amount = 99900
    payload.payload.payment.entity.amount = 99900
    await expect(processRazorpayWebhook(payload)).resolves.toEqual({ handled: false, reason: 'amount_mismatch' })
    expect(prismaMock.razorpayInvoice.create).not.toHaveBeenCalled()
    expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled()
    expect(captureErrorMock).toHaveBeenCalled()
  })

  it('activates a paid subscription and creates a paid invoice for the exact expected amount', async () => {
    await expect(processRazorpayWebhook(event())).resolves.toEqual(expect.objectContaining({
      handled: true,
      event: 'subscription.charged',
    }))
    expect(prismaMock.razorpayInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'subscription', amount: 1499, status: 'paid' }),
    }))
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith({
      data: { namespace: 'razorpay', entityId: 'evt_1' },
    })
  })

  it('keeps the current plan active when the old subscription charges during a scheduled change', async () => {
    prismaMock.razorpaySubscription.findFirst.mockResolvedValue(localSubscription({
      plan: 'growth',
      razorpaySubscriptionId: 'sub_new',
      previousRazorpaySubscriptionId: 'sub_1',
      pendingPlanId: 'pro',
      pendingBillingPeriod: 'monthly',
      pendingAmount: 3999,
    }))
    const payload = event()
    payload.id = 'evt_old_charge'
    await expect(processRazorpayWebhook(payload)).resolves.toEqual(expect.objectContaining({ handled: true }))
    expect(prismaMock.razorpayInvoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 1499, description: expect.stringContaining('Growth') }),
    }))
    expect(prismaMock.razorpaySubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ plan: 'growth' }),
    }))
    const updateData = prismaMock.razorpaySubscription.update.mock.calls[0][0].data
    expect(updateData).not.toHaveProperty('pendingPlanId')
    expect(updateData).not.toHaveProperty('previousRazorpaySubscriptionId')
  })

  it('applies a scheduled plan change only when the new subscription is charged', async () => {
    prismaMock.razorpaySubscription.findFirst.mockResolvedValue(localSubscription({
      plan: 'growth',
      razorpaySubscriptionId: 'sub_new',
      previousRazorpaySubscriptionId: 'sub_1',
      pendingPlanId: 'pro',
      pendingBillingPeriod: 'monthly',
      pendingAmount: 3999,
    }))
    const payload = event()
    payload.id = 'evt_new_charge'
    payload.payload.subscription.entity.id = 'sub_new'
    payload.payload.subscription.entity.amount = 399900
    payload.payload.payment.entity.amount = 399900
    await expect(processRazorpayWebhook(payload)).resolves.toEqual(expect.objectContaining({
      handled: true,
      planChangeApplied: true,
    }))
    expect(prismaMock.razorpaySubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        plan: 'pro',
        amount: 3999,
        previousRazorpaySubscriptionId: null,
        pendingPlanId: null,
      }),
    }))
  })
})
