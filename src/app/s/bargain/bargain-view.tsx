'use client'

import { Suspense, useMemo, useState, type ReactNode, useEffect } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import BargainWidget, { type BargainItem } from '@/components/bargain/StorefrontBargainWidget'

export default function BargainView() {
  return (
    <Suspense fallback={<Shell><WidgetLoading /></Shell>}>
      <PageContent />
    </Suspense>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-start justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function WidgetLoading() {
  return <div className="p-6 text-sm text-slate-400 text-center">Loading bargain…</div>
}

function AlreadyUsed() {
  return (
    <div className="p-8 text-center">
      <div className="text-2xl mb-3">🔒</div>
      <p className="text-sm font-semibold text-white mb-2">Demo already used</p>
      <p className="text-xs text-slate-400 mb-4">
        Each account gets one live storefront demo to keep price-shoppers and bots from burning margins.
      </p>
      <p className="text-xs text-slate-500">The real product runs unlimited negotiations on your own store.</p>
    </div>
  )
}

function useCartItems(raw?: string | null): BargainItem[] {
  return useMemo(() => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  }, [raw])
}

function PageContent() {
  const params = useSearchParams()
  const mode: 'item' | 'cart' = params.get('mode') === 'cart' ? 'cart' : 'item'
  const shop = params.get('shop') || (typeof window !== 'undefined' ? window.location.hostname : '')
  const currency = params.get('currency') || 'USD'

  const [selected, setSelected] = useState<number | null>(null)
  const [wholeCart, setWholeCart] = useState(true)
  const [alreadyUsed, setAlreadyUsed] = useState(false)

  // Merchant decides how the store bargains. Pull the saved store config so the
  // preview widget mirrors exactly what customers on the real storefront see.
  const { data: session } = useSession()
  const [storeCfg, setStoreCfg] = useState<{ persona: string; language: string; maxAttempts: number; minProfitPercent: number }>({
    persona: 'friendly_shopkeeper',
    language: 'auto',
    maxAttempts: 3,
    minProfitPercent: 25,
  })

  useEffect(() => {
    const storeId = (session?.user as { storeId?: string } | undefined)?.storeId
    if (!storeId) return
    let cancelled = false
    fetch(`/api/bargain/config?storeId=${storeId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.config) return
        const c = data.config
        setStoreCfg({
          persona: typeof c.aiPersona === 'string' ? c.aiPersona : 'friendly_shopkeeper',
          language: typeof c.language === 'string' ? c.language : 'auto',
          maxAttempts: typeof c.maxAttempts === 'number' ? c.maxAttempts : 3,
          minProfitPercent: typeof c.minProfitPercent === 'number' ? c.minProfitPercent : 25,
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [session])

  // One live storefront demo per account — enforcement happens server-side.
  // This client call is a safety net if the demo was consumed in another tab.
  useEffect(() => {
    fetch('/api/demo/claim', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data?.used === true) setAlreadyUsed(true)
      })
      .catch(() => {})
  }, [])

  const items = useCartItems(params.get('items'))
  const total = parseFloat(params.get('total') || '0') || 0

  const line = useMemo(() => {
    if (mode === 'item') {
      const price = parseFloat(params.get('price') || '0') || 0
      return {
        kind: 'item' as const,
        id: params.get('product') || '',
        variantId: params.get('variant') ?? undefined,
        title: params.get('title') || 'this item',
        price,
        image: params.get('image') || undefined,
      }
    }
    if (wholeCart) {
      return { kind: 'cart' as const, total }
    }
    const item = items[selected ?? 0]
    if (!item) return { kind: 'cart' as const, total }
    const price = parseFloat(String(item.final_price ?? item.price ?? 0)) || 0
    return {
      kind: 'item' as const,
      id: String(item.id ?? ''),
      variantId: item.variant_id ? String(item.variant_id) : null,
      title: item.title || 'this item',
      price,
      image: item.featured_image?.url || item.image || undefined,
    }
  }, [mode, params, wholeCart, selected, items, total])

  const checkoutUrl = shop ? `https://${shop}/checkout` : '/checkout'

  // Ensure iframe can be embedded in Shopify themes/checkout
  useEffect(() => {
    // Send ready signal to parent (theme editor/preview)
    try { window.parent?.postMessage({ type: 'cg_ready' }, '*'); } catch {}
  }, [])

  if (alreadyUsed) {
    return (
      <Shell>
        <AlreadyUsed />
      </Shell>
    )
  }

  if (mode === 'cart' && items.length > 0) {
    return (
      <Shell>
        <div className="p-4 border-b border-white/10">
          <p className="text-sm font-semibold text-white">What would you like to negotiate?</p>
          <p className="text-xs text-slate-400 mt-1">Pick the whole cart, or one item — before you pay.</p>
        </div>

        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => { setWholeCart(true); setSelected(null) }}
            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm mb-1 transition-colors ${
              wholeCart ? 'bg-blue-600/25 text-blue-100' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <span>🛒 Whole cart</span>
            <span className="text-xs text-blue-300">{currency === 'USD' ? '$' : currency + ' '}{total.toFixed(2)}</span>
          </button>
        </div>

        <div className="px-4 pb-3 flex flex-col gap-1">
          {items.slice(0, 12).map((item, idx) => {
            const p = parseFloat(String(item.final_price ?? item.price ?? 0)) || 0
            const active = !wholeCart && selected === idx
            return (
              <button
                type="button"
                key={idx}
                onClick={() => { setWholeCart(false); setSelected(idx) }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'bg-blue-600/25 text-blue-100' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {item.featured_image?.url || item.image ? (
                  <Image src={item.featured_image?.url || item.image || ''} alt="" width={32} height={32} className="w-8 h-8 rounded object-cover" unoptimized />
                ) : (
                  <span className="w-8 h-8 rounded bg-blue-600/20 flex items-center justify-center">📦</span>
                )}
                <span className="flex-1 min-w-0 truncate">{item.title}{item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ''}</span>
                <span className="text-xs text-blue-300">{currency === 'USD' ? '$' : currency + ' '}{p.toFixed(2)}</span>
              </button>
            )
          })}
        </div>

        <BargainWidget
          key={`${line.kind}-${line.price}-${selected ?? (wholeCart ? 'cart' : '')}`}
          mode={line.kind === 'cart' ? 'cart' : 'item'}
          shop={shop}
          currency={currency}
          line={line}
          checkoutUrl={checkoutUrl}
          persona={storeCfg.persona}
          language={storeCfg.language}
          maxAttempts={storeCfg.maxAttempts}
          minProfitPercent={storeCfg.minProfitPercent}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <BargainWidget
        mode={mode}
        shop={shop}
        currency={currency}
        line={line}
        checkoutUrl={checkoutUrl}
      />
    </Shell>
  )
}