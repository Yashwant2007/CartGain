'use client'

async function getShopifyIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const w = window as any

  if (typeof w.__shopifySessionTokenCached === 'string' && w.__shopifySessionTokenCached) {
    return w.__shopifySessionTokenCached
  }

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
