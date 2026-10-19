'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { isInShopifyEmbed, getShopifyEmbedParams } from '@/lib/shopify-embed'

// Shopify's App Bridge is served from the Shopify CDN and exposes
// `window.shopify.idToken()` — a short-lived JWT signed for this app. We use it
// to authenticate the embedded admin session without any Google round-trip and
// without depending on a third-party cookie surviving the admin iframe.
const APP_BRIDGE_SRC = 'https://cdn.shopify.com/shopifycloud/app-bridge.js'

function loadAppBridge(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if ((window as any).shopify?.idToken) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const finish = () => resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APP_BRIDGE_SRC}"]`)
    const waitForShopify = () => {
      let tries = 0
      const t = setInterval(() => {
        tries += 1
        if ((window as any).shopify?.idToken || tries > 100) {
          clearInterval(t)
          finish()
        }
      }, 50)
    }
    if (existing) {
      waitForShopify()
      return
    }
    const s = document.createElement('script')
    s.src = APP_BRIDGE_SRC
    s.async = true
    s.onload = waitForShopify
    s.onerror = finish
    document.head.appendChild(s)
  })
}

function embedUrl(path: string): string {
  const { shop, host } = getShopifyEmbedParams()
  const params = new URLSearchParams()
  if (shop) params.set('shop', shop)
  if (host) params.set('host', host)
  const qs = params.toString()
  return `${path}${qs ? `?${qs}` : ''}`
}

// Mounted once at the root. When the app runs inside the Shopify admin iframe
// and no CartGain session exists yet, it exchanges an App Bridge session token
// for a session cookie and reloads into the dashboard. On the normal website
// (not embedded) it is a no-op.
export default function EmbeddedAuthBootstrap() {
  const { status } = useSession()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    if (status !== 'unauthenticated') return
    if (!isInShopifyEmbed()) return
    ran.current = true

    ;(async () => {
      try {
        await loadAppBridge()
        const shopify = (window as any).shopify
        if (!shopify?.idToken) return
        const token: string = await shopify.idToken()
        if (!token) return

        const res = await fetch('/api/shopify/embed-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.ok && data.connected) {
          // Session cookie is now set — full reload so the app picks it up.
          window.location.replace(embedUrl('/dashboard'))
          return
        }

        if (data.needsInstall) {
          const { shop, host } = getShopifyEmbedParams()
          const shopDomain = (data.shop as string | undefined) || shop
          if (shopDomain) {
            const q = new URLSearchParams({ shop: shopDomain, embedded: '1' })
            if (host) q.set('host', host)
            window.location.replace(`/api/shopify/install?${q.toString()}`)
          }
        }
      } catch {
        // Non-fatal: fall back to the normal login UI.
      }
    })()
  }, [status])

  return null
}
