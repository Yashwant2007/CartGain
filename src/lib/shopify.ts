import crypto from 'crypto'
import { normalizeShopifyLineItems } from './shopify-line-items'

const REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh 5 min before expiry

const SHOPIFY_MAX_RETRIES = 3
const SHOPIFY_BASE_BACKOFF_MS = 500
const SHOPIFY_MAX_BACKOFF_MS = 30_000

/** Thrown when a Shopify access token is missing, revoked, expired, or is a
 * legacy non-expiring token that Shopify no longer accepts. The store must be
 * reconnected from Integrations so OAuth can issue a fresh expiring offline
 * token. */
export class ShopifyReconnectRequiredError extends Error {
  constructor(message = 'Your Shopify connection has expired. Reconnect the store from Integrations, then try again.') {
    super(message)
    this.name = 'ShopifyReconnectRequiredError'
  }
}

// Shopify returns 429 (throttled) with a Retry-After header, and transient 5xx
// during incidents. Without backing off we hammer the API, extend the throttle
// window and fail recoveries that would have succeeded a second later.
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 430 || (status >= 500 && status < 600)
}

// Pure: milliseconds to wait before the next attempt. Honours Retry-After
// (seconds OR an HTTP-date), otherwise exponential backoff. Capped so a bad
// header can't stall a request for minutes.
export function retryDelayMs(
  response: { status: number; headers: { get(name: string): string | null } },
  attempt: number,
): number {
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, SHOPIFY_MAX_BACKOFF_MS)
    }
    const date = Date.parse(retryAfter)
    if (!Number.isNaN(date)) {
      return Math.min(Math.max(date - Date.now(), 0), SHOPIFY_MAX_BACKOFF_MS)
    }
  }
  return Math.min(SHOPIFY_BASE_BACKOFF_MS * 2 ** attempt, SHOPIFY_MAX_BACKOFF_MS)
}

// Outbound Shopify Admin calls may only ever target a real Shopify host. The
// store's `domain` is merchant-settable, so without this guard a merchant could
// point it at an internal/attacker host and have the app send a live Shopify
// access token there (SSRF + credential exfiltration). Matches *.myshopify.com
// and the shared api.shopify.com token-exchange host.
const ALLOWED_SHOPIFY_HOST = /(^|\.)myshopify\.com$|^api\.shopify\.com$/i

export function assertAllowedShopifyHost(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    throw new Error('Blocked outbound Shopify request: invalid URL')
  }
  if (!ALLOWED_SHOPIFY_HOST.test(host)) {
    throw new Error(`Blocked outbound Shopify request to disallowed host: ${host}`)
  }
}

// fetch() wrapper with bounded retry/backoff for Shopify rate limits. Retries
// reuse the caller's `init` (including its AbortSignal timeout) — status-based
// throttling never trips that timeout, so the signal is still live.
async function shopifyFetch(input: string, init: RequestInit = {}, retries = SHOPIFY_MAX_RETRIES): Promise<Response> {
  assertAllowedShopifyHost(input)
  let res = await globalThis.fetch(input, init)
  let attempt = 0
  while (isRetryableStatus(res.status) && attempt < retries) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res, attempt)))
    res = await globalThis.fetch(input, init)
    attempt++
  }
  return res
}

