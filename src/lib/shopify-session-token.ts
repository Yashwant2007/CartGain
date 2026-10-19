import crypto from 'crypto'

// Decode the Shopify App Bridge session token (JWT, HS256, signed with
// SHOPIFY_API_SECRET). Claims: iss = shop domain (e.g. my-store.myshopify.com),
// sub = merchant id, aud = app api key, exp/nbf/iat.
//
// This is the OFFICIAL authentication mechanism for embedded apps: the merchant
// never types credentials and no third-party cookie is needed — App Bridge mints
// a short-lived token on the Shopify origin and hands it to us to verify.
export function verifyShopifySessionToken(token: string): { shop: string; userId?: string } | null {
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
    if (typeof payload.exp !== 'number' || payload.exp < now) return null
    if (typeof payload.nbf === 'number' && payload.nbf > now) return null
    const aud = process.env.SHOPIFY_API_KEY
    if (aud && payload.aud !== aud) return null
    if (typeof payload.iss !== 'string' || !payload.iss.endsWith('.myshopify.com')) return null
    return { shop: payload.iss, userId: typeof payload.sub === 'string' ? payload.sub : undefined }
  } catch {
    return null
  }
}
