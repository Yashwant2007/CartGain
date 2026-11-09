'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Search, ArrowUpDown, Mail, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'

type CartItem = {
  id: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  totalValue: number
  currency: string
  items: any[]
  isRecovered: boolean
  recoveredVia: string | null
  convertedAt: string | null
  abandonedAt: string
  createdAt: string
}

type TimelineStep = {
  index: number
  round: number
  channel: string
  scheduledAt: string
  status: 'scheduled' | 'pending' | 'sent' | 'delivered' | 'skipped' | 'failed'
  reasonCode: string | null
  sentAt: string | null
  deliveredAt: string | null
  clickedAt: string | null
  attempts: number
}

type CartTimeline = {
  nextStepIndex: number | null
  stopReason: string | null
  steps: TimelineStep[]
  campaign: {
    id: string
    name: string
    channels: string[]
    sendDelay: number
    followUpDelay: number
    maxFollowUps: number
  } | null
}

const STOP_LABELS: Record<string, string> = {
  converted: 'Stopped: the cart was purchased',
  suppressed: 'Stopped: the customer opted out',
  customer_replied: 'Stopped: the customer replied',
  expired: 'Stopped: the campaign expired',
  sequence_exhausted: 'Finished: every step was sent',
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-slate-700/40 text-blue-300/70 border-slate-600',
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  sent: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  delivered: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  skipped: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/40',
}

