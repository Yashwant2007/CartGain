jest.mock('@/lib/embedded-auth', () => ({
  getAuthContext: jest.fn(),
  unauthorizedResponse: jest.fn(() => ({ status: 401 })),
}))
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ success: true }) }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { platformConnection: { findFirst: jest.fn() } },
}))
jest.mock('@/lib/billing/store-subscription', () => ({
  isWooCommercePlatform: jest.fn((platform: string | null) => platform === 'woocommerce'),
  resolveBillingStore: jest.fn(),
}))
jest.mock('@/lib/billing/razorpay/service', () => ({
  RazorpayBillingError: class extends Error {
    code = 'TEST'
    status = 400
  },
  startWooCommerceRazorpaySubscription: jest.fn(),
}))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn() }))

import { NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/embedded-auth'
import prisma from '@/lib/db'
import { resolveBillingStore } from '@/lib/billing/store-subscription'
import { startWooCommerceRazorpaySubscription } from '@/lib/billing/razorpay/service'
import { POST } from '../route'

const request = () => new NextRequest('http://localhost/api/billing/razorpay/create-subscription', {
  method: 'POST',
  body: JSON.stringify({ plan: 'growth', period: 'monthly' }),
})

describe('Razorpay create-subscription route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAuthContext as jest.Mock).mockResolvedValue({ user: { id: 'user_1', email: 'a@b.com', name: 'A' }, store: { id: 'store_1' } })
  })

  it('rejects Shopify stores before any gateway call', async () => {
    ;(resolveBillingStore as jest.Mock).mockResolvedValue({ id: 'shop_1', platform: 'shopify' })
    const response = await POST(request())
    expect(response.status).toBe(400)
    expect(startWooCommerceRazorpaySubscription).not.toHaveBeenCalled()
    expect(prisma.platformConnection.findFirst).not.toHaveBeenCalled()
  })

  it('requires an active WooCommerce connection', async () => {
    ;(resolveBillingStore as jest.Mock).mockResolvedValue({ id: 'woo_1', name: 'Woo', domain: 'x.test', platform: 'woocommerce' })
    ;(prisma.platformConnection.findFirst as jest.Mock).mockResolvedValue(null)
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(startWooCommerceRazorpaySubscription).not.toHaveBeenCalled()
  })

  it('starts checkout for an owned, connected WooCommerce store', async () => {
    ;(resolveBillingStore as jest.Mock).mockResolvedValue({ id: 'woo_1', name: 'Woo', domain: 'x.test', platform: 'woocommerce' })
    ;(prisma.platformConnection.findFirst as jest.Mock).mockResolvedValue({ id: 'conn_1' })
    ;(startWooCommerceRazorpaySubscription as jest.Mock).mockResolvedValue({ provider: 'razorpay', subscriptionId: 'sub_1' })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(startWooCommerceRazorpaySubscription).toHaveBeenCalledWith(expect.objectContaining({
      store: expect.objectContaining({ id: 'woo_1', platform: 'woocommerce' }),
      planId: 'growth',
      period: 'monthly',
    }))
  })
})