export async function getAccessToken(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  { forceRefresh = false } = {},
): Promise<string | null> {
  if (!store.apiKey) return null

  const { decrypt, encrypt } = await import('@/lib/encryption')

  // Legacy/permanent token (no refresh token). Shopify no longer accepts
  // non-expiring access tokens for the Admin API, so we cannot use it. The
  // store must reconnect via OAuth to get a fresh expiring offline token.
  if (!store.shopifyRefreshToken || !store.shopifyTokenExpiresAt) {
    return null
  }

  // Token still valid — unless the caller forced a refresh (e.g. after a
  // 401/403 that suggests Shopify rejected it even before the expiry margin).
  if (!forceRefresh && Date.now() < store.shopifyTokenExpiresAt.getTime() - REFRESH_MARGIN_MS) {
    try { return decrypt(store.apiKey) } catch { return null }
  }

  // Token expired or near expiry — refresh it
  const apiKey = process.env.SHOPIFY_API_KEY
  const apiSecret = process.env.SHOPIFY_API_SECRET
  if (!apiKey || !apiSecret) return null

  let refreshToken: string
  try { refreshToken = decrypt(store.shopifyRefreshToken) } catch { return null }

  try {
    const res = await shopifyFetch(`https://${store.domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!res.ok) return null

    const data = await res.json()
    const newToken: string | undefined = data.access_token
    const newRefresh: string | undefined = data.refresh_token
    const expiresIn: number | undefined = data.expires_in

    if (!newToken) return null

    const prisma = (await import('@/lib/db')).default
    await prisma.store.update({
      where: { id: store.id },
      data: {
        apiKey: encrypt(newToken),
        ...(newRefresh ? { shopifyRefreshToken: encrypt(newRefresh) } : {}),
        ...(expiresIn ? { shopifyTokenExpiresAt: new Date(Date.now() + expiresIn * 1000) } : {}),
      },
    })

    return newToken
  } catch {
    return null
  }
}

/**
 * Fetch a Shopify Admin REST endpoint with automatic token refresh on 401/403.
 *
 * Resolves the access token via `getAccessToken`, sends the request, and on a
 * 401/403 (token rejected) force-refreshes once when the store has a refresh
 * token. Legacy non-expiring tokens (no refresh token) can never be refreshed,
 * so they surface `ShopifyReconnectRequiredError` instead of being reused and
 * rejected on every call.
 */
export async function fetchShopifyWithAuth(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  assertAllowedShopifyHost(input)

  const accessToken = await getAccessToken(store)
  if (!accessToken) {
    throw new ShopifyReconnectRequiredError()
  }

  const headers = new Headers(init.headers || {})
  headers.set('X-Shopify-Access-Token', accessToken)

  let res = await shopifyFetch(input, { ...init, headers })

  // Shopify rejected the token even though getAccessToken considered it valid
  // (e.g. revoked, or non-expiring ban applied mid-session). Force a refresh
  // when a refresh token exists, then retry once.
  if (res.status === 401 || res.status === 403) {
    if (store.shopifyRefreshToken) {
      const refreshed = await getAccessToken(store, { forceRefresh: true })
      if (refreshed && refreshed !== accessToken) {
        headers.set('X-Shopify-Access-Token', refreshed)
        res = await shopifyFetch(input, { ...init, headers })
      }
    }
    if (res.status === 401 || res.status === 403) {
      throw new ShopifyReconnectRequiredError(`Shopify rejected the access token (HTTP ${res.status}). Reconnect the store from Integrations.`)
    }
  }

  return res
}

/**
 * SHA-256 of the configured app secret, truncated.
 */
function secretFingerprint(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex').slice(0, 16)
}

export function verifyShopifyWebhook(body: string, headers: Headers, overrideSecret?: string | null): boolean {
  const hmacHeader = headers.get('x-shopify-hmac-sha256')
  // Trim: a value pasted into the Vercel dashboard often carries a trailing
  // newline. The OAuth query-HMAC and the body-HMAC would then disagree with
  // Shopify while both "look" configured.
  // A per-store secret (when the shop is backed by a custom app) takes
  // precedence over the app-wide secret — see Store.webhookSecret.
  const shopifySecret = (overrideSecret?.trim() || process.env.SHOPIFY_API_SECRET?.trim()) || undefined
  const secretSource = overrideSecret?.trim() ? 'store' : 'app'

  if (!hmacHeader || !shopifySecret) {
    // Distinguish the two sources so the operator knows WHICH secret to fix:
    // an empty per-store secret falling through to a missing app secret is a
    // different remediation than the app secret itself being unset.
    const reason = !hmacHeader
      ? 'missing X-Shopify-Hmac-Sha256 header'
      : secretSource === 'store'
        ? 'per-store webhook secret is not configured'
        : 'SHOPIFY_API_SECRET is not configured'
    console.error(`[shopify-webhook] REJECTED before comparison — ${reason}`)
    return false
  }

  const hmac = crypto
    .createHmac('sha256', shopifySecret)
    .update(body, 'utf8')
    .digest('base64')

  const expected = Buffer.from(hmac)
  const received = Buffer.from(hmacHeader)
  if (expected.length !== received.length) {
    console.error(
      `[shopify-webhook] REJECTED — signature length mismatch ` +
        `(received ${received.length}B, expected ${expected.length}B). ` +
        `topic=${headers.get('x-shopify-topic') ?? 'unknown'} ` +
        `bodyBytes=${Buffer.byteLength(body, 'utf8')} ` +
        `secretFp=${secretFingerprint(shopifySecret)} ` +
        `— compare that fingerprint against sha256 of the Partner Dashboard client secret.`,
    )
    return false
  }
  if (!crypto.timingSafeEqual(expected, received)) {
    console.error(
      `[shopify-webhook] REJECTED — HMAC mismatch. ` +
        `topic=${headers.get('x-shopify-topic') ?? 'unknown'} ` +
        `shop=${headers.get('x-shopify-shop-domain') ?? 'unknown'} ` +
        `bodyBytes=${Buffer.byteLength(body, 'utf8')} ` +
        `secretSource=${secretSource} ` +
        `secretFp=${secretFingerprint(shopifySecret)} ` +
        `— a valid Shopify delivery failing here means the configured secret is not ` +
        `the one Shopify signed with (wrong app, stale value, per-store secret ` +
        `mismatch, or Vercel SHOPIFY_API_KEY pointing at a different client_id than ` +
        `shopify.app.toml).`,
    )
    return false
  }
  return true
}

export async function verifyShopifyAccessToken(accessToken: string): Promise<{
  valid: boolean
  shop?: string
  userId?: string
}> {
  try {
    // Exchange token for shop domain
    const response = await shopifyFetch(`https://api.shopify.com/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET?.trim(),
        code: accessToken,
      }),
    })

    const data = await response.json()

    if (data.access_token) {
      return {
        valid: true,
        shop: data.shop,
        userId: data.associated_user?.id,
      }
    }

    return { valid: false }
  } catch (error) {
    console.error('Shopify token verification error:', error)
    return { valid: false }
  }
}

