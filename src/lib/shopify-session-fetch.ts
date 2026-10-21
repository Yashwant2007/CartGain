'use client'

async function getShopifyIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const w = window as any

  // Try multiple locations over time
  for (let attempts = 0; attempts < 150; attempts++) {
    // Direct shopify global
    if (w.shopify?.idToken && typeof w.shopify.idToken === 'function') {
      try {
        const t = await w.shopify.idToken()
        if (t) return t
      } catch {}
    }
    if (w.shopify?.auth?.idToken && typeof w.shopify.auth.idToken === 'function') {
      try {
        const t = await w.shopify.auth.idToken()
        if (t) return t
      } catch {}
    }
    // Shopify.App pattern
    if (w.Shopify?.App?.idToken && typeof w.Shopify.App.idToken === 'function') {
      try {
        const t = await w.Shopify.App.idToken()
        if (t) return t
      } catch {}
    }
    if (w.ShopifyAppBridge?.idToken && typeof w.ShopifyAppBridge.idToken === 'function') {
      try {
        const t = await w.ShopifyAppBridge.idToken()
        if (t) return t
      } catch {}
    }
    // app instance patterns
    if (w.app?.idToken && typeof w.app.idToken === 'function') {
      try {
        const t = await w.app.idToken()
        if (t) return t
      } catch {}
    }

    await new Promise((r) => setTimeout(r, 40))
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
