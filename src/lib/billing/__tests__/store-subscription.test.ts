const prismaMock = {
  store: { findFirst: jest.fn() },
  subscription: { findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  razorpaySubscription: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: prismaMock }))

import {
  isWooCommercePlatform,
  mapRazorpayStatus,
  meterUpdate,
  resolveOrCreateFreeStoreSubscription,
  resolveStoreSubscription,
} from '../store-subscription'

describe('store subscription isolation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('recognizes only WooCommerce stores as Razorpay billing targets', () => {
    expect(isWooCommercePlatform('woocommerce')).toBe(true)
    expect(isWooCommercePlatform('shopify')).toBe(false)
    expect(isWooCommercePlatform(null)).toBe(false)
  })

  it('resolves WooCommerce subscriptions from Razorpay and Shopify from legacy records', async () => {
    const now = new Date()
    prismaMock.store.findFirst.mockResolvedValueOnce({ id: 'woo_1', platform: 'woocommerce' })
    prismaMock.razorpaySubscription.findUnique.mockResolvedValueOnce({
      id: 'rz_1', userId: 'user_1', storeId: 'woo_1', plan: 'growth', status: 'active',
      billingPeriod: 'monthly', amount: 1499, currency: 'INR',
      currentPeriodStart: now, currentPeriodEnd: now,
    })
    prismaMock.store.findFirst.mockResolvedValueOnce({ id: 'shop_1', platform: 'shopify' })
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sh_1', userId: 'user_1', plan: 'growth', status: 'active',
      provider: 'shopify', currentPeriodStart: now, currentPeriodEnd: now,
    })

    const woo = await resolveStoreSubscription('user_1', 'woo_1')
    const shopify = await resolveStoreSubscription('user_1', 'shop_1')

    expect(woo?.kind).toBe('razorpay')
    expect(woo?.subscriptionId).toBeUndefined()
    expect(shopify?.kind).toBe('shopify')
    expect(prismaMock.subscription.findFirst).not.toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'woo_1' } }))
  })

  it('exposes scheduled plan-change metadata from the Razorpay row', async () => {
    const now = new Date()
    prismaMock.store.findFirst.mockResolvedValue({ id: 'woo_1', platform: 'woocommerce' })
    prismaMock.razorpaySubscription.findUnique.mockResolvedValue({
      id: 'rz_1', userId: 'user_1', storeId: 'woo_1', plan: 'growth', status: 'active',
      billingPeriod: 'monthly', amount: 1499, currency: 'INR',
      currentPeriodStart: now, currentPeriodEnd: now,
      pendingPlanId: 'pro', pendingBillingPeriod: 'yearly',
      pendingStartAt: now, pendingAuthorizedAt: null,
      gracePeriodEnd: null,
    })

    const resolved = await resolveStoreSubscription('user_1', 'woo_1')

    expect(resolved?.pendingPlanId).toBe('pro')
    expect(resolved?.pendingBillingPeriod).toBe('yearly')
    expect(resolved?.pendingStartAt).toEqual(now)
    expect(resolved?.pendingAuthorizedAt).toBeNull()
  })

  it('creates a free Razorpay row for WooCommerce without touching Shopify subscriptions', async () => {
    const now = new Date()
    prismaMock.store.findFirst.mockResolvedValue({ id: 'woo_1', platform: 'woocommerce' })
    prismaMock.razorpaySubscription.findUnique.mockResolvedValue(null)
    prismaMock.razorpaySubscription.upsert.mockResolvedValue({
      id: 'rz_free', userId: 'user_1', storeId: 'woo_1', plan: 'free', status: 'active',
      currentPeriodStart: now, currentPeriodEnd: now,
    })

    const resolved = await resolveOrCreateFreeStoreSubscription('user_1', 'woo_1')
    expect(resolved.kind).toBe('razorpay')
    expect(resolved.plan).toBe('free')
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled()
  })

  it('routes meter writes to the matching provider model', () => {
    meterUpdate({ kind: 'razorpay', id: 'rz_1' } as any, { bargainDealsUsed: { increment: 1 } })
    expect(prismaMock.razorpaySubscription.update).toHaveBeenCalledWith({
      where: { id: 'rz_1' },
      data: { bargainDealsUsed: { increment: 1 } },
    })
    meterUpdate({ kind: 'shopify', id: 'sh_1' } as any, { bargainDealsUsed: { increment: 1 } })
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sh_1' },
      data: { bargainDealsUsed: { increment: 1 } },
    })
  })

  it('maps gateway states conservatively', () => {
    expect(mapRazorpayStatus('active')).toBe('active')
    expect(mapRazorpayStatus('halted')).toBe('past_due')
    expect(mapRazorpayStatus('cancelled')).toBe('cancelled')
    expect(mapRazorpayStatus('completed')).toBe('expired')
    expect(mapRazorpayStatus('unknown')).toBe('pending')
  })
})