export async function createShopifyWebhook(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  topic: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const response = await fetchShopifyWithAuth(store, `https://${store.domain}/admin/api/2026-04/webhooks.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        webhook: {
          topic,
          address: webhookUrl,
          format: 'json',
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '(no body)')
      // Duplicate subscriptions (same topic + address) are expected on
      // reconnects — treat them as success so OAuth completes cleanly.
      if (response.status === 422 && errText.includes('already been taken')) {
        console.log(`Webhook ${topic} already registered — skipping`)
        return true
      }
      console.error(`Shopify webhook ${topic} registration failed: ${response.status} ${errText}`)
    }
    return response.ok
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) {
      console.log(`Store ${store.domain} needs Shopify reconnection — skipping webhook ${topic}`)
      return false
    }
    console.error('Failed to create Shopify webhook:', error)
    return false
  }
}

// Registers a webhook only if the same topic isn't already subscribed to the
// same address, and re-points stale subscriptions (old address) instead of
// creating duplicates. Makes setupShopifyWebhooks idempotent across reconnects.
export async function createShopifyWebhookIfMissing(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  topic: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const listRes = await fetchShopifyWithAuth(store, `https://${store.domain}/admin/api/2026-04/webhooks.json?topic=${encodeURIComponent(topic)}`, {
      signal: AbortSignal.timeout(10000),
    })

    if (listRes.ok) {
      const data = await listRes.json()
      const existing: { id: number; address: string }[] = data.webhooks || []

      const sameAddress = existing.find((w) => w.address === webhookUrl)
      if (sameAddress) return true

      const stale = existing.find((w) => w.address !== webhookUrl)
      if (stale) {
        const updateRes = await fetchShopifyWithAuth(store, `https://${store.domain}/admin/api/2026-04/webhooks/${stale.id}.json`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ webhook: { address: webhookUrl } }),
        })
        if (updateRes.ok) return true
        console.error(`Failed to re-point webhook ${topic} (${stale.id}): ${updateRes.status}`)
      }
    }
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) {
      console.log(`Store ${store.domain} needs Shopify reconnection — skipping webhook ${topic}`)
      return false
    }
    console.error(`Failed to list Shopify webhooks for ${topic}:`, error)
  }

  return createShopifyWebhook(store, topic, webhookUrl)
}

