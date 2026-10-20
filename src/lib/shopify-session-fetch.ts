'use client'

import { isInShopifyEmbed } from './shopify-embed'

export async function shopifySessionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)

  if (typeof window !== 'undefined') {
    const w = window as any
    let shopify = w.shopify

    // Try to wait for App Bridge to be available
    if (!shopify?.idToken) {
      for (let attempts = 0; attempts < 50; attempts++) {
        shopify = (window as any).shopify
        if (shopify?.idToken) break
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    // Also check alternative references
    if (!shopify?.idToken && (window as any).Shopify?.App) {
      shopify = (window as any).Shopify?.App
    }

    if (shopify?.idToken && typeof shopify.idToken === 'function') {
      try {
        const token = await shopify.idToken()
        if (token && typeof token === 'string') {
          headers.set('Authorization', `Bearer ${token}`)
        }
      } catch (err) {
        // ignore - will fallback to cookie auth
      }
    }
  }

  return fetch(input, { ...init, headers, credentials: init.credentials || 'include' })
}
