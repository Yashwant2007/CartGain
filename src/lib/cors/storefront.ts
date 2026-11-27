const DEFAULT_STOREFRONT_ORIGINS = new Set([
  'https://cart-gain.com',
  'https://www.cart-gain.com',
])

function configuredStorefrontOrigins(): Set<string> {
  const origins = new Set(DEFAULT_STOREFRONT_ORIGINS)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin)
    } catch {
      // ignore invalid configured origin
    }
  }
  return origins
}

export function allowedStorefrontOrigin(origin: string | null): string | null {
  if (!origin) return null
  try {
    const url = new URL(origin)
    const host = url.hostname.toLowerCase()
    const configured = configuredStorefrontOrigins()
    if (url.protocol === 'https:' && configured.has(url.origin)) return origin
    if (url.protocol === 'https:' && (host === 'myshopify.com' || host.endsWith('.myshopify.com'))) return origin
    if (
      url.protocol === 'http:' &&
      process.env.NODE_ENV !== 'production' &&
      (host === 'localhost' || host === '127.0.0.1')
    ) {
      return origin
    }
    return null
  } catch {
    return null
  }
}

export function storefrontCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedStorefrontOrigin(origin)
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': allowed, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}