export async function setupShopifyWebhooks(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  baseUrl: string
): Promise<void> {
  const webhookUrl = `${baseUrl}/api/webhooks/shopify`

  const topics = [
    // Functional data flow
    'carts/update',
    'checkouts/create',
    'checkouts/update',
    'orders/create',
    // Revenue netting — Day 8-10: refunded/cancelled recoveries must be netted
    // out of recognized revenue (see src/lib/attribution.ts).
    'orders/cancelled',
    'refunds/create',
    // Recipient registry identity sync (never grants WhatsApp consent).
    'customers/create',
    'customers/update',
    // Uninstall lifecycle — lets the app purge the merchant's data when they
    // remove the app. This IS an Admin-API-registrable topic.
    'app/uninstalled',
    // NOTE: the three mandatory GDPR compliance topics (customers/data_request,
    // customers/redact, shop/redact) are intentionally NOT registered here.
    // Shopify rejects them on POST /admin/api/.../webhooks.json with a 404 —
    // they are declared in shopify.app.toml under `compliance_topics` and
    // registered by `shopify app deploy`. The webhook handler already accepts
    // them (see src/app/api/webhooks/shopify/route.ts); the old code that POSTed
    // them here only produced 404 noise on every reconnect.
    // Billing lifecycle — activates/cancels/expires the shop's app subscription
    // when the merchant approves, declines, or cancels from their Shopify admin.
    'app_subscriptions/update',
  ]

  for (const topic of topics) {
    await createShopifyWebhookIfMissing(store, topic, webhookUrl)
  }
}

export async function fetchShopifyCarts(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  limit: number = 50
): Promise<any[]> {
  try {
    const response = await fetchShopifyWithAuth(
      store,
      `https://${store.domain}/admin/api/2026-04/carts.json?limit=${limit}`,
      { signal: AbortSignal.timeout(10000) },
    )
    const data = await response.json()
    return data.carts || []
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) {
      console.log(`Store ${store.domain} needs Shopify reconnection — skipping cart fetch`)
      return []
    }
    console.error('Failed to fetch Shopify carts:', error)
    return []
  }
}

export async function fetchAbandonedCheckouts(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  limit: number = 50
): Promise<any[]> {
  // Shopify's abandoned-checkouts resource lives at `checkouts.json` (the list
  // is returned under the `checkouts` key). The old `abandoned_checkouts`
  // path/key never existed and produced a 404 on every cart-processing run.
  const response = await fetchShopifyWithAuth(
    store,
    `https://${store.domain}/admin/api/2026-04/checkouts.json?limit=${limit}`,
    { signal: AbortSignal.timeout(10000) },
  )
  const data = await response.json()
  return data.checkouts || []
}

