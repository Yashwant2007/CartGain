'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Search, ArrowUpDown, Mail, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

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

export default function CartsPage() {
  const { storeId, loading: resolving, error: storeError } = useResolvedStoreId()
  const [carts, setCarts] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'abandonedAt' | 'totalValue'>('abandonedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const perPage = 20

  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    fetch(`/api/carts?storeId=${storeId}`)
      .then(res => res.ok ? res.json() : { carts: [] })
      .then(data => setCarts(data.carts || []))
      .catch(() => setCarts([]))
      .finally(() => setLoading(false))
  }, [storeId])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
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
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="w-full pl-9 pr-3 py-2 bg-slate-800/40 border border-blue-700/30 rounded-lg text-sm text-white placeholder-blue-400/50 focus:border-blue-500/70 outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-slate-800/30 rounded-xl animate-pulse" />)}</div>
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
                      <td className="p-4 text-blue-300/60 whitespace-nowrap">{new Date(c.abandonedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 rounded-lg bg-slate-800/40 border border-blue-700/20 text-blue-300/70 hover:bg-slate-700/40 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-blue-300/60 px-2">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-2 rounded-lg bg-slate-800/40 border border-blue-700/20 text-blue-300/70 hover:bg-slate-700/40 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
