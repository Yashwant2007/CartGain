import {
  resolveShopifyStoreForUser,
  resolveShopifyStoreForDomain,
  shopifyBillingAvailability,
  shopifyTokenState,
  subscriptionWebhookMatchesLocal,
  type ShopifyStore,
} from '../service'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { store: { findMany: jest.fn(), findFirst: jest.fn() }, subscription: { findFirst: jest.fn() } },
}))

const prismaMock = prisma as any

const NOW = new Date('2026-10-30T12:00:00Z')

function makeStore(overrides: Partial<ShopifyStore> = {}): ShopifyStore {
  return {
    id: 'store-1',
    userId: 'user-1',
    domain: 'test.myshopify.com',
    apiKey: 'enc-token',
    shopifyRefreshToken: null,
    shopifyTokenExpiresAt: null,
    currency: 'INR',
    platform: 'shopify',
    isActive: true,
    ...overrides,
  }
}

describe('resolveShopifyStoreForUser', () => {
  beforeEach(() => jest.clearAllMocks())

  it('prefers an active Shopify store over an older stale row', async () => {
    const stale = makeStore({ id: 'stale', isActive: false })
    const active = makeStore({ id: 'active', isActive: true })
    prismaMock.store.findMany.mockResolvedValue([stale, active])

    await expect(resolveShopifyStoreForUser('user-1')).resolves.toMatchObject({ id: 'active' })
  })

  it('still returns a stale token-bearing row so billing can ask for a reconnect', async () => {
    const stale = makeStore({ id: 'stale', isActive: false })
    prismaMock.store.findMany.mockResolvedValue([stale])

    await expect(resolveShopifyStoreForUser('user-1')).resolves.toMatchObject({ id: 'stale' })
  })

  it('uses the explicitly selected store instead of substituting another active store', async () => {
    const selected = makeStore({ id: 'selected', isActive: false })
    const otherActive = makeStore({ id: 'other-active', isActive: true })
    prismaMock.store.findMany.mockResolvedValue([selected])

    await expect(resolveShopifyStoreForUser('user-1', 'selected')).resolves.toMatchObject({ id: 'selected' })
    expect(prismaMock.store.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'selected', userId: 'user-1' }),
    }))
    expect(otherActive.id).toBe('other-active')
  })

  it('resolves the saved subscription shop by its domain', async () => {
    const saved = makeStore({ id: 'saved-shop', domain: 'saved.myshopify.com' })
    prismaMock.store.findFirst.mockResolvedValue(saved)

    await expect(resolveShopifyStoreForDomain('user-1', 'saved.myshopify.com')).resolves.toMatchObject({ id: 'saved-shop' })
    expect(prismaMock.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1', domain: { equals: 'saved.myshopify.com', mode: 'insensitive' } }),
    }))
  })
})

describe('shopifyTokenState', () => {
  it('reports missing when no access token is stored', () => {
    expect(shopifyTokenState(makeStore({ apiKey: null }), NOW)).toBe('missing')
  })

  it('treats a legacy non-expiring token (no refresh, no expiry) as expired — reconnect required', () => {
    expect(shopifyTokenState(makeStore(), NOW)).toBe('expired')
  })

  it('reports a future token as usable', () => {
    expect(shopifyTokenState(makeStore({
      shopifyTokenExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    }), NOW)).toBe('ok')
  })

  it('reports refreshable only when an expired token has a refresh token', () => {
    const expired = makeStore({
      shopifyTokenExpiresAt: new Date(NOW.getTime() - 1000),
    })
    expect(shopifyTokenState(expired, NOW)).toBe('expired')
    expect(shopifyTokenState({ ...expired, shopifyRefreshToken: 'enc-refresh' }, NOW)).toBe('refreshable')
  })
})

describe('shopifyBillingAvailability', () => {
  it('is unavailable without a Shopify store', () => {
    expect(shopifyBillingAvailability(null)).toMatchObject({
      available: false,
      reason: 'no_shopify_store',
    })
  })

  it('is unavailable for an inactive store even when a token exists', () => {
    expect(shopifyBillingAvailability(makeStore({ isActive: false }))).toMatchObject({
      available: false,
      reason: 'store_inactive',
    })
  })

  it('requires reconnection for an expired token with no refresh token', () => {
    expect(shopifyBillingAvailability(makeStore({
      shopifyTokenExpiresAt: new Date(Date.now() - 60_000),
    }))).toMatchObject({
      available: false,
      reason: 'reconnect_required',
      tokenState: 'expired',
    })
  })

  it('supports refreshable and legacy tokens', () => {
    expect(shopifyBillingAvailability(makeStore({
      shopifyTokenExpiresAt: new Date(Date.now() - 60_000),
      shopifyRefreshToken: 'enc-refresh',
    }))).toMatchObject({
      available: true,
      currency: 'INR',
      tokenState: 'refreshable',
    })
    // A legacy token with no refresh token and no expiry is deprecated —
    // Shopify rejects it with 403, so billing is unavailable until reconnect.
    expect(shopifyBillingAvailability(makeStore())).toMatchObject({
      available: false,
      reason: 'reconnect_required',
      tokenState: 'expired',
    })
  })

  it('rejects unsupported currencies without guessing a price', () => {
    expect(shopifyBillingAvailability(makeStore({
      currency: 'EUR',
      shopifyRefreshToken: 'enc-refresh',
      shopifyTokenExpiresAt: new Date(Date.now() + 1_000_000),
    }))).toMatchObject({
      available: false,
      reason: 'unsupported_currency',
    })
  })
})

describe('subscriptionWebhookMatchesLocal', () => {
  it('accepts the matching id and an unassigned same-shop placeholder', () => {
    expect(subscriptionWebhookMatchesLocal('gid://shopify/AppSubscription/1', 'gid://shopify/AppSubscription/1')).toBe(true)
    expect(subscriptionWebhookMatchesLocal(null, 'gid://shopify/AppSubscription/1')).toBe(true)
  })

  it('rejects a delayed webhook for a replaced subscription id', () => {
    expect(subscriptionWebhookMatchesLocal('gid://shopify/AppSubscription/new', 'gid://shopify/AppSubscription/old')).toBe(false)
  })
})
