'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Settings2,
  Info,
  Link2,
  X,
  Check,
} from 'lucide-react'

type SavedOverride = {
  id: string
  shopifyProductId: string
  productTitle?: string | null
  minPrice: number | null
  minProfitPercent: number | null
  maxDiscountPercent: number | null
  isBargainable: boolean
  updatedAt?: string
}

type CatalogItem = {
  product: any
  bargains: {
    overrideId: string | null
    enabled: boolean
    minPrice: number | null
    maxDiscountPercent: number | null
  }
}

type ProductFilter = 'all' | 'bargaining' | 'paused'

const FILTERS: Array<{ id: ProductFilter; label: string }> = [
  { id: 'all', label: 'All products' },
  { id: 'bargaining', label: 'Bargaining' },
  { id: 'paused', label: 'Paused' },
]

const ROW_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40'

export function ProductCatalogPanel({
  storeId,
  globalMinProfitPercent,
}: {
  storeId: string
  globalMinProfitPercent?: number
}) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [savedOverrides, setSavedOverrides] = useState<SavedOverride[]>([])
  const [loading, setLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [pageCursor, setPageCursor] = useState<string | null>(null)
  const [prevCursor, setPrevCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [hasPrev, setHasPrev] = useState(false)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [filter, setFilter] = useState<ProductFilter>('all')
  const [busyIds, setBusyIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftMin, setDraftMin] = useState('')
  const [draftMaxPct, setDraftMaxPct] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manualId, setManualId] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [txMsg, setTxMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds(prev => (busy ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter(x => x !== id)))
  }, [])

  const loadPage = useCallback(async (nextCursor: string | null, search: string) => {
    const seq = ++requestSeq.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setCatalogError(null)
    try {
      const params = new URLSearchParams({ storeId })
      if (nextCursor) params.set('cursor', nextCursor)
      if (search.trim()) params.set('q', search.trim())
      const res = await shopifySessionFetch(`/api/bargain/products/catalog?${params.toString()}`, {
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Failed to load products')
      if (seq !== requestSeq.current) return

      setCatalog(Array.isArray(data.products) ? data.products : [])
      setSavedOverrides(Array.isArray(data.savedOverrides) ? data.savedOverrides : [])
      setPageCursor(nextCursor)
      setCursor(data.nextCursor ?? null)
      setPrevCursor(data.prevCursor ?? null)
      setHasNext(Boolean(data.nextCursor))
      setHasPrev(Boolean(data.prevCursor))
      if (data.message) setCatalogError(data.message)
    } catch (err: any) {
      if (err?.name === 'AbortError' || seq !== requestSeq.current) return
      setCatalogError(err.message ?? 'Failed to load products')
      setCatalog([])
      setSavedOverrides([])
      setPageCursor(nextCursor)
      setCursor(null)
      setPrevCursor(null)
      setHasNext(false)
      setHasPrev(false)
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void loadPage(null, '')
    return () => abortRef.current?.abort()
  }, [loadPage])

  async function upsertProduct(payload: Record<string, unknown> & { shopifyProductId: string }) {
    const res = await shopifySessionFetch('/api/bargain/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message ?? 'Failed to update product')
    return data.product as SavedOverride
  }

  function rememberOverride(product: SavedOverride | undefined) {
    if (!product) return
    setSavedOverrides(prev => [
      product,
      ...prev.filter(o => o.shopifyProductId !== product.shopifyProductId),
    ])
  }

  function syncCatalogRule(product: SavedOverride) {
    setCatalog(prev => prev.map(it => {
      if (String(it.product.id) !== String(product.shopifyProductId)) return it
      return {
        ...it,
        bargains: {
          overrideId: product.id,
          enabled: product.isBargainable,
          minPrice: product.minPrice ?? null,
          maxDiscountPercent: product.maxDiscountPercent ?? null,
        },
      }
    }))
  }

  function submitSearch(value = query) {
    const next = value.trim()
    setSubmittedQuery(next)
    setFilter('all')
    setEditingId(null)
    setTxMsg(null)
    setPageCursor(null)
    setCursor(null)
    setPrevCursor(null)
    setHasNext(false)
    setHasPrev(false)
    void loadPage(null, next)
  }

  function clearSearch() {
    setQuery('')
    setSubmittedQuery('')
    setFilter('all')
    setTxMsg(null)
    setPageCursor(null)
    setCursor(null)
    setPrevCursor(null)
    setHasNext(false)
    setHasPrev(false)
    void loadPage(null, '')
  }

  async function toggleProduct(item: CatalogItem) {
    const id = String(item.product.id)
    const next = !item.bargains.enabled
    markBusy(id, true)
    setTxMsg(null)
    try {
      const product = await upsertProduct({
        shopifyProductId: id,
        productTitle: item.product.title,
        isBargainable: next,
      })
      syncCatalogRule(product)
      rememberOverride(product)
      setTxMsg({
        type: 'success',
        text: next
          ? `${item.product.title} is available for bargaining`
          : `${item.product.title} is paused`,
      })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message ?? 'Could not update this product' })
    } finally {
      markBusy(id, false)
    }
  }

  async function bulkSet(enable: boolean) {
    const targets = catalog.filter(it => it.bargains.enabled !== enable)
    if (targets.length === 0) return
    if (!enable && !confirm(`Pause bargaining on ${targets.length} product${targets.length === 1 ? '' : 's'} on this page?`)) {
      return
    }
    markBusy('__bulk__', true)
    setTxMsg(null)
    try {
      const res = await shopifySessionFetch('/api/bargain/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          products: targets.map(it => ({
            shopifyProductId: String(it.product.id),
            productTitle: it.product.title,
            isBargainable: enable,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? 'Failed to update products')
      const updated: SavedOverride[] = Array.isArray(data.products) ? data.products : []
      for (const product of updated) {
        syncCatalogRule(product)
        rememberOverride(product)
      }
      setTxMsg({
        type: 'success',
        text: `${enable ? 'Enabled' : 'Paused'} ${targets.length} product${targets.length === 1 ? '' : 's'} on this page`,
      })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message ?? 'Could not update these products' })
    } finally {
      markBusy('__bulk__', false)
    }
  }

  function startEdit(item: CatalogItem) {
    setEditingId(String(item.product.id))
    setDraftMin(item.bargains.minPrice != null ? String(item.bargains.minPrice) : '')
    setDraftMaxPct(item.bargains.maxDiscountPercent != null ? String(item.bargains.maxDiscountPercent) : '')
    setTxMsg(null)
  }

  async function saveEdit(item: CatalogItem) {
    const id = String(item.product.id)
    markBusy(id, true)
    setTxMsg(null)
    try {
      const minPrice = draftMin.trim() === '' ? null : parseFloat(draftMin)
      const maxDiscountPercent = draftMaxPct.trim() === '' ? null : parseInt(draftMaxPct, 10)
      if (minPrice != null && (!Number.isFinite(minPrice) || minPrice <= 0)) {
        throw new Error('Minimum price must be greater than 0')
      }
      if (maxDiscountPercent != null && (!Number.isInteger(maxDiscountPercent) || maxDiscountPercent < 0 || maxDiscountPercent > 100)) {
        throw new Error('Max discount must be a whole number from 0 to 100')
      }
      const product = await upsertProduct({
        shopifyProductId: id,
        productTitle: item.product.title,
        isBargainable: item.bargains.enabled,
        minPrice,
        maxDiscountPercent,
      })
      syncCatalogRule(product)
      rememberOverride(product)
      setEditingId(null)
      setTxMsg({ type: 'success', text: `Price rule saved for ${item.product.title}` })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message ?? 'Could not save this price rule' })
    } finally {
      markBusy(id, false)
    }
  }

  async function toggleSavedOverride(override: SavedOverride) {
    const id = String(override.shopifyProductId)
    const next = !override.isBargainable
    markBusy(id, true)
    setTxMsg(null)
    try {
      const product = await upsertProduct({
        shopifyProductId: id,
        productTitle: override.productTitle || undefined,
        isBargainable: next,
      })
      syncCatalogRule(product)
      rememberOverride(product)
      setTxMsg({
        type: 'success',
        text: next
          ? `${override.productTitle || `Product #${id}`} is available for bargaining`
          : `${override.productTitle || `Product #${id}`} is paused`,
      })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message ?? 'Could not update this product' })
    } finally {
      markBusy(id, false)
    }
  }

  async function deleteOverride(shopifyProductId: string, overrideId?: string | null) {
    markBusy(shopifyProductId, true)
    setTxMsg(null)
    try {
      const params = new URLSearchParams({ storeId })
      if (overrideId) params.set('id', overrideId)
      else params.set('shopifyProductId', shopifyProductId)
      const res = await shopifySessionFetch(`/api/bargain/products?${params.toString()}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? 'Failed to reset this product')
      setCatalog(prev => prev.map(it => (
        String(it.product.id) === shopifyProductId
          ? { ...it, bargains: { overrideId: null, enabled: true, minPrice: null, maxDiscountPercent: null } }
          : it
      )))
      setSavedOverrides(prev => prev.filter(o => o.shopifyProductId !== shopifyProductId))
      setEditingId(current => (current === shopifyProductId ? null : current))
      setTxMsg({ type: 'success', text: 'Product rule reset — this product uses the default bargaining settings again' })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message ?? 'Could not reset this product' })
    } finally {
      markBusy(shopifyProductId, false)
    }
  }

  async function addManual() {
    const id = manualId.trim().replace(/^gid:\/\/shopify\/Product\//, '')
    if (!/^\d+$/.test(id)) {
      setTxMsg({ type: 'error', text: 'Enter the numeric Shopify product ID' })
      return
    }
    setAddingManual(true)
    setTxMsg(null)
    try {
      const product = await upsertProduct({
        shopifyProductId: id,
        productTitle: manualTitle.trim() || undefined,
        isBargainable: true,
      })
      syncCatalogRule(product)
      rememberOverride(product)
      setManualId('')
      setManualTitle('')
      setShowManual(false)
      setTxMsg({ type: 'success', text: `${product.productTitle || `Product #${id}`} is available for bargaining` })
    } catch (err: any) {
      setTxMsg({ type: 'error', text: err.message ?? 'Could not add this product' })
    } finally {
      setAddingManual(false)
    }
  }

  const enabledCount = catalog.filter(it => it.bargains.enabled).length
  const pausedCount = catalog.length - enabledCount
  const bulkBusy = busyIds.includes('__bulk__')
  const visibleCatalog = catalog.filter(it => {
    if (filter === 'bargaining') return it.bargains.enabled
    if (filter === 'paused') return !it.bargains.enabled
    return true
  })
  const visibleIds = new Set(catalog.map(it => String(it.product.id)))
  const hiddenSavedOverrides = savedOverrides.filter(o => !visibleIds.has(String(o.shopifyProductId)))
  const isFiltered = filter !== 'all'
  const isSearching = submittedQuery.length > 0

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-blue-700/40 bg-blue-950/50 p-2.5 text-blue-300">
              <ToggleRight className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-blue-50">Choose which products can bargain</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-blue-300/70">
                Every Shopify product is bargainable by default. Toggle a product off to pause it, or
                open <span className="font-medium text-blue-200">Floor</span> to give it its own minimum
                price or maximum discount.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-800/50 bg-emerald-950/50 px-2.5 py-1 font-medium text-emerald-300">
              {enabledCount} bargaining
            </span>
            <span className="rounded-full border border-slate-700/60 bg-slate-950/60 px-2.5 py-1 font-medium text-slate-300">
              {pausedCount} paused
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-blue-800/30 bg-blue-950/25 p-3 text-[12.5px] leading-relaxed text-blue-200/85 sm:flex-row sm:items-start">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
          <p>
            Product rules override the global floor from Config
            {globalMinProfitPercent != null ? ` (currently ${globalMinProfitPercent}% minimum profit)` : ''}.
            Leave a floor blank to inherit the global rule.
          </p>
        </div>
      </div>

      {txMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            txMsg.type === 'success'
              ? 'border-emerald-800/40 bg-emerald-950/50 text-emerald-200'
              : 'border-red-800/40 bg-red-950/50 text-red-200'
          }`}
        >
          {txMsg.type === 'success'
            ? <Check className="mt-0.5 h-4 w-4 shrink-0" />
            : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{txMsg.text}</span>
          <button onClick={() => setTxMsg(null)} aria-label="Dismiss message" className="rounded p-0.5 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {catalogError && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-800/40 bg-red-950/40 p-4 text-sm text-red-200 sm:flex-row sm:items-center">
          <Info className="h-4 w-4 shrink-0" />
          <span className="flex-1">{catalogError}</span>
          <button
            onClick={() => void loadPage(pageCursor, submittedQuery)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-700/50 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/40 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Try again
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={e => { e.preventDefault(); submitSearch() }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-300/50" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search products by title or product ID…"
                aria-label="Search products"
                className="w-full rounded-lg border border-blue-800/40 bg-slate-950 py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-blue-300/40 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); if (isSearching) clearSearch() }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-blue-300/50 hover:text-blue-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="hidden sm:inline">Search</span>
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadPage(pageCursor, submittedQuery)}
              disabled={loading}
              className={`${ROW_BTN} border border-blue-800/40 bg-slate-800 text-blue-200 hover:bg-slate-700`}
              title="Refresh this page"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => void bulkSet(true)}
              disabled={loading || bulkBusy || catalog.length === pausedCount || catalog.length === 0}
              className={`${ROW_BTN} bg-emerald-600 text-white hover:bg-emerald-500`}
              title="Enable bargaining for every paused product on this page"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ToggleRight className="h-4 w-4" />}
              Enable page
            </button>
            <button
              onClick={() => void bulkSet(false)}
              disabled={loading || bulkBusy || enabledCount === 0}
              className={`${ROW_BTN} border border-slate-700/60 bg-slate-950 text-slate-300 hover:bg-slate-800`}
              title="Pause bargaining for every enabled product on this page"
            >
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ToggleLeft className="h-4 w-4" />}
              Pause page
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-blue-800/20 pt-3">
          {FILTERS.map(f => {
            const count = f.id === 'all' ? catalog.length : f.id === 'bargaining' ? enabledCount : pausedCount
            const active = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'bg-blue-500/20 text-blue-100 ring-1 ring-blue-400/40'
                    : 'text-blue-300/60 hover:bg-slate-800/70 hover:text-blue-200'
                }`}
              >
                {f.label} <span className="opacity-60">{count}</span>
              </button>
            )
          })}
          {isSearching && (
            <button onClick={clearSearch} className="ml-auto inline-flex items-center gap-1 text-xs text-blue-300/70 hover:text-blue-100">
              <X className="h-3.5 w-3.5" /> Clear search for “{submittedQuery}”
            </button>
          )}
        </div>
      </div>

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between text-xs text-blue-300/70">
          <button
            onClick={() => { if (prevCursor) void loadPage(prevCursor, submittedQuery) }}
            disabled={!hasPrev || loading}
            className={`${ROW_BTN} bg-slate-800 text-blue-200 hover:bg-slate-700`}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span>Catalog page</span>
          <button
            onClick={() => { if (cursor) void loadPage(cursor, submittedQuery) }}
            disabled={!hasNext || loading}
            className={`${ROW_BTN} bg-slate-800 text-blue-200 hover:bg-slate-700`}
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-blue-800/30 bg-slate-900/60">
        <div className="flex items-center justify-between gap-3 border-b border-blue-800/30 px-4 py-3 sm:px-5">
          <div>
            <span className="font-semibold text-blue-100">Your catalog</span>
            <span className="ml-2 text-xs text-blue-300/60">
              {isSearching ? `Results for “${submittedQuery}”` : 'This page'}
            </span>
          </div>
          <span className="text-xs text-blue-300/70">
            {loading ? 'Loading…' : `${visibleCatalog.length} shown · ${enabledCount} of ${catalog.length} bargaining`}
          </span>
        </div>

        {loading && catalog.length === 0 ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex animate-pulse items-center gap-3">
                <div className="h-11 w-11 rounded-lg bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 rounded bg-slate-800" />
                  <div className="h-2.5 w-1/2 rounded bg-slate-800/70" />
                </div>
                <div className="h-8 w-20 rounded-lg bg-slate-800" />
              </div>
            ))}
          </div>
        ) : visibleCatalog.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-blue-300/70">
              {isFiltered
                ? `No ${filter === 'paused' ? 'paused' : 'bargaining'} products on this page.`
                : isSearching
                  ? `No products found for “${submittedQuery}”.`
                  : 'No products found in your Shopify catalog.'}
            </p>
            {(isFiltered || isSearching) && (
              <button
                onClick={() => { setFilter('all'); if (isSearching) clearSearch() }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-slate-700"
              >
                <X className="h-3.5 w-3.5" /> Show all products
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-blue-800/20">
            {visibleCatalog.map(item => {
              const p = item.product
              const id = String(p.id)
              const busy = busyIds.includes(id) || bulkBusy
              const price = p.variants?.[0]?.price
              const image = p.image?.src || p.images?.[0]?.src
              const editing = editingId === id
              const enabled = item.bargains.enabled
              const hasFloor = item.bargains.minPrice != null || item.bargains.maxDiscountPercent != null
              return (
                <div key={id} className="px-4 py-3 transition hover:bg-slate-800/25 sm:px-5">
                  <div className="flex items-start gap-3">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-blue-800/40 bg-slate-950 object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-800/40 bg-slate-950 text-blue-400/40">
                        <Settings2 className="h-5 w-5" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">{p.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          enabled
                            ? 'bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-800/50'
                            : 'bg-slate-950/70 text-slate-400 ring-1 ring-slate-700/60'
                        }`}>
                          {enabled ? 'Bargaining' : 'Paused'}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-blue-300/60">
                        #{id} · {p.status || 'active'}{price != null ? ` · ${price}` : ''} · {p.variants?.length || 0} variant{(p.variants?.length || 0) === 1 ? '' : 's'}
                      </div>
                      {!editing && hasFloor && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {item.bargains.minPrice != null && (
                            <span className="rounded bg-indigo-900/40 px-1.5 py-0.5 text-[10px] text-indigo-300">
                              Min price {item.bargains.minPrice}
                            </span>
                          )}
                          {item.bargains.maxDiscountPercent != null && (
                            <span className="rounded bg-purple-900/40 px-1.5 py-0.5 text-[10px] text-purple-300">
                              Max {item.bargains.maxDiscountPercent}% off
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => startEdit(item)}
                        disabled={busy}
                        title="Set a minimum price or maximum discount for this product"
                        className={`${ROW_BTN} text-blue-300/75 hover:bg-slate-700 hover:text-blue-100`}
                      >
                        <Settings2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Floor</span>
                      </button>
                      {item.bargains.overrideId && (
                        <button
                          onClick={() => {
                            if (confirm('Reset this product to the default bargaining rule?')) {
                              void deleteOverride(id, item.bargains.overrideId)
                            }
                          }}
                          disabled={busy}
                          title="Reset this product rule"
                          aria-label={`Reset product rule for ${p.title}`}
                          className={`${ROW_BTN} text-red-400/80 hover:bg-red-950/40 hover:text-red-300`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => void toggleProduct(item)}
                        disabled={busy}
                        role="switch"
                        aria-checked={enabled}
                        aria-label={enabled ? `Pause bargaining for ${p.title}` : `Enable bargaining for ${p.title}`}
                        className={`rounded-lg p-1.5 transition hover:bg-slate-700 ${
                          enabled ? 'text-emerald-400' : 'text-slate-500'
                        } disabled:opacity-40`}
                      >
                        {busy
                          ? <Loader2 className="h-6 w-6 animate-spin" />
                          : enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                      </button>
                    </div>
                  </div>

                  {editing && (
                    <div className="mt-3 rounded-xl border border-blue-800/40 bg-slate-950/50 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-blue-200">
                            Minimum price
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draftMin}
                            onChange={e => setDraftMin(e.target.value)}
                            placeholder="Use global rule"
                            className="w-full rounded-lg border border-blue-800/40 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-blue-300/35 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-blue-200">
                            Max discount (%)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={draftMaxPct}
                            onChange={e => setDraftMaxPct(e.target.value)}
                            placeholder="Use global rule"
                            className="w-full rounded-lg border border-blue-800/40 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-blue-300/35 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-blue-300/55">
                        Leave both blank to inherit the global floor. The customer never sees these numbers.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => void saveEdit(item)}
                          disabled={busy}
                          className={`${ROW_BTN} bg-emerald-600 text-white hover:bg-emerald-500`}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Save rule
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className={`${ROW_BTN} border border-blue-800/40 text-blue-300/75 hover:bg-slate-800 hover:text-blue-100`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {hiddenSavedOverrides.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-blue-800/30 bg-slate-900/60">
          <div className="border-b border-blue-800/30 px-4 py-3 sm:px-5">
            <span className="font-semibold text-blue-100">Saved rules outside this page</span>
            <span className="ml-2 text-xs text-blue-300/60">({hiddenSavedOverrides.length})</span>
            <p className="mt-1 text-[11px] leading-relaxed text-blue-300/55">
              Products on other catalog pages, or archived products with a saved pause/floor rule.
            </p>
          </div>
          <div className="divide-y divide-blue-800/20">
            {hiddenSavedOverrides.map(o => {
              const busy = busyIds.includes(String(o.shopifyProductId)) || bulkBusy
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-blue-100">
                      {o.productTitle || `Product #${o.shopifyProductId}`}
                    </div>
                    <div className="truncate text-[10px] text-blue-300/55">
                      #{o.shopifyProductId}
                      {o.minPrice != null ? ` · min ${o.minPrice}` : ''}
                      {o.maxDiscountPercent != null ? ` · max ${o.maxDiscountPercent}% off` : ''}
                    </div>
                  </div>
                  <span className={`hidden text-xs sm:inline ${o.isBargainable ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {o.isBargainable ? 'Bargaining' : 'Paused'}
                  </span>
                  <button
                    onClick={() => void toggleSavedOverride(o)}
                    disabled={busy}
                    role="switch"
                    aria-checked={o.isBargainable}
                    aria-label={o.isBargainable
                      ? `Pause bargaining for ${o.productTitle || o.shopifyProductId}`
                      : `Enable bargaining for ${o.productTitle || o.shopifyProductId}`}
                    className={`rounded-lg p-1.5 transition hover:bg-slate-700 ${
                      o.isBargainable ? 'text-emerald-400' : 'text-slate-500'
                    } disabled:opacity-40`}
                  >
                    {busy
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : o.isBargainable ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Reset this product to the default bargaining rule?')) {
                        void deleteOverride(String(o.shopifyProductId), o.id)
                      }
                    }}
                    disabled={busy}
                    aria-label={`Reset product rule for ${o.productTitle || o.shopifyProductId}`}
                    className={`${ROW_BTN} text-red-400/80 hover:bg-red-950/40 hover:text-red-300`}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60">
        <button
          onClick={() => setShowManual(v => !v)}
          aria-expanded={showManual}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-blue-100 hover:bg-slate-800/30 sm:px-5"
        >
          <Plus className="h-4 w-4 text-blue-400" />
          Add a product by ID
          <span className="ml-1 hidden text-[11px] font-normal text-blue-300/55 sm:inline">
            for drafts, wholesale-only, or just-published products
          </span>
          <ChevronDown className={`ml-auto h-4 w-4 text-blue-300/60 transition ${showManual ? 'rotate-180' : ''}`} />
        </button>
        {showManual && (
          <div className="space-y-3 border-t border-blue-800/30 px-4 py-4 sm:px-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                placeholder="Shopify product ID, e.g. 15447759323501"
                aria-label="Shopify product ID"
                className="w-full rounded-lg border border-blue-800/40 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-blue-300/35 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <input
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                placeholder="Product title (optional)"
                aria-label="Product title"
                className="w-full rounded-lg border border-blue-800/40 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-blue-300/35 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void addManual()}
                disabled={addingManual || !manualId.trim()}
                className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {addingManual ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {addingManual ? 'Adding…' : 'Add to bargaining'}
              </button>
              <button
                onClick={() => { setShowManual(false); setManualId(''); setManualTitle('') }}
                className="rounded-lg px-3 py-2 text-sm text-blue-300/70 hover:text-blue-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
