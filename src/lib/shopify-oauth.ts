import crypto from 'crypto'

/**
 * Minimum necessary access — kept in sync with shopify.app.toml.
 * - read_orders: abandoned checkouts, orders and refund webhooks. Shopify's
 *   abandoned-checkout resource requires the orders scope (not checkouts).
 * - read_customers: resolve a missing recovery name from the Shopify customer.
 * - read_products: product details and prices for the bargain widget.
 * - write_discounts: create one-use bargain/recovery discount codes.
 * Not requested: checkout, order/customer/product write scopes, discount reads,
 * product listings, fulfillment and draft-order scopes. CartGain does not use
 * them. read_all_orders is deliberately absent: the app never reads order
 * history beyond what its webhooks deliver.
 * read_webhooks / write_webhooks are also omitted — Shopify deprecated those
 * scopes and webhook management is implicit for the app.
 */
export const SHOPIFY_OAUTH_SCOPES = [
  'read_orders',
  'read_customers',
  'read_products',
  'write_discounts',
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
  authUrl.searchParams.set('expiring', '1')
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
  // Stamp every state with an issued-at so an old state cannot be replayed
  // indefinitely (verifyOAuthState enforces a max age).
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return `${body}.${sig}`
}

export function verifyOAuthState(
  state: string,
  maxAgeMs = 30 * 60 * 1000,
): Record<string, unknown> | null {
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
    if (!decoded || typeof decoded !== 'object') return null
    // Timestamp guard: a state without a valid, recent iat is rejected. This
    // closes the "capture a legitimately-signed state and reuse it later" window.
    const iat = (decoded as Record<string, unknown>).iat
    if (typeof iat !== 'number' || !Number.isFinite(iat)) return null
    if (Date.now() - iat > maxAgeMs) return null
    if (Date.now() - iat < -60_000) return null // clock-skew guard
    return decoded as Record<string, unknown>
  } catch {
    return null
  }
}

export function isValidShopDomain(shop: string | null): boolean {
  return typeof shop === 'string' &&
    /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

export interface ExpiringOfflineToken {
  access_token: string
  refresh_token: string
  expires_in?: number
  refresh_token_expires_in?: number
}

/**
 * Convert a non-expiring offline token into an expiring one via Shopify's
 * token-exchange migration grant. This is the safety net for shops where the
 * authorization-code exchange still returns a legacy token: reconnecting should
 * self-heal instead of leaving the merchant with an unusable credential.
 *
 * Returns null (and leaves the caller on the legacy token) when Shopify rejects
 * the migration, so a failed conversion never blocks the connect flow.
 */
export async function migrateNonExpiringOfflineToken(opts: {
  shop: string
  accessToken: string
  timeoutMs?: number
}): Promise<ExpiringOfflineToken | null> {
  const apiKey = process.env.SHOPIFY_API_KEY
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim()
  if (!apiKey || !apiSecret) return null

  try {
    const res = await fetch(`https://${opts.shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: apiKey,
        client_secret: apiSecret,
        subject_token: opts.accessToken,
        subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
        requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
        expiring: '1',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.access_token || !data?.refresh_token) return null
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      ...(data.expires_in ? { expires_in: data.expires_in } : {}),
      ...(data.refresh_token_expires_in ? { refresh_token_expires_in: data.refresh_token_expires_in } : {}),
    }
  } catch {
    return null
  }
}

/**
 * Verify Shopify's OAuth callback HMAC. Shopify signs every query parameter
 * (except hmac and signature) with the app secret (hex-encoded, alphabetically
 * sorted, percent-encoded). Verifying this confirms the callback really came
 * from Shopify for THIS app install and that nothing (shop, code, timestamp)
 * was tampered with in transit.
 */
export function verifyShopifyCallbackHmac(params: URLSearchParams): boolean {
  const secret = process.env.SHOPIFY_API_SECRET?.trim()
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