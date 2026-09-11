'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Settings2,
  Info,
  Link2,
} from 'lucide-react'

type OverrideShape = {
  shopifyProductId: string
  productTitle?: string | null
  minPrice: number | null
  minProfitPercent: number | null
  maxDiscountPercent: number | null
  isBargainable: boolean
}

type CatalogItem = {
  product: any
  bargains: { enabled: boolean; minPrice: number | null; maxDiscountPercent: number | null }
}

export function ProductCatalogPanel({
  storeId,
  globalMinProfitPercent,
}: {
  storeId: string
  globalMinProfitPercent?: number
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [orphans, setOrphans] = useState<OverrideShape[]>([])
  const [loading, setLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [prevCursor, setPrevCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftMin, setDraftMin] = useState('')
  const [draftMaxPct, setDraftMaxPct] = useState('')
  const [manualId, setManualId] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [txMsg, setTxMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const abortRef = useRef<(() => void)[]>([])

  const loadPage = useCallback(async (c: string | null, q: string, append: boolean) => {
    setLoading(true)
    setCatalogError(null)
    setTxMsg(null)
    const controller = new AbortController()
    abortRef.current.push(() => controller.abort())
    try {
      const params = new URLSearchParams({ storeId })
      if (c) params.set('cursor', c)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/bargain/products/catalog?${params.toString()}`, { signal: controller.signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load products')
      setCatalog(prev => (append ? [...prev, ...(data.products || [])] : data.products || []))
      setOrphans(data.orphanOverrides || [])
      if (append) {
        setCursor(data.nextCursor)
        setPrevCursor(c)
        setHasPrev(true)
        setHasNext(Boolean(data.nextCursor))
      } else {
        setCursor(data.nextCursor)
        setPrevCursor(data.prevCursor)
        setHasNext(Boolean(data.nextCursor))
        setHasPrev(Boolean(data.prevCursor))
      }
      if (data.message && data.products?.length === 0 && !q) setCatalogError(data.message)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setCatalogError(err.message ?? 'Failed to load products')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    void loadPage(null, '', false)
    return () => { abortRef.current.forEach(ab => ab()); abortRef.current = [] }
  }, [loadPage])

  async function upsertProduct(payload: Partial<OverrideShape> & { shopifyProductId: string }) {
    const res = await fetch('/api/bargain/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, ...payload }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message ?? 'Failed to update product')
    }
    return res.json()
  }

  async function toggle(id: string, current: boolean) {
    setBusyId(id)
    setTxMsg(null)
    try {
      await upsertProduct({ shopifyProductId: id, isBargainable: !current })
      setCatalog(prev => prev.map(it => it.product.id === id ? { ...it, bargains: { ...it.bargains, enabled: !current } } : it))
      setTxMsg({ type: 'success', text: !current ? 'Bargaining enabled for this product' : 'Bargaining disabled for this product' })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(it: CatalogItem) {
    setEditingId(it.product.id)
    setDraftMin(it.bargains.minPrice != null ? String(it.bargains.minPrice) : '')
    setDraftMaxPct(it.bargains.maxDiscountPercent != null ? String(it.bargains.maxDiscountPercent) : '')
  }

  async function saveEdit(it: CatalogItem) {
    setBusyId(it.product.id)
    setTxMsg(null)
    try {
      const minPrice = draftMin.trim() === '' ? undefined : parseFloat(draftMin)
      const maxDiscountPercent = draftMaxPct.trim() === '' ? undefined : parseInt(draftMaxPct)
      if (minPrice != null && Number.isNaN(minPrice)) throw new Error('Min price must be a number')
      if (maxDiscountPercent != null && Number.isNaN(maxDiscountPercent)) throw new Error('Max discount must be a number')
      if (maxDiscountPercent != null && (maxDiscountPercent < 0 || maxDiscountPercent > 100)) throw new Error('Max discount must be 0–100%')
      await upsertProduct({
        shopifyProductId: it.product.id,
        productTitle: it.product.title,
        isBargainable: it.bargains.enabled,
        ...(minPrice != null ? { minPrice } : { minPrice: null }),
        ...(maxDiscountPercent != null ? { maxDiscountPercent } : { maxDiscountPercent: null }),
      })
      setCatalog(prev => prev.map(x => x.product.id === it.product.id ? {
        ...x,
        bargains: { ...x.bargains, minPrice: minPrice ?? null, maxDiscountPercent: maxDiscountPercent ?? null },
      } : x))
      setEditingId(null)
      setTxMsg({ type: 'success', text: 'Product floor updated' })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  async function bulkEnableAll(ids: CatalogItem[]) {
    setBusyId('*bulk*')
    setTxMsg(null)
    try {
      for (const it of ids) {
        await upsertProduct({ shopifyProductId: it.product.id, productTitle: it.product.title, isBargainable: true })
      }
      setCatalog(prev => prev.map(x => ({ ...x, bargains: { ...x.bargains, enabled: true } })))
      setTxMsg({ type: 'success', text: `Bargaining enabled on ${ids.length} product${ids.length === 1 ? '' : 's'}` })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  async function addManual() {
    const id = manualId.trim().replace(/^gid:\/\/shopify\/Product\//, '')
    if (!id) { setTxMsg({ type: 'error', text: 'Enter a Shopify product ID' }); return }
    setAddingManual(true)
    setTxMsg(null)
    try {
      await upsertProduct({ shopifyProductId: id, productTitle: manualTitle.trim() || undefined, isBargainable: true })
      setManualId('')
      setManualTitle('')
      setTxMsg({ type: 'success', text: 'Product override added' })
      await loadPage(null, query, false)
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message })
    } finally {
      setAddingManual(false)
    }
  }

  async function deleteOverride(id: string) {
    setBusyId(id)
    setTxMsg(null)
    try {
      const res = await fetch(`/api/bargain/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete override')
      setCatalog(prev => prev.map(it => it.product.id === id ? { ...it, bargains: { enabled: true, minPrice: null, maxDiscountPercent: null } } : it))
      setTxMsg({ type: 'success', text: 'Cleared overrides — this product now uses global settings' })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  const enabledCount = catalog.filter(it => it.bargains.enabled).length

  return (
    <div className="space-y-5">
      {/* Toolbar: search + bulk + connection note */}
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex-1 flex gap-2 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300/50" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void loadPage(null, query, false) }}
              placeholder="Search your Shopify catalog…"
              aria-label="Search products"
              className="w-full bg-slate-950 border border-blue-800/40 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder:text-blue-300/40 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => { setSearching(true); void loadPage(cursor, query, false).finally(() => setSearching(false)) }}
            disabled={loading || searching}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => void loadPage(null, '', false)}
            disabled={loading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-200 text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5"
            title="Reload catalog"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Reload</span>
          </button>
          <button
            onClick={() => { if (catalog.length) bulkEnableAll(catalog) }}
            disabled={loading || busyId === '*bulk*' || catalog.length === 0}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-1.5"
          >
            {busyId === '*bulk*' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleRight className="w-4 h-4" />}
            Enable on this page
          </button>
        </div>
      </div>

      {/* Connection banner config <-> products */}
      <div className="flex items-start gap-2.5 bg-blue-950/40 border border-blue-800/30 rounded-xl p-3.5 text-[13px] text-blue-200/90">
        <Link2 className="w-4 h-4 text-blue-300 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold text-blue-100">How Products and Config work together:</span>{' '}
          bargains here <em>override</em> the global settings for that product only. Choose which products can be
          bargained, and set a different floor (min price / max discount) per product. Products you leave untouched
          use the <span className="text-blue-100 font-medium">global fallback</span> from the Config tab
          {globalMinProfitPercent != null ? ` (min profit ${globalMinProfitPercent}%)` : ''}.
        </div>
      </div>

      {catalogError && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-xl p-3.5 text-sm text-red-200 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" /> {catalogError}
        </div>
      )}

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between text-xs text-blue-300/70">
          <button
            onClick={() => { if (prevCursor) void loadPage(prevCursor, query, false) }}
            disabled={!hasPrev || loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span>Showing page catalog</span>
          <button
            onClick={() => { if (cursor) void loadPage(cursor, query, false) }}
            disabled={!hasNext || loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-40 flex items-center gap-1"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Product list */}
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-blue-800/30 flex items-center justify-between">
          <span className="text-blue-100 font-semibold">Your Products</span>
          <span className="text-xs text-blue-300/70">
            {loading ? 'Loading…' : `${enabledCount} bargaining · ${catalog.length} shown`}
          </span>
        </div>
        {loading && catalog.length === 0 ? (
          <div className="p-6 text-center text-blue-300/60"><Loader2 className="w-5 h-5 animate-spin mr-2 inline" /> Loading catalog…</div>
        ) : catalog.length === 0 && !catalogError ? (
          <div className="p-6 text-center text-blue-300/60 text-sm">No products found. Try a different search, or add a product override manually below.</div>
        ) : (
          <div className="divide-y divide-blue-800/20">
            {catalog.map(it => {
              const p = it.product
              const busy = busyId === p.id
              const price = p.variants?.[0]?.price
              const image = p.image?.src || p.images?.[0]?.src
              const editing = editingId === p.id
              return (
                <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-800/30">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="w-11 h-11 rounded-lg object-cover border border-blue-800/40 bg-slate-950 flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg border border-blue-800/40 bg-slate-950 flex items-center justify-center text-blue-400/40 flex-shrink-0">
                      <Settings2 className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm text-white font-medium">{p.title}</div>
                    <div className="text-[11px] text-blue-300/60 truncate">
                      #{p.id} · {p.status || 'active'}{price != null ? ` · ${price}` : ''} · {p.variants?.length || 0} variants
                    </div>
                    {editing && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label className="text-[11px] text-blue-300/70">Min price</label>
                        <input
                          type="number"
                          min={0}
                          value={draftMin}
                          onChange={e => setDraftMin(e.target.value)}
                          placeholder="inherit"
                          className="w-24 bg-slate-950 border border-blue-800/40 rounded px-2 py-1 text-xs text-white"
                        />
                        <label className="text-[11px] text-blue-300/70">Max discount %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={draftMaxPct}
                          onChange={e => setDraftMaxPct(e.target.value)}
                          placeholder="inherit"
                          className="w-16 bg-slate-950 border border-blue-800/40 rounded px-2 py-1 text-xs text-white"
                        />
                        <button
                          onClick={() => void saveEdit(it)}
                          disabled={busy}
                          className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-blue-300/70 hover:text-blue-200">Cancel</button>
                      </div>
                    )}
                    {!editing && (it.bargains.minPrice != null || it.bargains.maxDiscountPercent != null) && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {it.bargains.minPrice != null && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-300">floor ₹{it.bargains.minPrice}</span>
                        )}
                        {it.bargains.maxDiscountPercent != null && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300">max {it.bargains.maxDiscountPercent}% off</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(it)}
                      disabled={busy}
                      title="Set product floor"
                      className="p-1.5 rounded hover:bg-slate-700 text-blue-300/70 hover:text-blue-100 disabled:opacity-40"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm('Clear this product\u2019s overrides and let it use global settings?')) deleteOverride(p.id) }}
                      disabled={busy}
                      title="Clear overrides"
                      className="p-1.5 rounded hover:bg-slate-700 text-red-400/80 hover:text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => void toggle(p.id, it.bargains.enabled)}
                      disabled={busy}
                      title={it.bargains.enabled ? 'Disable bargaining for this product' : 'Enable bargaining for this product'}
                      className={`p-1.5 rounded hover:bg-slate-700 ${it.bargains.enabled ? 'text-emerald-400' : 'text-slate-500'}`}
                    >
                      <span className={busy ? 'inline-block animate-spin' : ''}>
                        {it.bargains.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Orphan overrides (archived products kept on record) */}
      {orphans.length > 0 && (
        <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
          <div className="px-5 py-2.5 border-b border-blue-800/30 text-blue-100 font-semibold text-sm">
            Saved overrides not in this view ({orphans.length})
          </div>
          <div className="divide-y divide-blue-800/20">
            {orphans.map(o => (
              <div key={o.shopifyProductId} className="px-5 py-2.5 flex items-center gap-3">
                <div className="flex-1 font-mono text-xs text-blue-300/80 truncate">#{o.shopifyProductId}</div>
                <span className={`text-xs ${o.isBargainable ? 'text-emerald-300' : 'text-red-300'}`}>
                  {o.isBargainable ? 'Bargaining on' : 'Off'}
                </span>
                <button
                  onClick={() => { if (confirm('Delete this override?')) deleteOverride(o.shopifyProductId) }}
                  disabled={busyId === o.shopifyProductId}
                  className="p-1.5 rounded hover:bg-slate-700 text-red-400/80 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual add by ID */}
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-blue-100 font-semibold">
          <Plus className="w-4 h-4 text-blue-400" /> Add override by product ID
          <span className="text-[11px] font-normal text-blue-300/60 ml-1">for drafts, wholesale-only, or just-published products</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={manualId}
            onChange={e => setManualId(e.target.value)}
            placeholder="Shopify Product ID"
            aria-label="Shopify Product ID"
            className="flex-1 min-w-[180px] bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm placeholder:text-blue-300/40"
          />
          <input
            value={manualTitle}
            onChange={e => setManualTitle(e.target.value)}
            placeholder="Title (optional)"
            aria-label="Override title"
            className="flex-1 min-w-[180px] bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm placeholder:text-blue-300/40"
          />
        </div>
        <button
          onClick={addManual}
          disabled={addingManual || !manualId.trim()}
          className="flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {addingManual ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          {addingManual ? 'Adding…' : 'Add Override'}
        </button>
      </div>

      {txMsg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm ${txMsg.type === 'success' ? 'bg-emerald-950/50 border border-emerald-800/40 text-emerald-200' : 'bg-red-950/50 border border-red-800/40 text-red-200'}`}>
          {txMsg.text}
        </div>
      )}
    </div>
  )
}