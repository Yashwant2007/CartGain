import { NextRequest } from 'next/server'
import { POST } from '../route'
import { getServerSession } from 'next-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { createRazorpaySubscription, getPlan, resolvePlanId } from '@/lib/payment'
import { resolveShopifyStoreForUser, shopifyBillingAvailability } from '@/lib/shopify-billing/service'
import { createShopifySubscription } from '@/lib/shopify-billing/subscriptions'
import { ShopifyReconnectRequiredError } from '@/lib/shopify-billing/client'
import { resolveBillingPrice, resolveUsageCap } from '@/lib/shopify-billing/plans'
import prisma from '@/lib/db'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: jest.fn() }))
jest.mock('@/lib/payment', () => ({
  createRazorpaySubscription: jest.fn(),
  cancelRazorpaySubscription: jest.fn(),
  getPlan: jest.fn(),
  resolvePlanId: jest.fn(),
}))
jest.mock('@/lib/app-base-url', () => ({ getAppBaseUrl: () => 'https://cart-gain.com' }))
jest.mock('@/lib/shopify-billing/service', () => ({
  resolveShopifyStoreForUser: jest.fn(),
  shopifyBillingAvailability: jest.fn(),
}))
jest.mock('@/lib/shopify-billing/plans', () => ({
  resolveBillingPrice: jest.fn(),
  resolveUsageCap: jest.fn(),
}))
jest.mock('@/lib/shopify-billing/subscriptions', () => ({
  createShopifySubscription: jest.fn(),
  cancelShopifySubscription: jest.fn(),
}))
jest.mock('@/lib/shopify-billing/client', () => {
  class MockShopifyReconnectRequiredError extends Error {}
  return {
    ShopifyReconnectRequiredError: MockShopifyReconnectRequiredError,
    isShopifyAuthFailure: jest.fn(),
  }
})
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn() }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { subscription: { findFirst: jest.fn(), upsert: jest.fn() } },
}))

const sessionMock = getServerSession as jest.Mock
const rateLimitMock = checkRateLimit as jest.Mock
const storeMock = resolveShopifyStoreForUser as jest.Mock
const availabilityMock = shopifyBillingAvailability as jest.Mock
const createShopifyMock = createShopifySubscription as jest.Mock
const createRazorpayMock = createRazorpaySubscription as jest.Mock
const prismaMock = prisma as any

const STORE = {
  id: 'store-1',
  domain: 'test3cg.myshopify.com',
  currency: 'INR',
  platform: 'shopify',
  isActive: false,
}

function makeRequest(body: Record<string, unknown> = { plan: 'growth', period: 'monthly' }) {
  return new NextRequest('https://cart-gain.com/api/payments/create-subscription', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionMock.mockResolvedValue({ user: { id: 'user-1', email: 'merchant@example.com' } })
  rateLimitMock.mockResolvedValue({ success: true })
  ;(resolvePlanId as jest.Mock).mockReturnValue('growth')
  ;(getPlan as jest.Mock).mockReturnValue({ name: 'Growth', price: 1499, revSharePercent: 3.5 })
  prismaMock.subscription.findFirst.mockResolvedValue(null)
  prismaMock.subscription.upsert.mockResolvedValue({})
})

describe('POST /api/payments/create-subscription', () => {
  it('returns an actionable reconnect error instead of silently using Razorpay', async () => {
    storeMock.mockResolvedValue(STORE)
    availabilityMock.mockReturnValue({
      available: false,
      currency: null,
      reason: 'store_inactive',
      tokenState: 'expired',
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({
      code: 'SHOPIFY_STORE_INACTIVE',
      error: expect.stringContaining('test3cg.myshopify.com'),
    })
    expect(createRazorpayMock).not.toHaveBeenCalled()
  })

  it('asks for a reconnect when the Shopify token expired without a refresh token', async () => {
    storeMock.mockResolvedValue(STORE)
    availabilityMock.mockReturnValue({
      available: false,
      currency: null,
      reason: 'reconnect_required',
      tokenState: 'expired',
    })

    const res = await POST(makeRequest({ plan: 'growth', period: 'monthly', provider: 'shopify' }))

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'SHOPIFY_RECONNECT_REQUIRED' })
    expect(createShopifyMock).not.toHaveBeenCalled()
  })

  it('turns an auth failure during Shopify subscription creation into a reconnect response', async () => {
    storeMock.mockResolvedValue({ ...STORE, isActive: true })
    availabilityMock.mockReturnValue({
      available: true,
      currency: 'INR',
      tokenState: 'refreshable',
    })
    ;(resolveBillingPrice as jest.Mock).mockReturnValue({ amount: 1499, currency: 'INR' })
    ;(resolveUsageCap as jest.Mock).mockReturnValue(null)
    createShopifyMock.mockRejectedValue(new ShopifyReconnectRequiredError())

    const res = await POST(makeRequest())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'SHOPIFY_RECONNECT_REQUIRED' })
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled()
  })
})
