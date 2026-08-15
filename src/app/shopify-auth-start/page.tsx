'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Top-level entry point for the embedded Shopify admin Google OAuth popup.
// Opens as a real browser window (not inside the admin iframe), so all OAuth
// cookies (csrf / pkce / state) are first-party to this popup instead of being
// set from the cross-site iframe context — which Chrome partitions and would
// otherwise break the callback (NextAuth "OAuthCallback" error).
export default function ShopifyAuthStartPage() {
  return (
    <Suspense fallback={<Loading label="Starting…" />}>
      <StartContent />
    </Suspense>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
      <p className="text-blue-300/70 text-sm">{label}</p>
    </div>
  )
}

function StartContent() {
  const searchParams = useSearchParams()
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    // Read primitive once — searchParams identity changes on every render.
    const cb = searchParams.get('cb') || '/shopify-auth-success'

    let cancelled = false
    const run = async () => {
      try {
        const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' })
        if (!csrfRes.ok) throw new Error('Could not start sign-in (CSRF)')
        const { csrfToken } = await csrfRes.json()

        const res = await fetch('/api/auth/callback/google', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ csrfToken, callbackUrl: cb }),
        })

        if (!res.url || !/^https?:\/\//.test(res.url)) {
          throw new Error('Could not reach Google')
        }

        if (cancelled) return
        // Full navigation (not fetch) so Google's own cookies work normally.
        window.location.href = res.url
      } catch (err) {
        if (cancelled) return
        setFatal(err instanceof Error ? err.message : 'Sign-in failed to start')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (fatal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-6">
        <p className="text-red-300/80 text-sm text-center max-w-sm">
          Sign-in failed to start. Try again, or sign in from the CartGain website in a normal browser tab.
          <span className="block text-blue-300/60 mt-2">({fatal})</span>
        </p>
      </div>
    )
  }

  return <Loading label="Connecting to Google…" />
}
