// Canonical CartGain base URL, used to build Shopify OAuth redirect_uris and
// cross-app links.
//
// Order of preference:
//   1. NEXT_PUBLIC_APP_URL, when it is a real HTTPS URL (any non-dev value).
//      In production a localhost/http value is ignored on purpose: Shopify
//      rejects OAuth redirect_uris that are not whitelisted, and a stray
//      "http://localhost:3000" here is the classic cause of
//      "redirect_uri is not whitelisted".
//   2. The request's own origin — what the merchant actually loaded.
//   3. The production origin.
export function getAppBaseUrl(req?: { url?: string }): string {
  const isProd = process.env.NODE_ENV === 'production'
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envUrl) {
    const usable = isProd ? /^https:\/\//.test(envUrl) : true
    if (usable) return envUrl.replace(/\/+$/, '')
  }

  if (req?.url) {
    try {
      const origin = new URL(req.url).origin
      if (isProd ? origin.startsWith('https://') : true) return origin
    } catch {
      // fall through to the default
    }
  }

  return 'https://cart-gain.com'
}