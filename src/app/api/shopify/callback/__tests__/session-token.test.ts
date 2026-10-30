/**
 * @jest-environment node
 *
 * Regression test: an install-origin session cookie must carry the account's
 * tokenVersion.
 *
 * Fault: mintSessionCookie omitted tokenVersion. The jwt callback in
 * src/lib/auth.ts only runs the password-change revocation check when
 * `typeof token.tokenVersion === 'number'`, so a session minted by the Shopify
 * install callback silently survived any later password change/reset.
 */
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
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
jest.mock('@/lib/shopify', () => ({
  setupShopifyWebhooks: jest.fn(async () => {}),
  fetchShopifyWithAuth: jest.fn(async () => ({
    ok: true,
    json: async () => ({ shop: { id: 1, email: 'owner@shop.com' } }),
  })),
  ShopifyReconnectRequiredError: class extends Error {},
}))
jest.mock('@/lib/services/ai', () => ({ generateCampaignSetup: jest.fn(async () => null) }))
jest.mock('@/lib/subscription', () => ({ createFreeSubscription: jest.fn(async () => {}) }))
jest.mock('@/lib/shopify-oauth', () => ({
  verifyOAuthState: jest.fn(() => ({ shop: 'test.myshopify.com', host: 'embed-host' })),
  verifyShopifyCallbackHmac: jest.fn(() => true),
  isValidShopDomain: jest.fn(() => true),
}))
jest.mock('@/lib/analytics/track', () => ({ track: jest.fn(async () => {}) }))
jest.mock('@/lib/observability/logger', () => ({ captureError: jest.fn(async () => {}) }))

const prismaMock = prisma as any
const encodeMock = encode as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  process.env.SHOPIFY_API_KEY = 'key'
  process.env.SHOPIFY_API_SECRET = 'secret'
  process.env.NEXTAUTH_SECRET = 'nextauth-secret'

  const user = {
    id: 'user-1',
    email: 'owner@shop.com',
    name: 'Owner',
    password: null,
    tokenVersion: 7,
  }
  prismaMock.user.findUnique.mockResolvedValue(user)
  prismaMock.store.findFirst.mockResolvedValue(null)
  prismaMock.store.create.mockResolvedValue({ id: 'store-1', userId: 'user-1' })
  prismaMock.store.findUnique.mockResolvedValue({
    id: 'store-1',
    userId: 'user-1',
    name: 'Shop',
    domain: 'test.myshopify.com',
    currency: 'USD',
  })
  prismaMock.store.update.mockResolvedValue({})
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

describe('Shopify install callback — minted session token', () => {
  it('stamps the current tokenVersion into the session cookie (so it is revocable)', async () => {
    const res = await GET(makeRequest())

    expect(encodeMock).toHaveBeenCalledTimes(1)
    const token = encodeMock.mock.calls[0][0].token
    expect(token).toMatchObject({
      id: 'user-1',
      storeId: 'store-1',
      tokenVersion: 7,
    })
    expect(res.headers.get('set-cookie')).toContain('next-auth.session-token=SIGNED_SESSION')
  })
})
