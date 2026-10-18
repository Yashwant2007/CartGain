/**
 * @jest-environment node
 *
 * Regression tests for the public /api/bargain/start hardening.
 *
 * Confirmed faults (audit):
 *  - F1a: the route auto-created the BargainConfig with `update: { enabled: true }`,
 *    so any anonymous visitor could re-enable bargaining on a store whose merchant
 *    had deliberately turned it OFF (the disabled flag never reached the gate).
 *  - F1b: the client-supplied `currency` was written straight onto Store.currency,
 *    letting an attacker rewrite the shop currency with an arbitrary string (or on
 *    a store already confirmed to a real non-default currency).
 *
 * Fix: never override an existing config, and only accept a currency that is a
 * real supported currency while the store is still on the schema default (USD).
 */
import { POST } from '@/app/api/bargain/start/route'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findUnique: jest.fn(), update: jest.fn() },
    bargainConfig: { upsert: jest.fn(), findUnique: jest.fn() },
    bargainProduct: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/rate-limit', () => ({
  checkSimpleRateLimit: jest.fn(async () => ({ allowed: true, retryAfter: 0 })),
  clientIp: jest.fn(() => '1.2.3.4'),
}))

jest.mock('@/lib/shopify', () => ({
  fetchShopifyProductPrice: jest.fn(async () => null),
}))

jest.mock('@/lib/services/bargain', () => {
  const actual = jest.requireActual('@/lib/services/bargain')
  return {
    ...actual,
    negotiateStep: jest.fn(async () => ({ reply: 'hi', tactic: 'chat', sentiment: 'neutral' })),
    buildCustomerContext: jest.fn(async () => null),
  }
})

jest.mock('@/lib/bargain/goals', () => ({
  buildGoalContextForNegotiation: jest.fn(async () => null),
  publicGoalView: jest.fn(() => undefined),
}))

jest.mock('@/lib/bargain/gate', () => ({
  getBargainGate: jest.fn(async () => ({ sessionsExhausted: false, subscriptionId: null, planId: 'free' })),
  recordBargainSessionOp: jest.fn(() => ({})),
  BARGAIN_SESSIONS_EXHAUSTED: 'BARGAIN_SESSIONS_EXHAUSTED',
}))

jest.mock('@/lib/bargain/purchase', () => ({
  generateClaimToken: jest.fn(() => 'tok'),
}))

jest.mock('@/lib/data-protection', () => ({
  logDataAccess: jest.fn(async () => {}),
}))

jest.mock('@/lib/analytics/track', () => ({
  track: jest.fn(async () => {}),
}))

const prismaMock = prisma as unknown as {
  store: { findUnique: jest.Mock; update: jest.Mock }
  bargainConfig: { upsert: jest.Mock; findUnique: jest.Mock }
  bargainProduct: { findUnique: jest.Mock }
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://cart-gain.com/api/bargain/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({
      storeId: 'store-1',
      shopifyProductId: 'gid://shopify/Product/1',
      originalPrice: 1000,
      ...body,
    }),
  }) as any
}

const baseStore = {
  id: 'store-1',
  isActive: true,
  name: 'Test Store',
  domain: 'test.myshopify.com',
  currency: 'USD',
  timezone: 'UTC',
  apiKey: 'shpat_x',
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.store.findUnique.mockResolvedValue({ ...baseStore })
  prismaMock.store.update.mockResolvedValue({ ...baseStore })
  // Merchant has bargaining DISABLED → the gate must refuse.
  prismaMock.bargainConfig.upsert.mockResolvedValue({
    enabled: false,
    sessionTimeout: 600,
    maxAttempts: 3,
    aiPersona: 'friendly_shopkeeper',
    language: 'auto',
    minProfitPercent: 20,
  })
  prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: false, minProfitPercent: 20 })
  prismaMock.bargainProduct.findUnique.mockResolvedValue(null)
})

describe('POST /api/bargain/start — hardening', () => {
  it('refuses (403) a merchant-disabled store instead of force-enabling it', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(403)

    const upsertArg = prismaMock.bargainConfig.upsert.mock.calls[0][0]
    // The update branch must be a no-op — never force `enabled: true`.
    expect(upsertArg.update).toEqual({})
    expect(upsertArg.update.enabled).toBeUndefined()
  })

  it('syncs the shop currency only when the store is still on the default', async () => {
    await POST(makeRequest({ currency: 'INR' }))
    expect(prismaMock.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { currency: 'INR' },
    })
  })

  it('never rewrites a store already confirmed to a non-default currency', async () => {
    prismaMock.store.findUnique.mockResolvedValue({ ...baseStore, currency: 'EUR' })
    await POST(makeRequest({ currency: 'USD' }))
    expect(prismaMock.store.update).not.toHaveBeenCalled()
  })

  it('rejects unsupported currency values (no store write)', async () => {
    await POST(makeRequest({ currency: 'ZZZ' }))
    expect(prismaMock.store.update).not.toHaveBeenCalled()
  })
})
