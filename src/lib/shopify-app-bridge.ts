/**
 * Shopify App Bridge (Next) — server-side helpers.
 *
 * The App Bridge runtime is served from Shopify's CDN and MUST be loaded as a
 * plain, blocking <script> in the document head, together with a
 * `shopify-api-key` meta tag:
 *
 *   <meta name="shopify-api-key" content="<client id>" />
 *   <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
 *
 * Two hard constraints make where we render it a real decision:
 *
 *  1. The CDN bundle self-validates `document.currentScript` and ABORTS when
 *     the tag is `async`, `defer` or `type="module"` — the script then never
 *     initialises and `window.shopify` never exists.
 *  2. The bundle needs `apiKey` + `shop` in its configuration. It throws
 *     "missing required configuration fields" without them, and when it does
 *     initialise outside the admin iframe it redirects the visitor to the
 *     Shopify admin. Loading it on the public marketing site would therefore
 *     break the site (and its fetch interception).
 *
 * So the script is rendered only for requests that come from the Shopify
 * admin iframe, where the URL carries `?shop=` / `?host=`.
 */

// The canonical CDN URL. Shopify's scanner looks for exactly this script.
export const APP_BRIDGE_CDN_SRC = 'https://cdn.shopify.com/shopifycloud/app-bridge.js'

// Request header set by the middleware for embedded (admin iframe) requests.
export const SHOPIFY_EMBED_HEADER = 'x-shopify-embed'
export const SHOPIFY_EMBED_SHOP_HEADER = 'x-shopify-shop'
export const SHOPIFY_EMBED_HOST_HEADER = 'x-shopify-host'

// A Shopify shop domain: <store>.myshopify.com
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

export function isValidShopDomain(domain: string | null | undefined): domain is string {
  return typeof domain === 'string' && SHOP_DOMAIN_RE.test(domain)
}

/**
 * The `host` parameter Shopify appends to the app URL. It is a base64 encoded
 * admin host (e.g. "MS4yMjMuMjU0LjU4" -> "3.23.254.58") and App Bridge
 * decodes it to learn which admin origin it is talking to.
 */
export function isValidShopifyHost(host: string | null | undefined): host is string {
  if (typeof host !== 'string' || !host) return false
  if (!/^[A-Za-z0-9+/=_-]+$/.test(host)) return false
  try {
    const decoded = Buffer.from(
      host.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')
    return decoded.length > 0
  } catch {
    return false
  }
}

/**
 * The embed context of the current request: which shop and which admin host
 * the page is running for. The App Bridge bundle reads these from the URL,
 * but the URL loses them on client-side navigations and on some redirects —
 * so we also hand them to the bundle as `shopify-shop` / `shopify-host` meta
 * tags, which it merges into its configuration.
 */
export function getShopifyEmbedContext(
  headers: Pick<Headers, 'get'> | null | undefined
): { shop?: string; host?: string } {
  if (!headers) return {}
  const shop = headers.get(SHOPIFY_EMBED_SHOP_HEADER) || undefined
  const host = headers.get(SHOPIFY_EMBED_HOST_HEADER) || undefined
  return {
    shop: isValidShopDomain(shop) ? shop : undefined,
    host: isValidShopifyHost(host) ? host : undefined,
  }
}

/**
 * True when the request was made from inside the Shopify admin iframe.
 *
 * The middleware decides this from the URL (`?shop=`), never from a
 * client-supplied header, and forwards the answer to the React tree through a
 * request header. Reading it back in the root layout is what lets us render
 * the App Bridge tag in the head without loading it on the public site.
 */
export function isShopifyEmbedRequest(headers: Pick<Headers, 'get'> | null | undefined): boolean {
  if (!headers) return false
  return headers.get(SHOPIFY_EMBED_HEADER) === '1'
}

/**
 * The public client id of the Shopify app. It is not a secret — it ships in
 * the app's HTML and in shopify.app.toml — but it must match the app that is
 * actually running in the admin, otherwise App Bridge mints tokens for a
 * different app and the embedded session can never be verified.
 */
export function getShopifyApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY
  return key ? key.trim() : undefined
}