export async function fetchShopifyProductPrice(
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null },
  shopifyProductId: string,
  variantId?: string | null,
): Promise<number | null> {
  const productId = shopifyProductId.replace(/^gid:\/\/shopify\/Product\//, '')
  const url = `https://${store.domain}/admin/api/2026-04/products/${productId}.json`

  let res: Response
  try {
    res = await fetchShopifyWithAuth(store, url, { signal: AbortSignal.timeout(5000) })
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) {
      return null
    }
    return null
  }

  if (!res.ok) return null
  const data = await res.json()
  const product = data.product
  if (!product?.variants?.length) return null

  if (variantId) {
    const variantIdNum = variantId.replace(/^gid:\/\/shopify\/ProductVariant\//, '')
    const variant = product.variants.find((v: any) => String(v.id) === variantIdNum)
    if (variant?.price) return parseFloat(variant.price)
    // A specific variant was requested but does not belong to this product.
    // Returning another variant's price (e.g. variants[0]) would quote the
    // wrong price and could weaken the negotiation floor — treat it as
    // unknown so callers fall back to their own verified/default price.
    return null
  }

  const price = product.variants[0].price
  return price != null ? parseFloat(price) : null
}

export interface ShopifyProductDetail {
  id: string
  title: string
  handle?: string | null
  vendor?: string | null
  product_type?: string | null
  tags?: string
  status?: string | null
  body_html?: string | null
  body_plain?: string | null
  image?: { src?: string | null } | null
  variants?: Array<{
    id: string
    title?: string | null
    price?: string | number | null
    compare_at_price?: string | number | null
    available?: boolean
    inventory_quantity?: number | null
    inventory_policy?: string | null
    option1?: string | null
    option2?: string | null
    option3?: string | null
  }>
}

// Fetch one product's full catalog record for the AI Salesperson product
// context. Mirrors fetchShopifyProductPrice's auth + REST shape but returns the
// whole normalized record (description, variants, tags, availability) instead
// of just the price. `available` is derived from the REST inventory fields:
// explicit only when Shopify tells us the quantity, and never assumed true.
export async function fetchShopifyProductDetail(
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null },
  shopifyProductId: string,
): Promise<ShopifyProductDetail | null> {
  const productId = shopifyProductId.replace(/^gid:\/\/shopify\/Product\//, '')
  const url = `https://${store.domain}/admin/api/2026-04/products/${productId}.json`

  let res: Response
  try {
    res = await fetchShopifyWithAuth(store, url, { signal: AbortSignal.timeout(5000) })
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) {
      return null
    }
    return null
  }

  try {
    if (!res.ok) return null
    const data = await res.json()
    const product = data.product
    if (!product) return null

    const rawVariants = Array.isArray(product.variants) ? product.variants : []
    const priceTag = rawVariants.find((v: any) => v?.price != null)?.price
    const plainPrice = priceTag != null ? parseFloat(String(priceTag)) : null

    const variants = rawVariants.map((v: any) => {
      const quantity: number | null = v?.inventory_quantity != null ? Number(v.inventory_quantity) : null
      const policy = v?.inventory_policy ?? null
      const available =
        quantity != null
          ? policy === 'continue'
            ? true
            : quantity > 0
          : null
      return {
        id: String(v.id),
        title: v?.title ?? 'Default',
        price: v?.price ?? priceTag ?? null,
        compare_at_price: v?.compare_at_price ?? null,
        available: available === true,
        inventory_quantity: v?.inventory_quantity ?? null,
        inventory_policy: policy,
        option1: v?.option1 ?? null,
        option2: v?.option2 ?? null,
        option3: v?.option3 ?? null,
      }
    })

    return {
      id: String(product.id),
      title: product.title ?? '',
      handle: product.handle ?? null,
      vendor: product.vendor ?? null,
      product_type: product.product_type ?? null,
      tags: product.tags ?? '',
      status: product.status ?? null,
      body_html: product.body_html ?? null,
      body_plain: stripHtmlBody(product.body_html ?? null),
      image: product.image?.src ? { src: product.image.src } : null,
      variants,
    }
  } catch {
    return null
  }
}

function stripHtmlBody(html: string | null): string | null {
  if (!html) return null
  return html
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// List Shopify products (catalog picker) using the Admin REST API. Returns raw
// product objects (id, title, handle, status, variants incl. prices, image).
export async function fetchShopifyProducts(
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null },
  opts: { limit?: number; pageInfo?: string | null; query?: string | null } = {},
): Promise<{ products: any[]; nextCursor: string | null; prevCursor: string | null; error: string | null }> {
  const accessToken = await getAccessToken(store)
  if (!accessToken) {
    return { products: [], nextCursor: null, prevCursor: null, error: 'Could not reach Shopify. Reconnect the store from Integrations.' }
  }

  const limit = Math.min(opts.limit ?? 25, 250)
  const params = new URLSearchParams({ limit: String(limit) })
  if (opts.pageInfo) params.set('page_info', opts.pageInfo)
  if (opts.query) params.set('query', opts.query)

  const url = `https://${store.domain}/admin/api/2026-04/products.json?${params.toString()}`
  try {
    const res = await shopifyFetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 401) {
      return { products: [], nextCursor: null, prevCursor: null, error: 'Store token unauthorized. Reconnect the store from Integrations.' }
    }
    if (!res.ok) {
      return { products: [], nextCursor: null, prevCursor: null, error: `Shopify returned HTTP ${res.status}` }
    }
    const data = await res.json()
    const products = data.products || []
    let nextCursor: string | null = null
    let prevCursor: string | null = null
    const linkHeader = res.headers.get('link')
    if (linkHeader) {
      for (const part of linkHeader.split(',')) {
        const match = part.trim().match(/<[^>]*page_info=([^&>]*)>;\s*rel="(\w+)"/)
        if (match) {
          const cursor = match[1]
          const rel = match[2]
          try { const dec = decodeURIComponent(cursor); if (rel === 'next') nextCursor = dec; else if (rel === 'previous') prevCursor = dec } catch { /* ignore */ }
        }
      }
    }
    return { products, nextCursor, prevCursor, error: null }
  } catch (err: any) {
    return { products: [], nextCursor: null, prevCursor: null, error: err?.name === 'TimeoutError' ? 'Shopify took too long to respond. Try again.' : 'Could not list products from Shopify.' }
  }
}

