'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, Check, Key, Globe, Webhook, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

export default function APIDocsPage() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cart-gain.com'

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedEndpoint(key)
    setTimeout(() => setCopiedEndpoint(null), 2000)
  }

  const endpoints = [
    {
      method: 'POST',
      path: '/api/carts',
      description: 'Create a new abandoned cart entry',
      body: `{
  "storeId": "store_cuid",
  "cartId": "ext_cart_123",
  "customerEmail": "customer@example.com",
  "customerPhone": "+919876543210",
  "customerName": "John Doe",
  "items": [
    { "title": "Product Name", "quantity": 1, "price": 499 }
  ],
  "totalValue": 499,
  "currency": "INR"
}`,
    },
    {
      method: 'GET',
      path: '/api/carts?storeId={storeId}',
      description: 'List all abandoned carts for a store',
    },
    {
      method: 'GET',
      path: '/api/carts/stats?storeId={storeId}',
      description: 'Get cart recovery statistics',
    },
    {
      method: 'POST',
      path: '/api/webhooks/shopify',
      description: 'Receive real-time cart events from Shopify',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard/settings" className="inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Settings
        </Link>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-8 backdrop-blur-sm mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">API Documentation</h1>
          <p className="text-blue-300/70 mb-6">
            Use our REST API to integrate CartGain with your custom systems.
          </p>

          <div className="space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Globe className="w-5 h-5 text-cyan-400 mr-2" />
                Base URL
              </h2>
              <div className="bg-slate-900/60 border border-blue-700/40 rounded-lg p-3 flex items-center justify-between">
                <code className="text-cyan-300 text-sm font-mono">{baseUrl}</code>
                <button
                  onClick={() => copyToClipboard(baseUrl, 'baseUrl')}
                  className="p-1.5 hover:bg-slate-700/50 rounded transition-colors text-blue-300/60 hover:text-blue-200"
                >
                  {copiedEndpoint === 'baseUrl' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Key className="w-5 h-5 text-cyan-400 mr-2" />
                Authentication
              </h2>
              <p className="text-sm text-blue-300/70 mb-3">
                All API requests require your API key in the <code className="text-cyan-300 bg-slate-900/60 px-1.5 py-0.5 rounded text-xs font-mono">x-api-key</code> header. Find your API key in{' '}
                <Link href="/dashboard/settings" className="text-cyan-400 hover:text-cyan-300 underline">Settings &gt; API Keys</Link>.
              </p>
              <div className="bg-slate-900/60 border border-blue-700/40 rounded-lg p-3">
                <pre className="text-sm text-blue-200 font-mono">curl -H &quot;x-api-key: rf_live_xxxxxxxxxxxxxxxxxxxx&quot; \
  {baseUrl}/api/carts?storeId=your_store_id</pre>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
                <ShoppingCart className="w-5 h-5 text-cyan-400 mr-2" />
                Endpoints
              </h2>
              <div className="space-y-3">
                {endpoints.map((ep) => (
                  <div key={ep.path} className="bg-slate-900/40 border border-blue-700/30 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          ep.method === 'GET' ? 'bg-emerald-600/30 text-emerald-300' :
                          ep.method === 'POST' ? 'bg-blue-600/30 text-blue-300' :
                          'bg-amber-600/30 text-amber-300'
                        }`}>{ep.method}</span>
                        <code className="text-sm text-cyan-300 font-mono">{ep.path}</code>
                      </div>
                      <button
                        onClick={() => copyToClipboard(`${ep.method} ${baseUrl}${ep.path.replace(/\{.*?\}/g, 'example')}`, ep.path)}
                        className="p-1.5 hover:bg-slate-700/50 rounded transition-colors text-blue-300/60 hover:text-blue-200"
                      >
                        {copiedEndpoint === ep.path ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-sm text-blue-300/70 mb-2">{ep.description}</p>
                    {ep.body && (
                      <pre className="text-xs text-blue-200/80 font-mono bg-slate-900/60 rounded p-3 overflow-x-auto">{ep.body}</pre>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Webhook className="w-5 h-5 text-cyan-400 mr-2" />
                Webhooks
              </h2>
              <p className="text-sm text-blue-300/70 mb-3">
                CartGain can send real-time events to your webhook URL. Configure your webhook endpoint in{' '}
                <Link href="/dashboard/integrations" className="text-cyan-400 hover:text-cyan-300 underline">Integrations</Link>.
              </p>
              <div className="bg-slate-900/60 border border-blue-700/40 rounded-lg p-4">
                <h3 className="text-sm font-medium text-white mb-2">Cart abandoned event</h3>
                <pre className="text-xs text-blue-200/80 font-mono overflow-x-auto">{JSON.stringify({
                  event: 'cart.abandoned',
                  cartId: 'ext_cart_123',
                  customer: { email: 'customer@example.com', phone: '+919876543210' },
                  items: [{ title: 'Product', quantity: 1, price: 499 }],
                  totalValue: 499,
                  currency: 'INR',
                  abandonedAt: '2026-01-15T10:30:00Z',
                }, null, 2)}</pre>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Need Help?</h2>
              <p className="text-sm text-blue-300/70">
                Visit the{' '}
                <Link href="/dashboard/integrations" className="text-cyan-400 hover:text-cyan-300 underline">
                  Integrations page
                </Link>{' '}
                or check your{' '}
                <Link href="/dashboard/settings" className="text-cyan-400 hover:text-cyan-300 underline">
                  Settings
                </Link>{' '}
                for your API key and webhook configuration.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
