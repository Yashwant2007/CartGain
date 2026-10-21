/**
 * @jest-environment node
 *
 * The App Bridge ID token is the only credential an embedded app gets.
 * The verifier is the gate between "a token Shopify minted for this app" and
 * "a request that may act on a merchant's store", so it is checked here
 * against the shapes Shopify actually issues.
 *
 * Reference (Shopify docs, "ID tokens"):
 *   iss  = https://{shop}.myshopify.com/admin
 *   dest = https://{shop}.myshopify.com
 *   aud  = {client id}
 * and "the issuer and destination hostnames must match".
 */
import crypto from 'crypto'
import { verifyShopifySessionToken } from '../shopify-session-token'

const SECRET = 'shpss_secret'
const API_KEY = 'api-key-123'
const SHOP = 'my-store.myshopify.com'

function mintToken(payload: Record<string, unknown>, secret = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

const NOW = Math.floor(Date.now() / 1000)

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: API_KEY,
    sub: '12345',
    iat: NOW - 10,
    nbf: NOW - 10,
    exp: NOW + 60,
    ...overrides,
  }
}

describe('verifyShopifySessionToken', () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_SECRET = SECRET
    process.env.SHOPIFY_API_KEY = API_KEY
    delete process.env.NEXT_PUBLIC_SHOPIFY_API_KEY
  })

  it('accepts a token whose issuer is the shop admin url', () => {
    const token = mintToken(basePayload())
    const result = verifyShopifySessionToken(token)
    expect(result).not.toBeNull()
    expect(result?.shop).toBe(SHOP)
    expect(result?.userId).toBe('12345')
  })

  it('accepts the older bare-domain issuer shape', () => {
    const token = mintToken(basePayload({ iss: SHOP }))
    expect(verifyShopifySessionToken(token)?.shop).toBe(SHOP)
  })

  it('rejects an issuer that is not a myshopify domain', () => {
    const token = mintToken(basePayload({ iss: 'https://evil.example.com/admin' }))
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = mintToken(basePayload(), 'another-secret')
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = mintToken(basePayload({ exp: NOW - 1 }))
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('rejects a token that is not valid yet', () => {
    const token = mintToken(basePayload({ nbf: NOW + 600 }))
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('rejects a token minted for another app (audience mismatch)', () => {
    const token = mintToken(basePayload({ aud: 'some-other-app' }))
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('rejects a token whose destination hostname differs from the issuer', () => {
    // `dest` is the shop origin, never the app origin — a token that claims
    // to be for another host must not be accepted.
    const token = mintToken(basePayload({ dest: 'https://evil-cart-gain.com' }))
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('rejects a token minted for a different shop', () => {
    const token = mintToken(
      basePayload({
        iss: 'https://other-store.myshopify.com/admin',
        dest: 'https://other-store.myshopify.com',
      })
    )
    expect(verifyShopifySessionToken(token, { expectedShop: SHOP })).toBeNull()
  })

  it('accepts a token for the expected shop', () => {
    const token = mintToken(basePayload())
    expect(verifyShopifySessionToken(token, { expectedShop: SHOP })).not.toBeNull()
  })

  it('accepts a token for the expected shop regardless of its case', () => {
    const token = mintToken(basePayload())
    expect(verifyShopifySessionToken(token, { expectedShop: 'My-Store.myshopify.com' })).not.toBeNull()
  })

  it('returns null when no api secret is configured', () => {
    delete process.env.SHOPIFY_API_SECRET
    const token = mintToken(basePayload())
    expect(verifyShopifySessionToken(token)).toBeNull()
  })

  it('accepts the audience from the public client id when only that is set', () => {
    delete process.env.SHOPIFY_API_KEY
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = API_KEY
    const token = mintToken(basePayload())
    expect(verifyShopifySessionToken(token)).not.toBeNull()
  })
})
