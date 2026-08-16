'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
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
  const navigatedRef = useRef(false)

  useEffect(() => {
    // Read primitive once — searchParams identity changes on every render.
    const cb = searchParams.get('cb') || '/shopify-auth-success'

    let cancelled = false
    const run = async () => {
      try {
        const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' })
        if (!csrfRes.ok) throw new Error('Could not start sign-in (CSRF)')
        const { csrfToken } = await csrfRes.json()

        if (cancelled) return

        const signinUrl = `/api/auth/signin/google?callbackUrl=${encodeURIComponent(cb)}`

        // 1) Preferred: real form POST. The browser follows the 302 to
        //    accounts.google.com as a plain top-level navigation — no CORS.
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = signinUrl
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = 'csrfToken'
        input.value = csrfToken
        form.appendChild(input)
        document.body.appendChild(form)

        try {
          form.submit()
        } catch {
          // form submission blocked (e.g., sandboxed popup without allow-forms)
        }
        navigatedRef.current = true

        // 2) Fallback: if the form submit didn't take us anywhere (some
        //    browsers/popup sandboxes block it), force a top-level navigation
        //    to the sign-in page, which lets the user continue with a click.
        setTimeout(() => {
          if (cancelled || document.hidden) return
          if (window.location.pathname === '/shopify-auth-start') {
            window.location.assign(`${signinUrl}&csrf=${encodeURIComponent(csrfToken)}`)
          }
        }, 2500)
      } catch (err) {
        if (cancelled) return
        setFatal(err instanceof Error ? err.message : 'Sign-in failed to start')
      }
    }

    // Small delay so the popup is fully rendered before submitting.
    const t = setTimeout(run, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
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