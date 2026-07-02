'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

export default function ShopifyConnectedPage() {
  const router = useRouter()

  useEffect(() => {
    if (window.opener) {
      try { window.opener.postMessage('shopify_connected', '*') } catch {}
    }

    const t = setTimeout(() => {
      router.replace('/dashboard/integrations?shopify_connected=true')
    }, 2000)

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
