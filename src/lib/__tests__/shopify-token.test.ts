/**
 * @jest-environment node
 *
 * Shopify offline-token lifecycle:
 *  - legacy non-expiring tokens (no refresh token) are never reused;
 *  - a valid expiring token is returned without a network call;
 *  - an expired token is refreshed and persisted;
 *  - a 401/403 triggers exactly one forced refresh + retry.
 */
import {
  getAccessToken,
  fetchShopifyWithAuth,
  ShopifyReconnectRequiredError,
} from '@/lib/shopify'
import prisma from '@/lib/db'

jest.mock('@/lib/encryption', () => ({
  decrypt: jest.fn((value: string) => value),
  encrypt: jest.fn((value: string) => `enc(${value})`),
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { store: { update: jest.fn() } },
}))

const prismaMock = prisma as any
const originalFetch = global.fetch
const originalKey = process.env.SHOPIFY_API_KEY
const originalSecret = process.env.SHOPIFY_API_SECRET

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    id: 'store-1',
    domain: 'test.myshopify.com',
    apiKey: 'token',
    shopifyRefreshToken: 'refresh',
    shopifyTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  }
}

function response(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

beforeAll(() => {
  process.env.SHOPIFY_API_KEY = 'client-id'
  process.env.SHOPIFY_API_SECRET = 'client-secret'
})

afterAll(() => {
  if (originalKey === undefined) delete process.env.SHOPIFY_API_KEY
  else process.env.SHOPIFY_API_KEY = originalKey
  if (originalSecret === undefined) delete process.env.SHOPIFY_API_SECRET
  else process.env.SHOPIFY_API_SECRET = originalSecret
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(global as any).fetch = jest.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('getAccessToken', () => {
  it('refuses a legacy non-expiring token instead of reusing it', async () => {
    const token = await getAccessToken(makeStore({
      shopifyRefreshToken: null,
      shopifyTokenExpiresAt: null,
    }))

    expect(token).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns a still-valid expiring token without refreshing', async () => {
    const token = await getAccessToken(makeStore())

    expect(token).toBe('token')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(prismaMock.store.update).not.toHaveBeenCalled()
  })

  it('refreshes an expired token and persists the rotated credentials', async () => {
    ;(global as any).fetch = jest.fn(async () =>
      response(200, { access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }),
    )

    const token = await getAccessToken(makeStore({
      shopifyTokenExpiresAt: new Date(Date.now() - 1000),
    }))

    expect(token).toBe('new-token')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://test.myshopify.com/admin/oauth/access_token',
    )
    expect(prismaMock.store.update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: expect.objectContaining({
        apiKey: 'enc(new-token)',
        shopifyRefreshToken: 'enc(new-refresh)',
        shopifyTokenExpiresAt: expect.any(Date),
      }),
    })
  })

  it('returns null when the refresh request fails', async () => {
    ;(global as any).fetch = jest.fn(async () => response(400, {}))

    const token = await getAccessToken(makeStore({
      shopifyTokenExpiresAt: new Date(Date.now() - 1000),
    }))

    expect(token).toBeNull()
    expect(prismaMock.store.update).not.toHaveBeenCalled()
  })
})

describe('fetchShopifyWithAuth', () => {
  it('throws a reconnect error for a legacy token without calling Shopify', async () => {
    await expect(
      fetchShopifyWithAuth(
        makeStore({ shopifyRefreshToken: null, shopifyTokenExpiresAt: null }),
        'https://test.myshopify.com/admin/api/2026-04/shop.json',
      ),
    ).rejects.toBeInstanceOf(ShopifyReconnectRequiredError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('force-refreshes once on 401 and retries with the new token', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, {
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(response(200, { shop: { name: 'Test' } }))
    ;(global as any).fetch = fetchMock

    const res = await fetchShopifyWithAuth(
      makeStore(),
      'https://test.myshopify.com/admin/api/2026-04/shop.json',
    )

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const retryInit = fetchMock.mock.calls[2][1] as RequestInit
    expect((retryInit.headers as Headers).get('X-Shopify-Access-Token')).toBe('new-token')
  })

  it('throws a reconnect error when the refresh and retry both fail', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(400, {}))
    ;(global as any).fetch = fetchMock

    await expect(
      fetchShopifyWithAuth(
        makeStore(),
        'https://test.myshopify.com/admin/api/2026-04/shop.json',
      ),
    ).rejects.toBeInstanceOf(ShopifyReconnectRequiredError)
  })
})
