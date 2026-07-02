'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

export default function ShopifyConnectedPage() {
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    // Notify the opener tab (CartGain in Shopify admin) if possible
    if (window.opener) {
      try {
        window.opener.postMessage('shopify_connected', '*')
      } catch {}
    }

    // Auto-close after 2 seconds
    const t = setTimeout(() => {
      setClosing(true)
      window.close()
    }, 2000)

    return () => clearTimeout(t)
  }, [])

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
        <p className="text-sm text-blue-300/50">
          {closing ? 'Closing tab…' : 'This tab will close automatically in a moment.'}
        </p>
        <button
          onClick={() => window.close()}
          className="mt-6 px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
        >
          Close Tab
        </button>
      </div>
    </div>
  )
}
