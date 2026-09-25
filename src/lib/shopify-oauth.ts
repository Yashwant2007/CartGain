import crypto from 'crypto'

/**
 * Minimum necessary access — kept in sync with shopify.app.toml.
 * - read_customers / read_checkouts / read_orders / read_products: recover
 *   abandoned carts and read the data needed for recovery + bargain pricing.
 * - write_checkouts: required alongside read_checkouts for the abandoned
 *   checkout REST endpoints CartGain uses.
 * - read_discounts / write_discounts: create and manage recovery discount
 *   codes (discountCodeBasicCreate).
 * - write_webhooks / read_webhooks: register/update Shopify webhooks at
 *   install time (including privacy/redaction topics).
 * Not requested: write_customers, write_orders, write_products,
 * write_draft_orders, read_draft_orders, fulfillment scopes — CartGain does
 * not write customers/orders/products and never uses draft orders.
 */
export const SHOPIFY_OAUTH_SCOPES = [
  'read_checkouts',
  'write_checkouts',
  'read_orders',
  'read_customers',
  'read_products',
  'read_discounts',
  'write_discounts',
  'write_webhooks',
  'read_webhooks',
].join(',')

export function buildShopifyOAuthUrl(opts: {
  shop: string
  state: string
  redirectUri: string
}): string {
  const apiKey = process.env.SHOPIFY_API_KEY
  if (!apiKey) throw new Error('SHOPIFY_API_KEY not configured')

  const authUrl = new URL(`https://${opts.shop}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', apiKey)
  authUrl.searchParams.set('scope', SHOPIFY_OAUTH_SCOPES)
  authUrl.searchParams.set('redirect_uri', opts.redirectUri)
  authUrl.searchParams.set('state', opts.state)
  // Request expiring online tokens (Shopify deprecated non-expiring offline
  // tokens). Online tokens include expires_in + refresh_token + the
  // associated_user (owner) identity — we store all three in the callback.
  authUrl.searchParams.append('grant_options[]', 'per-user')
  return authUrl.toString()
}

/**
 * Shopify OAuth + callback verification helpers.
 *
 * The OAuth state is a signed token (payload.sig) whose HMAC secret used to be
 * NEXTAUTH_SECRET. Reusing the NextAuth JWT secret for a second cryptographic
 * purpose is an anti-pattern (a compromise of one usage endangers the other),
 * so a dedicated SHOPIFY_OAUTH_STATE_SECRET is preferred. Fall back to
 * NEXTAUTH_SECRET when unset so existing deployments keep working unchanged.
 */
export function getOAuthStateSecret(): string | null {
  const dedicated = process.env.SHOPIFY_OAUTH_STATE_SECRET
  if (dedicated && dedicated.length >= 16) return dedicated
  return process.env.NEXTAUTH_SECRET ?? null
}

export function signOAuthState(payload: Record<string, unknown>): string | null {
  const secret = getOAuthStateSecret()
  if (!secret) return null
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return `${body}.${sig}`
}

export function verifyOAuthState(state: string): Record<string, unknown> | null {
  const secret = getOAuthStateSecret()
  if (!secret) return null
  const dotIndex = state.lastIndexOf('.')
  if (dotIndex === -1) return null
  const body = state.slice(0, dotIndex)
  const receivedSig = state.slice(dotIndex + 1)
  const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(receivedSig.padEnd(64, '0').slice(0, 64), 'hex')
  const b = Buffer.from(expectedSig, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString())
    return decoded && typeof decoded === 'object' ? decoded as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function isValidShopDomain(shop: string | null): boolean {
  return typeof shop === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

/**
 * Verify Shopify's OAuth callback HMAC. Shopify signs every query parameter
 * (except hmac and signature) with the app secret (hex-encoded, alphabetically
 * sorted, percent-encoded). Verifying this confirms the callback really came
 * from Shopify for THIS app install and that nothing (shop, code, timestamp)
 * was tampered with in transit.
 */
export function verifyShopifyCallbackHmac(params: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) return false

  const hmac = params.get('hmac')
  if (!hmac) return false

  const pairs: string[] = []
  params.forEach((value, key) => {
    if (key === 'hmac' || key === 'signature') return
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  })
  pairs.sort()
  const message = pairs.join('&')

  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex')
  const a = Buffer.from(hmac, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}