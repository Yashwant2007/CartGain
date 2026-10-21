'use client'

async function getShopifyIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const w = window as any

  // Try cached first
  if (typeof w.__shopifySessionTokenCached === 'string' && w.__shopifySessionTokenCached) {
    return w.__shopifySessionTokenCached
  }

  // Try to initialize app bridge ourselves if possible
  try {
    const { getShopifyEmbedParams } = await import('./shopify-embed')
    const { host } = getShopifyEmbedParams()
    if (host) {
      try {
        const createAppModule: any = await import('@shopify/app-bridge')
        const createApp = createAppModule?.default || createAppModule?.createApp
        if (createApp) {
          const apiKey = (process.env.NEXT_PUBLIC_SHOPIFY_API_KEY as string) || '67beb1794fab10553102c134b63e1277'
          const app = createApp({ apiKey, host, forceRedirect: false })
          w.__shopifyAppBridgeInstance = app
          try {
            const utils: any = await import('@shopify/app-bridge-utils')
            if (utils.getSessionToken) {
              const token = await utils.getSessionToken(app)
              if (typeof token === 'string' && token) {
                w.__shopifySessionTokenCached = token
                return token
              }
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  for (let attempts = 0; attempts < 400; attempts++) {
    try {
      if (w.shopify?.idToken && typeof w.shopify.idToken === 'function') {
        const t = await w.shopify.idToken()
        if (typeof t === 'string' && t) return t
      }
    } catch {}
    try {
      if (w.shopify?.auth?.idToken && typeof w.shopify.auth.idToken === 'function') {
        const t = await w.shopify.auth.idToken()
        if (typeof t === 'string' && t) return t
      }
    } catch {}
    try {
      if (w.shopify?.auth?.getSessionToken && typeof w.shopify.auth.getSessionToken === 'function') {
        const t = await w.shopify.auth.getSessionToken()
        if (typeof t === 'string' && t) return t
      }
    } catch {}
    try {
      if (w.__shopifyAppBridgeInstance) {
        const utils: any = await import('@shopify/app-bridge-utils')
        if (utils.getSessionToken) {
          const t = await utils.getSessionToken(w.__shopifyAppBridgeInstance)
          if (typeof t === 'string' && t) return t
        }
      }
    } catch {}
    try {
      if (w.__shopifySessionTokenCached && typeof w.__shopifySessionTokenCached === 'string') {
        return w.__shopifySessionTokenCached
      }
    } catch {}

    await new Promise((r) => setTimeout(r, 15))
  }
  return null
}

export async function shopifySessionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)

  try {
    const token = await getShopifyIdToken()
    if (token && typeof token === 'string') {
      headers.set('Authorization', `Bearer ${token}`)
    }
  } catch (err) {
    // ignore
  }

  return fetch(input, { ...init, headers, credentials: init.credentials || 'include' })
}
