'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// NextAuth's custom error page (authOptions.pages.error). When the Google
// OAuth callback fails — e.g. OAuthAccountNotLinked — NextAuth redirects the
// popup here with ?error=<code>, and the popup lands on this page instead of
// NextAuth's opaque built-in error screen.
//
// This page does two jobs:
//   1. Reports the real error code back to the opener iframe via
//      cg_auth_error, so the merchant sees an actionable message in-app.
//   2. Shows the same friendly message plus a sensible next step.
export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  )
}

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error') || 'Default'
  const [hasOpener, setHasOpener] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isPopup = !!window.opener && window.opener !== window
    setHasOpener(isPopup)
    try {
      if (isPopup) {
        window.opener.postMessage({ type: 'cg_auth_error', error }, window.location.origin)
      }
    } catch {
      // cross-origin opener — nothing to report
    }
  }, [error])

  const message =
    error === 'OAuthAccountNotLinked'
      ? 'This Google account is already used by a different CartGain account. Sign in with that account, or use a different Google / email account.'
      : error === 'NoAccount'
      ? 'No CartGain account exists for this Google account yet. Create one first.'
      : error === 'AccessDenied'
      ? 'Google sign-in was not approved. If you want to continue, allow CartGain access on the Google screen.'
      : error === 'Configuration'
      ? 'Google sign-in is not fully configured on this deployment. Please contact support.'
      : 'Google sign-in did not complete. Please try again.'

  const primaryPath =
    error === 'OAuthAccountNotLinked' ? '/login' : error === 'NoAccount' ? '/signup' : '/login'
  const primaryLabel =
    error === 'OAuthAccountNotLinked'
      ? 'Sign in with email & password'
      : error === 'NoAccount'
      ? 'Create an account'
      : 'Try again'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-900/30 border border-red-500/40 mb-5">
          <svg
            className="w-7 h-7 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Sign-in not completed</h1>
        <p className="text-sm text-blue-200 leading-relaxed mb-6">{message}</p>
        <div className="flex flex-col gap-3">
          <Link
            href={primaryPath}
            className="inline-block px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:from-blue-500 hover:to-cyan-500 transition"
          >
            {primaryLabel}
          </Link>
          <button
            onClick={() => (hasOpener ? window.close() : (window.location.href = '/login'))}
            className="px-5 py-2.5 bg-slate-800 border border-slate-700 text-white/70 text-sm font-medium rounded-lg hover:bg-slate-700 transition"
          >
            {hasOpener ? 'Close window' : 'Go to sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}