/**
 * @jest-environment node
 *
 * Safety net for shops where the authorization-code exchange still returns a
 * legacy non-expiring token: convert it through Shopify's token-exchange
 * migration grant so reconnect restores access without another merchant action.
 */
import { migrateNonExpiringOfflineToken } from '@/lib/shopify-oauth'

const originalFetch = global.fetch
const originalKey = process.env.SHOPIFY_API_KEY
const originalSecret = process.env.SHOPIFY_API_SECRET

function response(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
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
  ;(global as any).fetch = jest.fn()
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('migrateNonExpiringOfflineToken', () => {
  it('exchanges a legacy offline token for an expiring pair', async () => {
    const fetchMock = jest.fn(async () =>
      response(200, {
        access_token: 'expiring-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        refresh_token_expires_in: 7776000,
      }),
    )
    ;(global as any).fetch = fetchMock

    const result = await migrateNonExpiringOfflineToken({
      shop: 'test.myshopify.com',
      accessToken: 'legacy-token',
    })

    expect(result).toEqual({
      access_token: 'expiring-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      refresh_token_expires_in: 7776000,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://test.myshopify.com/admin/oauth/access_token')
    expect(JSON.parse(init.body as string)).toMatchObject({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: 'client-id',
      client_secret: 'client-secret',
      subject_token: 'legacy-token',
      subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      expiring: '1',
    })
  })

  it('returns null when Shopify rejects the migration', async () => {
    ;(global as any).fetch = jest.fn(async () => response(400, { error: 'invalid_subject_token' }))

    await expect(migrateNonExpiringOfflineToken({
      shop: 'test.myshopify.com',
      accessToken: 'legacy-token',
    })).resolves.toBeNull()
  })

  it('returns null when the response has no refresh token', async () => {
    ;(global as any).fetch = jest.fn(async () =>
      response(200, { access_token: 'still-legacy' }),
    )

    await expect(migrateNonExpiringOfflineToken({
      shop: 'test.myshopify.com',
      accessToken: 'legacy-token',
    })).resolves.toBeNull()
  })
})
