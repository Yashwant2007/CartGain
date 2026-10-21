'use client'

import { useEffect } from 'react'
import { getShopifyEmbedParams } from '@/lib/shopify-embed'

const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '67beb1794fab10553102c134b63e1277'

export default function SessionTokenProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (w.__sessionTokenProviderInit) return
    w.__sessionTokenProviderInit = true

    const tryGetToken = async () => {
      // Try various ways
      try {
        // Method 1: shopify global
        if (w.shopify?.idToken && typeof w.shopify.idToken === 'function') {
          try {
            const token = await w.shopify.idToken()
            if (token) {
              w.__shopifySessionTokenCached = token
              return
            }
          } catch {}
        }
        // Method 2: shopify.auth.getSessionToken (v4 style)
        if (w.shopify?.auth?.getSessionToken && typeof w.shopify.auth.getSessionToken === 'function') {
          try {
            const token = await w.shopify.auth.getSessionToken()
            if (token) {
              w.__shopifySessionTokenCached = token
              return
            }
          } catch {}
        }
        // Method 3: try to use app bridge from npm packages if available globally
        // Method 4: create app bridge instance
        const { host } = getShopifyEmbedParams()
        if (host) {
          try {
            // @ts-ignore
            const createApp = (await import('@shopify/app-bridge'))?.default
            // @ts-ignore
            const { getSessionToken } = await import('@shopify/app-bridge-utils')
            if (createApp && getSessionToken) {
              const app = createApp({ apiKey: API_KEY, host, forceRedirect: false })
              const token = await getSessionToken(app)
              if (token) {
                w.__shopifySessionTokenCached = token
                return
              }
            }
          } catch {}
        }
      } catch {}
    }

    tryGetToken()
    const interval = setInterval(tryGetToken, 1000)
    setTimeout(() => clearInterval(interval), 60000)
  }, [])

  return null
}
