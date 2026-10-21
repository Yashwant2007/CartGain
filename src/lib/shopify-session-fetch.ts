'use client'

export async function shopifySessionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)

  if (typeof window !== 'undefined') {
    const w = window as any
    let shopify: any = w.shopify

    // Wait for App Bridge to be available
    for (let attempts = 0; attempts < 100; attempts++) {
      shopify = w.shopify
      if (shopify?.idToken && typeof shopify.idToken === 'function') break
      if ((w as any).Shopify?.App?.idToken && typeof (w as any).Shopify.App.idToken === 'function') {
        shopify = (w as any).Shopify.App
        break
      }
      await new Promise((r) => setTimeout(r, 50))
    }

    if (shopify?.idToken && typeof shopify.idToken === 'function') {
      try {
        const token = await shopify.idToken()
        if (token && typeof token === 'string') {
          headers.set('Authorization', `Bearer ${token}`)
        }
      } catch (err) {
        // ignore
      }
    }
  }

  return fetch(input, { ...init, headers, credentials: init.credentials || 'include' })
}
