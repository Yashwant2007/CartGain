'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { isInShopifyEmbed, getShopifyEmbedParams } from '@/lib/shopify-embed'
import {
  getShopifyIdToken,
  installShopifyAuthFetchPatch,
} from '@/lib/shopify-session-fetch'

// The App Bridge runtime is server-rendered into the document head (see
// src/app/layout.tsx) — it MUST NOT be injected from here: the CDN bundle
// aborts itself when the tag is async/defer/module, and it needs the
// `shopify-api-key` meta tag that only the server can render for the
// embedded request.
//
// App Bridge exposes `shopify.idToken()` — a short-lived JWT signed for this
// app. We use it to authenticate the embedded admin session without any
// Google round-trip and without depending on a third-party cookie surviving
// the admin iframe.
//
// The token lookup is bounded (see src/lib/shopify-session-fetch.ts): when
// the admin never answers, App Bridge's own idToken() blocks for a full
// minute. Waiting for that would freeze the embedded app, so we give up long
// before and let the request go out unauthenticated instead.

function embedUrl(path: string): string {
  const { shop, host } = getShopifyEmbedParams()
  const params = new URLSearchParams()
  if (shop) params.set('shop', shop)
  if (host) params.set('host', host)
  const qs = params.toString()
  return `${path}${qs ? `?${qs}` : ''}`
}

// Mounted once at the root. Whenever the app runs inside the Shopify admin
// iframe it exchanges an App Bridge session token for a CartGain session:
//  - no session yet → the token signs the merchant in and the app reloads
//    into the dashboard
//  - session already → the token is still exchanged, because Shopify's
//    "session tokens for user authentication" requirement is satisfied by the
//    app actually sending the session token with its requests
// On the normal website (not embedded) it is a no-op.
export default function EmbeddedAuthBootstrap() {
  const { status } = useSession()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    // Wait for the session state to settle: we need to know whether the
    // merchant is signed in before deciding to reload the page.
    if (status === 'loading') return
    if (!isInShopifyEmbed()) return
    ran.current = true

    // Make sure every /api request of this page carries the ID token, even
    // the ones that use a plain fetch().
    installShopifyAuthFetchPatch()

    ;(async () => {
      try {
        const token = await getShopifyIdToken()
        if (!token) return

        const res = await fetch('/api/shopify/embed-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return

        if (data.connected) {
          // The session cookie is now set — full reload so the app picks it up.
          if (status === 'unauthenticated') {
            window.location.replace(embedUrl('/dashboard'))
          }
          return
        }

        if (data.mismatch) {
          // The embedded shop belongs to a different CartGain account than
          // the signed-in one — never swap the session silently.
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
