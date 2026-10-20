'use client'

import { isInShopifyEmbed } from './shopify-embed'

export async function shopifySessionFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)

  if (typeof window !== 'undefined') {
    const shopify = (window as any).shopify
    let attempts = 0
    while ((!shopify?.idToken) && attempts < 15) {
      await new Promise((r) => setTimeout(r, 100))
      attempts++
      // @ts-ignore
    }
    if ((window as any).shopify?.idToken) {
      try {
        const token = await (window as any).shopify.idToken()
        if (token) {
          headers.set('Authorization', `Bearer ${token}`)
        }
      } catch {
        // ignore
      }
    }
  }

  return fetch(input, { ...init, headers, credentials: init.credentials || 'include' })
}
