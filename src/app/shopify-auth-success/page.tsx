'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Landing page for the Google OAuth popup used by the embedded Shopify admin
// flow (see openGoogleAuthPopup in src/lib/shopify-embed.ts). NextAuth's
// redirect lands here after the OAuth round-trip; we signal the opener (the
// app frame inside the Shopify admin) and close the popup.
export default function ShopifyAuthSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      if (window.opener && window.opener !== window) {
        window.opener.postMessage({ type: 'cg_auth_complete' }, window.location.origin)
        window.close()
        return
      }
    } catch {
      // cross-origin opener — fall through to a plain redirect
    }
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
      <p className="text-blue-300/70 text-sm">Sign-in successful — closing this window…</p>
    </div>
  )
}
