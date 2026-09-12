'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import {
  ShieldCheck,
  Download,
  Loader2,
  FileJson,
  RotateCcw,
  ClipboardList,
  Bell,
} from 'lucide-react'

type ExportRow = {
  id: string
  shopifyCustomerId: string | null
  email: string | null
  status: string
  requestedAt: string
  createdAt: string
}

type AccessLog = {
  id: string
  actorType: string
  action: string
  resourceType: string
  resourceId: string | null
  purpose: string
  metadata: any
  createdAt: string
}

export default function DataProtectionPage() {
  const router = useRouter()
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [exports, setExports] = useState<ExportRow[]>([])
  const [logs, setLogs] = useState<AccessLog[]>([])
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) return
    void fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  async function fetchData() {
    setLoading(true)
    setPageError(null)
    try {
      const res = await fetch(`/api/data-protection?storeId=${storeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to load data')
      setExports(data.exports || [])
      setLogs(data.logs || [])
    } catch (err: any) {
      setPageError(err.message ?? 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  if (resolvingStore) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="ml-3 text-blue-200">Loading data protection…</span>
      </div>
    )
  }
  if (storeError) {
    return <div className="text-amber-200">{storeError}</div>
  }
  if (!storeId) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center">
          <ShieldCheck className="w-6 h-6 mr-2 text-emerald-400" />
          Data & Privacy
        </h1>
        <p className="text-blue-300/70 text-sm mt-1">
          Preview and download customer data we hold, and audit how it&apos;s been accessed. Full deletion happens
          automatically via Shopify lifecycle webhooks (uninstall, shop/redact, customers/redact).
        </p>
      </div>

      {pageError && (
        <div className="flex items-center justify-between bg-red-950/50 border border-red-800/40 rounded-xl p-4 text-sm text-red-200">
          <span>{pageError}</span>
          <button onClick={() => fetchData()} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-200 text-xs font-medium">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </button>
        </div>
      )}

      {/* Exports */}
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-blue-800/30 flex items-center justify-between">
          <span className="text-blue-100 font-semibold flex items-center">
            <FileJson className="w-4 h-4 mr-2 text-blue-400" /> Customer data exports
            <span className="ml-2 text-[11px] font-normal text-blue-300/50">created on customers/data_request</span>
          </span>
          <span className="text-xs text-blue-300/70">{loading ? 'Loading…' : `${exports.length} export${exports.length === 1 ? '' : 's'}`}</span>
        </div>
        {loading && exports.length === 0 ? (
          <div className="p-6 text-center text-blue-300/60"><Loader2 className="w-5 h-5 animate-spin mr-2 inline" /> Loading…</div>
        ) : exports.length === 0 ? (
          <div className="p-6 text-blue-300/60 text-sm">
            No exports yet. When a customer asks for their data, Shopify sends a <code className="text-blue-200">customers/data_request</code>
            &nbsp;webhook, CartGain gathers the records it holds and lists them here for you to download and forward.
          </div>
        ) : (
          <div className="divide-y divide-blue-800/20">
            {exports.map(e => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    {e.email ? (
                      <>
                        {e.email}
                        {e.shopifyCustomerId && <span className="text-blue-300/50 font-mono text-xs ml-2">#{e.shopifyCustomerId}</span>}
                      </>
                    ) : (
                      <span className="font-mono text-xs text-blue-200">Customer #{e.shopifyCustomerId ?? 'unknown'}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-blue-300/60">
                    Requested {new Date(e.requestedAt).toLocaleString()} · Export {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  e.status === 'delivered' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-blue-900/40 text-blue-300'
                }`}>
                  {e.status}
                </span>
                <a
                  href={`/api/data-protection/export?id=${e.id}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
                  download
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Download JSON
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Access logs */}
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-blue-800/30 flex items-center justify-between">
          <span className="text-blue-100 font-semibold flex items-center">
            <ClipboardList className="w-4 h-4 mr-2 text-blue-400" /> Data access history
            <span className="ml-2 text-[11px] font-normal text-blue-300/50">last 50 events · auto-deleted after 180 days</span>
          </span>
        </div>
        {loading && logs.length === 0 ? (
          <div className="p-6 text-center text-blue-300/60"><Loader2 className="w-5 h-5 animate-spin mr-2 inline" /> Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-blue-300/60 text-sm">No access events recorded for your account yet.</div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-blue-800/20">
            {logs.map(l => (
              <div key={l.id} className="px-5 py-2.5 flex items-center gap-3">
                <Bell className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-blue-100 truncate">
                    <span className={`uppercase text-[10px] font-bold mr-2 ${
                      l.action === 'delete' ? 'text-red-400' : l.action === 'access' ? 'text-amber-300' : 'text-blue-300'
                    }`}>{l.action}</span>
                    <span className="text-blue-300/80">{l.resourceType}</span>
                    {l.resourceId && <span className="font-mono text-[11px] text-blue-300/50 ml-1.5">#{l.resourceId.slice(0, 10)}</span>}
                  </div>
                  <div className="text-[11px] text-blue-300/50 truncate">{l.purpose}</div>
                </div>
                <div className="text-[11px] text-blue-300/50 flex-shrink-0">{new Date(l.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-5 grid sm:grid-cols-3 gap-4 text-[13px] text-blue-200/90">
        <div>
          <div className="font-semibold text-blue-100 mb-1">Uninstalled?</div>
          app/uninstalled + shop/redact purge all your store&apos;s data automatically.
        </div>
        <div>
          <div className="font-semibold text-blue-100 mb-1">Customer deletion</div>
          A customers/redact request deletes that customer&apos;s carts, messages, insights, bargain sessions and exports.
        </div>
        <div>
          <div className="font-semibold text-blue-100 mb-1">Retention</div>
          Cart PII anonymized after 90 days, bargain sessions after 90, access logs + exports after 180. Opt-out records are kept as consent records.
        </div>
      </div>
    </div>
  )
}