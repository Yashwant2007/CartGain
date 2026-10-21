'use client'

import { useEffect } from 'react'
import { getShopifyEmbedParams } from '@/lib/shopify-embed'

const API_KEY = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || '67beb1794fab10553102c134b63e1277'

export default function AppBridgeInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as any
    if (w.__cgAppBridgeInit) return
    w.__cgAppBridgeInit = true

    const { host } = getShopifyEmbedParams()
    if (!host) return

    // Try to initialize App Bridge if not present
    const init = async () => {
      try {
        // Check if already has session token method
        if (w.shopify?.auth?.getSessionToken || w.shopify?.idToken) return

        // Try to load from npm package dynamically
        try {
          // @ts-ignore
          const createAppModule = await import('@shopify/app-bridge')
          const createApp = (createAppModule as any).default || (createAppModule as any).createApp
          if (createApp) {
            const app = createApp({ apiKey: API_KEY, host, forceRedirect: false })
            w.__shopifyAppBridge = app
            try {
              // @ts-ignore
              const utils = await import('@shopify/app-bridge-utils')
              if (utils.getSessionToken) {
                const token = await utils.getSessionToken(app)
                if (token && typeof token === 'string') {
                  w.__shopifySessionTokenCached = token
                }
              }
            } catch {}
          }
        } catch {}
      } catch {}
    }

    init()
    // Also retry periodically
    const interval = setInterval(init, 2000)
    setTimeout(() => clearInterval(interval), 30000)
  }, [])

  return null
}
