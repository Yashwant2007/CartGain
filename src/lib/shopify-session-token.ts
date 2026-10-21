import crypto from 'crypto'

export type VerifiedShopifySessionToken = {
  /** The shop the token was minted for, e.g. "my-store.myshopify.com". */
  shop: string
  /** The merchant's user id inside the Shopify admin. */
  userId?: string
  /** The app URL the token was minted for, e.g. "https://cart-gain.com". */
  dest?: string
}

// Decode the Shopify App Bridge session token (JWT, HS256, signed with
// SHOPIFY_API_SECRET).
//
// The token is the OFFICIAL authentication mechanism for embedded apps: the
// merchant never types credentials and no third-party cookie is needed — App
// Bridge mints a short-lived token on the Shopify origin and hands it to us to
// verify.
//
// Claims (Shopify's current shape):
//   iss = the shop's admin url, e.g. "https://my-store.myshopify.com/admin"
//         (older tokens used the bare domain, "my-store.myshopify.com")
//   dest = the app url the token was minted for, e.g. "https://cart-gain.com"
//   aud = the app's public api key
//   sub = the merchant's user id
//   exp / nbf / iat = timestamps in seconds
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

function extractShopDomain(iss: unknown): string | null {
  if (typeof iss !== 'string' || !iss) return null

  // Newer tokens carry the full admin url.
  if (/^https?:\/\//i.test(iss)) {
    try {
      const host = new URL(iss).hostname.toLowerCase()
      return SHOP_DOMAIN_RE.test(host) ? host : null
    } catch {
      return null
    }
  }

  const host = iss.toLowerCase().replace(/\/+$/, '')
  return SHOP_DOMAIN_RE.test(host) ? host : null
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin.toLowerCase()
  } catch {
    return null
  }
}

export function verifyShopifySessionToken(
  token: string,
  opts?: { expectedDest?: string }
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

    // The token is minted for one app (the audience) on one app url (the
    // destination). The signature already proves the token was signed with
    // this app's secret; the audience/destination checks stop a token minted
    // for a sibling app (or for another origin of this app) from being
    // replayed here.
    const audience = typeof payload.aud === 'string' ? payload.aud : ''
    const dest = typeof payload.dest === 'string' ? payload.dest : undefined

    const tokenOrigin = dest ? originOf(dest) : null
    const expectedOrigin = opts?.expectedDest ? originOf(opts.expectedDest) : null
    const destMatches = Boolean(tokenOrigin && expectedOrigin && tokenOrigin === expectedOrigin)
    if (dest && expectedOrigin && !destMatches) return null

    const expectedAudiences = [process.env.SHOPIFY_API_KEY, process.env.NEXT_PUBLIC_SHOPIFY_API_KEY]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
    const audienceMatches = expectedAudiences.length === 0 || expectedAudiences.includes(audience)
    if (!audienceMatches && !destMatches) return null

    const shop = extractShopDomain(payload.iss)
    if (!shop) return null

    return {
      shop,
      userId: typeof payload.sub === 'string' ? payload.sub : undefined,
      dest,
    }
  } catch {
    return null
  }
}
