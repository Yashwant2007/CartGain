'use client'

import { getAppBridgeSessionToken } from './shopify-app-bridge'

async function getShopifyIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const w = window as any

  // Try App Bridge v3/v4 utils first
  try {
    const t = await getAppBridgeSessionToken()
    if (typeof t === 'string' && t) return t
  } catch {}

  for (let attempts = 0; attempts < 300; attempts++) {
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
      if (w.Shopify?.App?.idToken && typeof w.Shopify.App.idToken === 'function') {
        const t = await w.Shopify.App.idToken()
        if (typeof t === 'string' && t) return t
      }
    } catch {}
    try {
      if (w.ShopifyAppBridge?.auth?.getSessionToken && typeof w.ShopifyAppBridge.auth.getSessionToken === 'function') {
        const t = await w.ShopifyAppBridge.auth.getSessionToken()
        if (typeof t === 'string' && t) return t
      }
    } catch {}
    try {
      if (w.app?.auth?.getSessionToken && typeof w.app.auth.getSessionToken === 'function') {
        const t = await w.app.auth.getSessionToken()
        if (typeof t === 'string' && t) return t
      }
    } catch {}

    await new Promise((r) => setTimeout(r, 20))
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
