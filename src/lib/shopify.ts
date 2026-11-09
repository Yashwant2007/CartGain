import crypto from 'crypto'
import { cleanCustomerName } from './names'
import { normalizeImageUrl, normalizeShopifyLineItems, toNumericId } from './shopify-line-items'

const REFRESH_MARGIN_MS = 5 * 60 * 1000 // refresh 5 min before expiry
export const SHOPIFY_API_VERSION = '2026-04'

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

export function cleanShopifyName(value: unknown): string | null {
  return cleanCustomerName(value)
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
  if (!store.shopifyRefreshToken) return null

  // Token still valid — unless the caller forced a refresh (e.g. after a
  // 401/403 that suggests Shopify rejected it even before the expiry margin).
  if (!forceRefresh && store.shopifyTokenExpiresAt && Date.now() < store.shopifyTokenExpiresAt.getTime() - REFRESH_MARGIN_MS) {
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

/**
 * Execute an Admin GraphQL operation with the store's refreshed offline token.
 * Shopify requires all new public apps to use the GraphQL Admin API; this is
 * the single entry point for app data (products, customers, checkouts, shop).
 */
export async function shopifyGraphQL<T>(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
  query: string,
  variables: Record<string, unknown> = {},
  timeoutMs = 10000,
): Promise<T> {
  const res = await fetchShopifyWithAuth(
    store,
    `https://${store.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  )

  if (!res.ok) {
    throw new Error(`Shopify GraphQL returned HTTP ${res.status}`)
  }

  const payload = await res.json().catch(() => null) as
    | { data?: T; errors?: Array<{ message?: string }> }
    | null
  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Shopify GraphQL error')
  }
  if (!payload?.data) {
    throw new Error('Shopify GraphQL returned no data')
  }
  return payload.data
}

export interface ShopifyShopInfo {
  name: string
  email: string | null
  ownerName: string | null
  currencyCode: string | null
  ianaTimezone: string | null
}

/** Read the shop identity through GraphQL (used by OAuth provisioning/health). */
export async function fetchShopifyShopInfo(
  store: {
    id: string
    domain: string
    apiKey: string | null
    shopifyRefreshToken: string | null
    shopifyTokenExpiresAt: Date | null
  },
): Promise<ShopifyShopInfo | null> {
  try {
    const data = await shopifyGraphQL<{
      shop?: {
        name?: string | null
        email?: string | null
        shopOwnerName?: string | null
        currencyCode?: string | null
        ianaTimezone?: string | null
      } | null
    }>(store, `#graphql
      query ShopInfo {
        shop {
          name
          email
          shopOwnerName
          currencyCode
          ianaTimezone
        }
      }
    `)
    const shop = data.shop
    if (!shop) return null
    return {
      name: shop.name || store.domain,
      email: shop.email || null,
      ownerName: shop.shopOwnerName || null,
      currencyCode: shop.currencyCode || null,
      ianaTimezone: shop.ianaTimezone || null,
    }
  } catch {
    return null
  }
}

/**
 * Extract the checkout/cart token from Shopify's recovery URL. GraphQL exposes
 * `abandonedCheckoutUrl` instead of the REST `token` field; recovery URLs look
 * like `.../checkouts/<token>/recover?...`.
 */
export function extractShopifyCheckoutToken(recoveryUrl: string | null | undefined): string | null {
  if (!recoveryUrl) return null
  try {
    const url = new URL(recoveryUrl)
    const explicit = url.searchParams.get('token')
    if (explicit) return explicit
    const segments = url.pathname.split('/').filter(Boolean)
    const recoverIndex = segments.indexOf('recover')
    if (recoverIndex > 0) return segments[recoverIndex - 1] || null
    return segments[segments.length - 1] || null
  } catch {
    return null
  }
}

function addressFromGraphQL(address: any): any | null {
  if (!address) return null
  const firstName = address.firstName ?? null
  const lastName = address.lastName ?? null
  return {
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || null,
    phone: address.phone ?? null,
  }
}

/** List open abandoned checkouts through the GraphQL Admin API. */
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
  const data = await shopifyGraphQL<{
    abandonedCheckouts?: {
      nodes?: Array<{
        id: string
        abandonedCheckoutUrl: string
        completedAt?: string | null
        createdAt: string
        totalPriceSet?: { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null
        customer?: {
          id: string
          email?: string | null
          phone?: string | null
          firstName?: string | null
          lastName?: string | null
          displayName?: string | null
          defaultAddress?: any | null
        } | null
        billingAddress?: any | null
        shippingAddress?: any | null
        lineItems?: {
          nodes?: Array<{
            title?: string | null
            quantity?: number | null
            sku?: string | null
            image?: { url?: string | null } | null
            originalUnitPriceSet?: { shopMoney?: { amount?: string | null } | null } | null
            product?: { id?: string | null; featuredImage?: { url?: string | null } | null } | null
            variant?: { id?: string | null; title?: string | null } | null
          }>
        } | null
      }>
    } | null
  }>(
    store,
    `#graphql
      query AbandonedCheckouts($first: Int!) {
        abandonedCheckouts(first: $first, reverse: true) {
          nodes {
            id
            abandonedCheckoutUrl
            completedAt
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            customer {
              id
              email
              phone
              firstName
              lastName
              displayName
              defaultAddress { firstName lastName phone }
            }
            billingAddress { firstName lastName phone }
            shippingAddress { firstName lastName phone }
            lineItems(first: 50) {
              nodes {
                title
                quantity
                sku
                image { url }
                originalUnitPriceSet { shopMoney { amount } }
                product { id featuredImage { url } }
                variant { id title }
              }
            }
          }
        }
      }
    `,
    { first: Math.min(Math.max(limit, 1), 250) },
    10000,
  )

  return (data.abandonedCheckouts?.nodes || [])
    .filter((node) => !node.completedAt)
    .map((node) => {
      const token = extractShopifyCheckoutToken(node.abandonedCheckoutUrl)
      if (!token) return null
      const customer = node.customer
      const shopMoney = node.totalPriceSet?.shopMoney
      return {
        id: toNumericId(node.id) ?? node.id,
        token,
        cart_token: token,
        created_at: node.createdAt,
        total_price: shopMoney?.amount ?? null,
        currency: shopMoney?.currencyCode ?? null,
        email: customer?.email ?? null,
        phone: customer?.phone ?? null,
        customer: customer
          ? {
              id: toNumericId(customer.id) ?? customer.id,
              email: customer.email ?? null,
              phone: customer.phone ?? null,
              first_name: customer.firstName ?? null,
              last_name: customer.lastName ?? null,
              name: customer.displayName ?? null,
              default_address: addressFromGraphQL(customer.defaultAddress),
            }
          : null,
        billing_address: addressFromGraphQL(node.billingAddress),
        shipping_address: addressFromGraphQL(node.shippingAddress),
        line_items: (node.lineItems?.nodes || []).map((item) => ({
          title: item.title,
          quantity: item.quantity,
          sku: item.sku,
          price: item.originalUnitPriceSet?.shopMoney?.amount ?? null,
          image_url: normalizeImageUrl(item.image) || normalizeImageUrl(item.product?.featuredImage),
          product_id: toNumericId(item.product?.id),
          variant_id: toNumericId(item.variant?.id),
          variant_title: item.variant?.title ?? null,
        })),
      }
    })
    .filter((checkout): checkout is NonNullable<typeof checkout> => checkout != null)
}

type CustomerNameStore = {
  id: string
  domain: string
  apiKey: string | null
  shopifyRefreshToken: string | null
  shopifyTokenExpiresAt: Date | null
}

export type ShopifyCustomerContact = {
  name: string | null
  email: string | null
  phone: string | null
}

type ShopifyMailingAddress = {
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}

type ShopifyCustomerOrder = {
  email?: string | null
  phone?: string | null
  billingAddress?: ShopifyMailingAddress | null
  shippingAddress?: ShopifyMailingAddress | null
}

type ShopifyCustomerNode = {
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  email?: string | null
  phone?: string | null
  defaultAddress?: ShopifyMailingAddress | null
  addresses?: ShopifyMailingAddress[] | null
  orders?: { nodes?: ShopifyCustomerOrder[] | null } | null
}

function fullName(parts: Array<string | null | undefined>): string | null {
  const value = parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  return value || null
}

/**
 * Pick the best contact fields from a Shopify customer, their saved addresses,
 * and recent orders. Customer accounts created by checkout often have only an
 * email; a past order or saved address can still carry the real name/phone.
 */
export function contactFromShopifyCustomer(
  customer: ShopifyCustomerNode,
  fallbackEmail?: string | null,
): ShopifyCustomerContact {
  const addressEmail = fallbackEmail || null
  const email = customer.email || addressEmail || null
  const addresses = customer.addresses || []
  const orders = customer.orders?.nodes || []
  const orderWithPhone = orders.find(
    (order) => order.shippingAddress?.phone || order.billingAddress?.phone || order.phone,
  )
  const addressWithPhone = addresses.find((entry) => entry.phone)

  const nameCandidates = [
    fullName([customer.firstName, customer.lastName]),
    fullName([
      orderWithPhone?.shippingAddress?.firstName,
      orderWithPhone?.shippingAddress?.lastName,
    ]),
    fullName([
      orderWithPhone?.billingAddress?.firstName,
      orderWithPhone?.billingAddress?.lastName,
    ]),
    ...addresses.map((entry) => fullName([entry.firstName, entry.lastName])),
    customer.displayName,
  ]
  const name = nameCandidates
    .map((candidate) => cleanCustomerName(candidate, email))
    .find((candidate): candidate is string => Boolean(candidate)) || null

  const phone =
    customer.phone ||
    customer.defaultAddress?.phone ||
    addressWithPhone?.phone ||
    orderWithPhone?.shippingAddress?.phone ||
    orderWithPhone?.billingAddress?.phone ||
    orderWithPhone?.phone ||
    null

  return { name, email, phone }
}

const customerContactCache = new Map<
  string,
  { contact: ShopifyCustomerContact | null; expiresAt: number }
>()
const CUSTOMER_CONTACT_CACHE_MS = 10 * 60 * 1000

/**
 * Resolve the customer's authoritative name, email and phone from Shopify.
 *
 * A signed-in customer already has these on their Shopify profile, but cart and
 * checkout payloads frequently omit the phone (and sometimes the name). Looking
 * the contact up by email (or customer id) lets recovery message them without
 * waiting for them to type anything into our widget or the checkout form.
 * Best-effort: any Shopify failure returns null.
 */
export async function findShopifyCustomerContact(
  store: CustomerNameStore,
  opts: { email?: string | null; customerId?: string | null },
): Promise<ShopifyCustomerContact | null> {
  const address = String(opts.email || '').trim().toLowerCase()
  const customerId = toNumericId(opts.customerId)
  if (!address && !customerId) return null

  const key = `${store.id}:${address || `id:${customerId}`}`
  const cached = customerContactCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.contact

  let contact: ShopifyCustomerContact | null = null
  try {
    const query = address ? `email:${address}` : `id:${customerId}`
    const data = await shopifyGraphQL<{
      customers?: { nodes?: ShopifyCustomerNode[] | null } | null
    }>(
      store,
      `#graphql
        query CustomerContact($query: String!) {
          customers(first: 1, query: $query) {
            nodes {
              firstName
              lastName
              displayName
              email
              phone
              defaultAddress { firstName lastName phone }
              addresses(first: 10) { firstName lastName phone }
              orders(first: 5, reverse: true) {
                nodes {
                  email
                  phone
                  billingAddress { firstName lastName phone }
                  shippingAddress { firstName lastName phone }
                }
              }
            }
          }
        }
      `,
      { query },
      5000,
    )
    const customer = data.customers?.nodes?.[0]
    if (customer) contact = contactFromShopifyCustomer(customer, address || null)
  } catch {
    contact = null
  }

  customerContactCache.set(key, {
    contact,
    expiresAt: Date.now() + CUSTOMER_CONTACT_CACHE_MS,
  })
  if (customerContactCache.size > 500) {
    const oldest = customerContactCache.keys().next().value
    if (oldest) customerContactCache.delete(oldest)
  }
  return contact
}

/** Backwards-compatible name-only lookup. */
export async function findShopifyCustomerNameByEmail(
  store: CustomerNameStore,
  email: string | null | undefined,
): Promise<string | null> {
  const contact = await findShopifyCustomerContact(store, { email })
  return contact?.name ?? null
}

export async function fetchShopifyProductPrice(
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null },
  shopifyProductId: string,
  variantId?: string | null,
): Promise<number | null> {
  const productId = toNumericId(shopifyProductId)
  if (!productId) return null

  try {
    const data = await shopifyGraphQL<{
      product?: {
        variants?: {
          nodes?: Array<{ id: string; price?: string | null }>
        } | null
      } | null
    }>(
      store,
      `#graphql
        query ProductPrice($id: ID!) {
          product(id: $id) {
            variants(first: 250) {
              nodes { id price }
            }
          }
        }
      `,
      { id: `gid://shopify/Product/${productId}` },
      5000,
    )

    const variants = data.product?.variants?.nodes || []
    if (!variants.length) return null

    if (variantId) {
      const variantIdNum = toNumericId(variantId)
      const variant = variants.find((v) => toNumericId(v.id) === variantIdNum)
      if (variant?.price) return parseFloat(variant.price)
      // A specific variant was requested but does not belong to this product.
      // Returning another variant's price (e.g. variants[0]) would quote the
      // wrong price and could weaken the negotiation floor — treat it as
      // unknown so callers fall back to their own verified/default price.
      return null
    }

    return variants[0].price != null ? parseFloat(variants[0].price) : null
  } catch {
    // Missing/expired token or a transient Shopify failure — callers fall back
    // to their own verified/default price rather than quoting something wrong.
    return null
  }
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

function graphQLVariant(variant: any, fallbackPrice?: string | null) {
  const options = Array.isArray(variant?.selectedOptions) ? variant.selectedOptions : []
  return {
    id: toNumericId(variant?.id) ?? String(variant?.id ?? ''),
    title: variant?.title ?? 'Default',
    price: variant?.price ?? fallbackPrice ?? null,
    compare_at_price: variant?.compareAtPrice ?? null,
    available: variant?.availableForSale === true,
    inventory_quantity: variant?.inventoryQuantity ?? null,
    inventory_policy:
      typeof variant?.inventoryPolicy === 'string' ? variant.inventoryPolicy.toLowerCase() : null,
    option1: options[0]?.value ?? null,
    option2: options[1]?.value ?? null,
    option3: options[2]?.value ?? null,
  }
}

function graphQLProduct(product: any): ShopifyProductDetail {
  const imageUrl = normalizeImageUrl(product?.featuredImage) || null
  const images = Array.isArray(product?.images?.nodes)
    ? product.images.nodes
        .map((image: unknown) => normalizeImageUrl(image))
        .filter((url: string | undefined): url is string => Boolean(url))
    : []
  const rawVariants = Array.isArray(product?.variants?.nodes) ? product.variants.nodes : []
  const priceTag = rawVariants.find((variant: any) => variant?.price != null)?.price ?? null

  return {
    id: toNumericId(product?.id) ?? String(product?.id ?? ''),
    title: product?.title ?? '',
    handle: product?.handle ?? null,
    vendor: product?.vendor ?? null,
    product_type: product?.productType ?? null,
    tags: Array.isArray(product?.tags) ? product.tags.join(', ') : String(product?.tags ?? ''),
    status: typeof product?.status === 'string' ? product.status.toLowerCase() : null,
    body_html: product?.descriptionHtml ?? null,
    body_plain: stripHtmlBody(product?.descriptionHtml ?? null),
    image: imageUrl ? { src: imageUrl } : null,
    variants: rawVariants.map((variant: any) => graphQLVariant(variant, priceTag)),
  }
}

// Fetch one product's full catalog record for the AI Salesperson product
// context. GraphQL returns the same normalized record (description, variants,
// tags, availability) as the old REST path. `available` comes from Shopify's
// `availableForSale`, and inventory is only reported when Shopify returns it.
export async function fetchShopifyProductDetail(
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null },
  shopifyProductId: string,
): Promise<ShopifyProductDetail | null> {
  const productId = toNumericId(shopifyProductId)
  if (!productId) return null

  try {
    const data = await shopifyGraphQL<{
      product?: any | null
    }>(
      store,
      `#graphql
        query ProductDetail($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            vendor
            productType
            tags
            status
            descriptionHtml
            featuredImage { url }
            images(first: 10) { nodes { url } }
            variants(first: 250) {
              nodes {
                id
                title
                price
                compareAtPrice
                availableForSale
                inventoryQuantity
                inventoryPolicy
                selectedOptions { name value }
              }
            }
          }
        }
      `,
      { id: `gid://shopify/Product/${productId}` },
      5000,
    )

    return data.product ? graphQLProduct(data.product) : null
  } catch {
    // Same contract as fetchShopifyProductPrice: an unreachable/reconnect-
    // required store yields "unknown", never a guessed product record.
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

// List Shopify products (catalog picker) through the GraphQL Admin API. Returns
// REST-shaped product objects (id, title, handle, status, variants incl. prices,
// image) so existing dashboard/demo/recommendation code keeps its contract.
export async function fetchShopifyProducts(
  store: { id: string; domain: string; apiKey: string | null; shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null },
  opts: { limit?: number; pageInfo?: string | null; query?: string | null } = {},
): Promise<{ products: any[]; nextCursor: string | null; prevCursor: string | null; error: string | null }> {
  const limit = Math.min(opts.limit ?? 25, 250)
  const cursor = opts.pageInfo?.trim() || null
  const isPrevious = cursor?.startsWith('prev:') ?? false
  const isNext = cursor?.startsWith('next:') ?? false
  const after = isNext ? cursor!.slice('next:'.length) : !isPrevious ? cursor : null
  const before = isPrevious ? cursor!.slice('prev:'.length) : null

  try {
    const data = await shopifyGraphQL<{
      products?: {
        nodes?: any[]
        pageInfo?: {
          hasNextPage?: boolean
          hasPreviousPage?: boolean
          startCursor?: string | null
          endCursor?: string | null
        } | null
      } | null
    }>(
      store,
      `#graphql
        query Products($first: Int, $last: Int, $after: String, $before: String, $query: String) {
          products(first: $first, last: $last, after: $after, before: $before, query: $query) {
            nodes {
              id
              title
              handle
              vendor
              productType
              tags
              status
              featuredImage { url }
              images(first: 10) { nodes { url } }
              variants(first: 250) {
                nodes {
                  id
                  title
                  price
                  compareAtPrice
                  availableForSale
                  inventoryQuantity
                  inventoryPolicy
                  selectedOptions { name value }
                }
              }
            }
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
          }
        }
      `,
      {
        first: isPrevious ? null : limit,
        last: isPrevious ? limit : null,
        after,
        before,
        query: opts.query || null,
      },
      10000,
    )

    const page = data.products
    const products = (page?.nodes || []).map(graphQLProduct)
    const info = page?.pageInfo
    return {
      products,
      nextCursor: info?.hasNextPage && info.endCursor ? `next:${info.endCursor}` : null,
      prevCursor: info?.hasPreviousPage && info.startCursor ? `prev:${info.startCursor}` : null,
      error: null,
    }
  } catch (err: any) {
    if (err instanceof ShopifyReconnectRequiredError) {
      return { products: [], nextCursor: null, prevCursor: null, error: 'Reconnect the store from Integrations to list products.' }
    }
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
    if (store.apiKey && !store.shopifyRefreshToken) {
      // Shopify is connected but the token is a legacy non-expiring token that
      // Shopify no longer accepts. Deactivate the store so the sweep stops
      // retrying and the merchant is prompted to reconnect from Integrations
      // (which now issues an expiring offline token).
      console.log(`🔌 Deactivating ${store.domain}: legacy Shopify token — reconnect from Integrations.`)
      try {
        const prisma = (await import('@/lib/db')).default
        await prisma.store.update({
          where: { id: store.id },
          data: { isActive: false },
        }).catch(() => {})
      } catch {}
    } else {
      // No token, or a refreshable token whose refresh failed transiently
      // (network/5xx). Do NOT deactivate a healthy store on a transient blip;
      // just skip this sweep and let the next one retry.
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

    const checkoutPhone = checkout.phone || checkout.billing_address?.phone || checkout.shipping_address?.phone || checkout.customer?.phone || null
    const firstName =
      checkout.billing_address?.first_name ||
      checkout.shipping_address?.first_name ||
      checkout.customer?.first_name ||
      checkout.customer?.default_address?.first_name ||
      ''
    const lastName =
      checkout.billing_address?.last_name ||
      checkout.shipping_address?.last_name ||
      checkout.customer?.last_name ||
      checkout.customer?.default_address?.last_name ||
      ''
    const checkoutEmail = checkout.email || checkout.customer?.email || null
    const checkoutName = cleanShopifyName(
      `${firstName} ${lastName}`.trim() ||
        checkout.billing_address?.name ||
        checkout.shipping_address?.name ||
        checkout.customer?.name ||
        checkout.customer?.default_address?.name ||
        null,
    )
    // A signed-in customer already has a phone on their Shopify profile even
    // when the checkout payload does not include it. Resolve once and use the
    // authoritative contact for the cart + recipient registry.
    const contact =
      !checkoutPhone || !checkoutName
        ? await findShopifyCustomerContact(store, {
            email: checkoutEmail,
            customerId: checkout.customer?.id ? String(checkout.customer.id) : null,
          })
        : null
    const phone = checkoutPhone || contact?.phone || null
    const email = checkoutEmail || contact?.email || null
    const name = checkoutName || contact?.name || null

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
      const identity = await ensureRecipientForCart(store.id, {
        customerId: checkout.customer?.id ? String(checkout.customer.id) : null,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        updatedAt: new Date(),
      }).catch((err: any) => {
        console.error(`Recipient registry sync failed for checkout ${token}:`, err?.message || err)
        return null
      })
      // The identity may already know the customer's name/phone from a
      // customer webhook or a storefront opt-in even when this checkout payload
      // omitted them.
      const identityPatch: { customerName?: string; customerPhone?: string } = {}
      if (!name && identity?.name) identityPatch.customerName = identity.name
      if (!phone && identity?.phone) identityPatch.customerPhone = identity.phone
      if (Object.keys(identityPatch).length > 0) {
        await prisma.cart
          .update({
            where: { storeId_cartId: { storeId: store.id, cartId: token } },
            data: identityPatch,
          })
          .catch(() => {})
      }
      synced++
    } catch (err) {
      console.error(`Failed to sync checkout ${token}:`, err)
    }
  }

  return synced
}
