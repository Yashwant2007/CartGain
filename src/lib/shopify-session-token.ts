import crypto from 'crypto'

export type VerifiedShopifySessionToken = {
  /** The shop the token was minted for, e.g. "my-store.myshopify.com". */
  shop: string
  /** The merchant's user id inside the Shopify admin. */
  userId?: string
  /** The app URL the token was minted for, e.g. "https://cart-gain.com". */
  dest?: string
}

// Decode the Shopify App Bridge ID token (JWT, HS256, signed with
// SHOPIFY_API_SECRET).
//
// The token is the OFFICIAL authentication mechanism for embedded apps: the
// merchant never types credentials and no third-party cookie is needed — App
// Bridge mints a short-lived token on the Shopify origin and hands it to us to
// verify.
//
// Claims (Shopify's current shape, see
// https://shopify.dev/docs/apps/build/authentication-authorization/id-tokens):
//   iss  = the shop's admin url, e.g. "https://my-store.myshopify.com/admin"
//          (older tokens used the bare domain, "my-store.myshopify.com")
//   dest = the shop's origin the token was minted for,
//          e.g. "https://my-store.myshopify.com"
//   aud  = the app's client id
//   sub  = the merchant's user id
//   exp / nbf / iat = timestamps in seconds
//
// IMPORTANT: `dest` is the SHOP's origin, not the app's own origin. Shopify
// requires the hostnames of `iss` and `dest` to match (both are the shop).
// Comparing `dest` against our own app origin rejected every valid token.
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

function hostnameOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null

  // Full url form, e.g. "https://my-store.myshopify.com/admin".
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).hostname.toLowerCase()
    } catch {
      return null
    }
  }

  // Bare domain form, e.g. "my-store.myshopify.com".
  return value.toLowerCase().replace(/\/+$/, '').split('/')[0] || null
}

function extractShopDomain(iss: unknown): string | null {
  const host = hostnameOf(iss)
  if (!host) return null
  return SHOP_DOMAIN_RE.test(host) ? host : null
}

export function verifyShopifySessionToken(
  token: string,
  opts?: { expectedShop?: string }
): VerifiedShopifySessionToken | null {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, sigB64] = parts
  const expected = crypto.createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')

  try {
    const a = Buffer.from(sigB64)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null
    if (typeof payload.nbf === 'number' && payload.nbf > now + 30) return null
    if (typeof payload.iat === 'number' && payload.iat > now + 60) return null

    // The token is minted for one app (the audience) on one shop (the
    // destination). The signature already proves the token was signed with
    // this app's secret; the audience/destination checks stop a token minted
    // for a sibling app (or for another shop) from being replayed here.
    const audience = typeof payload.aud === 'string' ? payload.aud : ''
    const dest = typeof payload.dest === 'string' ? payload.dest : undefined

    const expectedAudiences = [process.env.SHOPIFY_API_KEY, process.env.NEXT_PUBLIC_SHOPIFY_API_KEY]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (audience && expectedAudiences.length > 0 && !expectedAudiences.includes(audience)) {
      return null
    }

    // `iss` and `dest` must point at the same shop.
    const issHost = hostnameOf(payload.iss)
    const destHost = hostnameOf(dest)
    if (!issHost || !destHost || issHost !== destHost) return null

    const shop = extractShopDomain(payload.iss)
    if (!shop) return null

    if (opts?.expectedShop && shop !== opts.expectedShop.toLowerCase()) return null

    return {
      shop,
      userId: typeof payload.sub === 'string' ? payload.sub : undefined,
      dest,
    }
  } catch {
    return null
  }
}
