/**
 * @jest-environment node
 *
 * Regression test: an install-origin Shopify OAuth callback must REUSE the
 * merchant's existing store row instead of creating a second one.
 *
 * Fault: a merchant who signed up on CartGain already owns a placeholder store,
 * and every "current store" read (/api/stores/current, /api/integrations/status)
 * resolves the account's OLDEST row. The callback used to create a fresh store
 * for the install, so the connected Shopify store was never the "current" one
 * and the integrations page kept showing the old placeholder as "not connected".
 */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/shopify/callback/route'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    store: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    campaign: { count: jest.fn(), create: jest.fn() },
    aiSuggestion: { create: jest.fn() },
    bargainConfig: { upsert: jest.fn() },
  },
}))

jest.mock('next-auth/jwt', () => ({ encode: jest.fn(async () => 'SIGNED_SESSION') }))
jest.mock('@/lib/app-base-url', () => ({ getAppBaseUrl: jest.fn(() => 'https://cart-gain.com') }))
jest.mock('@/lib/encryption', () => ({ encrypt: jest.fn(() => 'enc') }))
jest.mock('@/lib/shopify', () => ({ setupShopifyWebhooks: jest.fn(async () => {}) }))
jest.mock('@/lib/services/ai', () => ({ generateCampaignSetup: jest.fn(async () => null) }))
jest.mock('@/lib/subscription', () => ({ createFreeSubscription: jest.fn(async () => {}) }))
jest.mock('@/lib/shopify-oauth', () => ({
  // No storeId → install-origin auto-provision.
  verifyOAuthState: jest.fn(() => ({ shop: 'test.myshopify.com', host: 'embed-host' })),
  verifyShopifyCallbackHmac: jest.fn(() => true),
  isValidShopDomain: jest.fn(() => true),
}))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn(async () => {}) }))

const prismaMock = prisma as any

beforeEach(() => {
  jest.clearAllMocks()
  process.env.SHOPIFY_API_KEY = 'key'
  process.env.SHOPIFY_API_SECRET = 'secret'
  process.env.NEXTAUTH_SECRET = 'nextauth-secret'

  prismaMock.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'owner@shop.com',
    name: 'Owner',
    password: null,
    tokenVersion: 7,
  })
  prismaMock.store.findUnique.mockResolvedValue({
    id: 'store-old',
    userId: 'user-1',
    name: 'My Store',
    domain: 'test.myshopify.com',
    currency: 'USD',
  })
  prismaMock.store.create.mockResolvedValue({ id: 'store-new', userId: 'user-1' })
  prismaMock.store.update.mockResolvedValue({ id: 'store-old', userId: 'user-1' })
  prismaMock.campaign.count.mockResolvedValue(1)
  prismaMock.bargainConfig.upsert.mockResolvedValue({})

  ;(global as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      access_token: 'tok',
      associated_user: { email: 'owner@shop.com', first_name: 'Owner' },
    }),
  }))
})

function makeRequest() {
  return new NextRequest(
    'https://cart-gain.com/api/shopify/callback?shop=test.myshopify.com&code=abc&state=st&host=embed-host',
  )
}

describe('Shopify install callback — store de-duplication', () => {
  it('adopts the account\'s existing placeholder store instead of creating a second one', async () => {
    const placeholder = {
      id: 'store-old',
      userId: 'user-1',
      name: 'My Store',
      domain: 'mystore.cartgain.app',
      platform: 'custom',
      isActive: false,
    }
    prismaMock.store.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.domain) return null // no shop-domain match yet
      if (where?.userId) return placeholder // the signup placeholder
      return null
    })

    await GET(makeRequest())

    expect(prismaMock.store.create).not.toHaveBeenCalled()
    expect(prismaMock.store.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store-old' },
        data: expect.objectContaining({
          platform: 'shopify',
          domain: 'test.myshopify.com',
          isActive: true,
        }),
      }),
    )
  })

  it('creates a store only when the account has none', async () => {
    prismaMock.store.findFirst.mockResolvedValue(null)

    await GET(makeRequest())

    expect(prismaMock.store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          platform: 'shopify',
          domain: 'test.myshopify.com',
          isActive: true,
        }),
      }),
    )
  })
})