export async function syncAbandonedCheckouts(store: any): Promise<number> {
  let accessToken: string | null
  try {
    accessToken = await getAccessToken(store)
  } catch {
    accessToken = null
  }
  if (!accessToken) {
    if (store.apiKey) {
      // Shopify is connected but the token is a legacy non-expiring token that
      // Shopify no longer accepts, or it is otherwise invalid. Deactivate the
      // store so the sweep stops retrying and the merchant is prompted to
      // reconnect from Integrations (which now issues an expiring offline
      // token).
      console.log(`🔌 Deactivating ${store.domain}: Shopify token is missing or deprecated — reconnect from Integrations.`)
      try {
        const prisma = (await import('@/lib/db')).default
        await prisma.store.update({
          where: { id: store.id },
          data: { isActive: false },
        }).catch(() => {})
      } catch {}
    } else {
      console.log(`No valid token for store ${store.domain} — skipping checkout sync`)
    }
    return 0
  }

  let checkouts: any[]
  try {
    checkouts = await fetchAbandonedCheckouts(store, 50)
  } catch (error) {
    if (error instanceof ShopifyReconnectRequiredError) {
      console.log(`🔌 ${store.domain}: ${error.message}`)
      try {
        const prisma = (await import('@/lib/db')).default
        await prisma.store.update({
          where: { id: store.id },
          data: { isActive: false },
        }).catch(() => {})
      } catch {}
      return 0
    }
    console.error(`Failed to fetch abandoned checkouts for ${store.domain}:`, error)
    return 0
  }

  if (checkouts.length === 0) {
    console.log(`No abandoned checkouts found for ${store.domain} in last 24h`)
    return 0
  }

  console.log(`Found ${checkouts.length} abandoned checkouts for ${store.domain}`)

  const prisma = (await import('@/lib/db')).default
  let synced = 0

  for (const checkout of checkouts) {
    const token = checkout.token || checkout.cart_token
    if (!token || !checkout.id) continue

    const lineItems = normalizeShopifyLineItems(checkout.line_items)

    const phone = checkout.phone || checkout.billing_address?.phone || checkout.shipping_address?.phone || checkout.customer?.phone || null
    const firstName = checkout.billing_address?.first_name || checkout.shipping_address?.first_name || checkout.customer?.first_name || ''
    const lastName = checkout.billing_address?.last_name || checkout.shipping_address?.last_name || checkout.customer?.last_name || ''
    const name = `${firstName} ${lastName}`.trim() || checkout.customer?.name || null
    const email = checkout.email || checkout.customer?.email || null

    try {
      await prisma.cart.upsert({
        where: { storeId_cartId: { storeId: store.id, cartId: token } },
        update: {
          items: lineItems,
          totalValue: checkout.total_price ? parseFloat(checkout.total_price) : 0,
          ...(email ? { customerEmail: email } : {}),
          ...(phone ? { customerPhone: phone } : {}),
          ...(name ? { customerName: name } : {}),
          abandonedAt: checkout.created_at ? new Date(checkout.created_at) : new Date(),
          currency: checkout.currency || 'USD',
        },
        create: {
          storeId: store.id,
          cartId: token,
          customerId: checkout.customer?.id ? String(checkout.customer.id) : undefined,
          items: lineItems,
          totalValue: checkout.total_price ? parseFloat(checkout.total_price) : 0,
          customerEmail: email,
          customerPhone: phone,
          customerName: name,
          currency: checkout.currency || 'USD',
          abandonedAt: checkout.created_at ? new Date(checkout.created_at) : new Date(),
        },
      })

      // The REST sync is often the FIRST place a contact is seen (webhooks can
      // be missed while the app is down). Register them here too; consent stays
      // false until an explicit opt-in arrives.
      const { ensureRecipientForCart } = await import('@/lib/recovery/recipients')
      await ensureRecipientForCart(store.id, {
        customerId: checkout.customer?.id ? String(checkout.customer.id) : null,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        updatedAt: new Date(),
      }).catch((err: any) => {
        console.error(`Recipient registry sync failed for checkout ${token}:`, err?.message || err)
      })
      synced++
    } catch (err) {
      console.error(`Failed to sync checkout ${token}:`, err)
    }
  }

  return synced
}
