'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

export default function ShopifyConnectedPage() {
  const router = useRouter()

  useEffect(() => {
    // The opener relationship is severed by Cross-Origin-Opener-Policy as soon
    // as the popup navigates through Shopify's origin, so `window.opener` is
    // usually null by the time we get here — deciding on it made the popup
    // redirect itself to the integrations page and become a SECOND tab (the
    // original tab still showing "not connected"). Instead, always tell the
    // opener if we still have one, then try to close this window; only a direct
    // visit (which cannot be script-closed) falls through to the redirect.
    if (window.opener) {
      // Same-origin target only — never '*' (which would leak to any host).
      try { window.opener.postMessage('shopify_connected', window.location.origin) } catch {}
    }

    // window.close() is a no-op for a non-script-opened window, so this timer is
    // the direct-visit fallback; when the close succeeds the page is gone before
    // it fires.
    const t = setTimeout(() => {
      router.replace('/dashboard/integrations?shopify_connected=true')
    }, 1500)
    window.close()

    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Shopify Store Connected!</h1>
        <p className="text-blue-300/70 mb-4">
          Your store has been connected to CartGain successfully.
        </p>
        <p className="text-sm text-blue-300/50 mb-6">
          Redirecting to dashboard…
        </p>
        <p className="text-xs text-blue-300/30 mt-4">
          You can close this tab and return to CartGain.
        </p>
      </div>
    </div>
  )
}