function formatWhen(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CartsPage() {
  const { storeId, loading: resolving, error: storeError } = useResolvedStoreId()
  const [carts, setCarts] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'abandonedAt' | 'totalValue'>('abandonedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [timelineCart, setTimelineCart] = useState<CartItem | null>(null)
  const [timeline, setTimeline] = useState<CartTimeline | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const perPage = 20

  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    shopifySessionFetch(`/api/carts?storeId=${storeId}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load carts')
        return res.json()
      })
      .then(data => setCarts(data.carts || []))
      .catch(err => {
        if (err?.name === 'AbortError') return
        setError('Failed to load carts')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [storeId])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const openTimeline = async (cart: CartItem) => {
    if (!storeId) return
    setTimelineCart(cart)
    setTimeline(null)
    setTimelineError(null)
    setTimelineLoading(true)
    try {
      const res = await shopifySessionFetch(`/api/carts/${cart.id}/timeline?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load timeline')
      const data = await res.json()
      setTimeline({
        nextStepIndex: data.nextStepIndex ?? null,
        stopReason: data.stopReason ?? null,
        steps: Array.isArray(data.steps) ? data.steps : [],
        campaign: data.campaign ?? null,
      })
    } catch {
      setTimelineError('Could not load this cart’s recovery timeline.')
    } finally {
      setTimelineLoading(false)
    }
  }

  const closeTimeline = () => {
    setTimelineCart(null)
    setTimeline(null)
    setTimelineError(null)
    setTimelineLoading(false)
  }

  const filtered = carts
    .filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        c.customerName?.toLowerCase().includes(q) ||
        c.customerEmail?.toLowerCase().includes(q) ||
        c.customerPhone?.includes(q)
      )
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      if (sortField === 'totalValue') return (a.totalValue - b.totalValue) * mul
      return (new Date(a.abandonedAt).getTime() - new Date(b.abandonedAt).getTime()) * mul
    })

  const totalPages = Math.ceil(filtered.length / perPage)
  const paged = filtered.slice(page * perPage, (page + 1) * perPage)

  const statusBadge = (c: CartItem) => {
    if (c.convertedAt) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/30 text-emerald-300 border border-emerald-500/40">Converted</span>
    if (c.isRecovered) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600/30 text-blue-300 border border-blue-500/40">Recovered</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/40 text-blue-300/70 border border-slate-600">Abandoned</span>
  }

  const channelIcon = (ch: string | null) => {
    if (!ch || ch === '-') return null
    if (ch === 'email') return <Mail className="w-3.5 h-3.5" />
    if (ch === 'whatsapp') return <MessageSquare className="w-3.5 h-3.5" />
    return <MessageSquare className="w-3.5 h-3.5" />
  }

  const isLoading = resolving || loading

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">All Carts</h1>
          <p className="text-blue-300 text-sm mt-1">Every customer who started a checkout</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            aria-label="Search carts"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="w-full pl-9 pr-3 py-2 bg-slate-800/40 border border-blue-700/30 rounded-lg text-sm text-white placeholder-blue-400/50 focus:border-blue-500/70 outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-slate-800/30 rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="bg-slate-800/40 border border-red-800/40 rounded-xl p-12 text-center">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      ) : paged.length === 0 ? (
        <div className="bg-slate-800/40 border border-blue-700/20 rounded-xl p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-blue-300/20 mx-auto mb-4" />
          <p className="text-blue-300/60">No carts found</p>
          <p className="text-sm text-blue-300/40 mt-1">Carts will appear once customers start checking out</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-800/40 border border-blue-700/20 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-blue-300/70 border-b border-blue-700/20">
                    <th className="p-4 font-medium">Customer</th>
                    <th className="p-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('totalValue')}>
                      <span className="inline-flex items-center gap-1">Total <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="p-4 font-medium">Items</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Channel</th>
                    <th className="p-4 font-medium">Sequence</th>
                    <th className="p-4 font-medium cursor-pointer select-none" onClick={() => toggleSort('abandonedAt')}>
                      <span className="inline-flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(c => (
                    <tr key={c.id} className="border-b border-blue-700/10 last:border-0 hover:bg-slate-700/20 transition-colors">
                      <td className="p-4">
                        <div className="font-medium text-white">{c.customerName || 'Guest'}</div>
                        <div className="text-blue-300/50 text-xs space-y-0.5">
                          {c.customerEmail && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.customerEmail}</div>}
                          {c.customerPhone && <div>{c.customerPhone}</div>}
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-cyan-300 whitespace-nowrap">₹{c.totalValue.toFixed(2)}</td>
                      <td className="p-4 text-blue-300/70">
                        {Array.isArray(c.items) ? (
                          <div className="flex flex-wrap gap-1">
                            {(c.items as any[]).slice(0, 3).map((item: any, i: number) => (
                              <span key={i} className="text-xs bg-slate-700/40 px-2 py-0.5 rounded">{item.name || `Item ${i+1}`}</span>
                            ))}
                            {c.items.length > 3 && <span className="text-xs text-blue-300/40">+{c.items.length - 3} more</span>}
                          </div>
                        ) : <span className="text-blue-300/40">—</span>}
                      </td>
                      <td className="p-4">{statusBadge(c)}</td>
                      <td className="p-4">
                        {c.recoveredVia ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-300/70">
                            {channelIcon(c.recoveredVia)}{c.recoveredVia.toUpperCase()}
                          </span>
                        ) : <span className="text-blue-300/40">—</span>}
                      </td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => openTimeline(c)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
                        >
                          View timeline
                        </button>
                      </td>
                      <td className="p-4 text-blue-300/60 whitespace-nowrap">{new Date(c.abandonedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page" className="p-2 rounded-lg bg-slate-800/40 border border-blue-700/20 text-blue-300/70 hover:bg-slate-700/40 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-blue-300/60 px-2">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} aria-label="Next page" className="p-2 rounded-lg bg-slate-800/40 border border-blue-700/20 text-blue-300/70 hover:bg-slate-700/40 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}

      {timelineCart && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeTimeline}
          role="dialog"
          aria-modal="true"
          aria-label="Recovery timeline"
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 border border-blue-700/30 rounded-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Recovery timeline</h2>
                <p className="text-sm text-blue-300/60">
                  {timelineCart.customerName || 'Guest'}
                  {timelineCart.customerEmail ? ` · ${timelineCart.customerEmail}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeTimeline}
                aria-label="Close timeline"
                className="p-1.5 rounded-lg text-blue-300/70 hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {timeline?.campaign && (
              <div className="text-xs text-blue-300/60">
                {timeline.campaign.name} · {timeline.campaign.channels.join(' → ')} ·{' '}
                {timeline.campaign.maxFollowUps} round{timeline.campaign.maxFollowUps === 1 ? '' : 's'} ·{' '}
                {timeline.campaign.sendDelay}m delay / {timeline.campaign.followUpDelay}m between steps
              </div>
            )}

            {timeline?.stopReason && (
              <div className="rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-blue-200">
                {STOP_LABELS[timeline.stopReason] || timeline.stopReason}
              </div>
            )}

            {timelineLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-slate-800/40 animate-pulse" />
                ))}
              </div>
            ) : timelineError ? (
              <p className="text-sm text-red-300">{timelineError}</p>
            ) : !timeline || timeline.steps.length === 0 ? (
              <p className="text-sm text-blue-300/60">No recovery steps planned yet.</p>
            ) : (
              <ol className="space-y-2">
                {timeline.steps.map((step) => {
                  const isNext = timeline.nextStepIndex === step.index
                  return (
                    <li
                      key={`${step.channel}-${step.index}`}
                      className={`rounded-lg border p-3 ${
                        isNext ? 'border-blue-500/60 bg-blue-600/10' : 'border-blue-700/20 bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                          {channelIcon(step.channel)}
                          {step.channel.toUpperCase()}
                          <span className="text-xs font-normal text-blue-300/50">
                            round {step.round + 1} · step {step.index + 1}
                          </span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                            STATUS_STYLES[step.status] || STATUS_STYLES.pending
                          }`}
                        >
                          {isNext ? 'next' : step.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-blue-300/60 space-y-0.5">
                        <div>Scheduled {formatWhen(step.scheduledAt)}</div>
                        {step.sentAt && <div>Sent {formatWhen(step.sentAt)}</div>}
                        {step.deliveredAt && <div>Delivered {formatWhen(step.deliveredAt)}</div>}
                        {step.clickedAt && <div>Clicked {formatWhen(step.clickedAt)}</div>}
                        {step.reasonCode && (
                          <div className="text-orange-300/80">Reason: {step.reasonCode}</div>
                        )}
                        {step.status === 'failed' && (
                          <div className="text-red-300/80">{step.attempts} attempt(s)</div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
