'use client'

import { useEffect, useState } from 'react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import {
  AlertCircle,
  IndianRupee,
  Info,
  Loader2,
  MessageSquare,
  MousePointerClick,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react'

type ConceptRow = {
  key: string
  label: string
  impressions: number
  clicks: number
  chatOpens: number
  uniqueVisitors: number
  ctr: number
  clickToChatRate: number
  sessions: number
  negotiated: number
  offered: number
  accepted: number
  issued: number
  purchased: number
  netPurchases: number
  revenue: number
  grossRevenue: number
  refundedRevenue: number
  refundedPurchases: number
  avgDiscountPercent: number
  sessionAcceptRate: number
  purchaseRate: number
  endToEndRate: number
  evidence: 'sufficient' | 'directional' | 'insufficient'
}

type Performance = {
  windowDays: number
  funnel: { started: number; accepted: number; purchased: number; revenue: number; grossRevenue: number; refundedRevenue: number; fullyRefundedPurchases: number }
  experience: {
    impressions: number
    clicks: number
    chatOpens: number
    uniqueVisitors: number
    ctr: number
    clickToChatRate: number
    chatToSessionRate: number
    impressionToChatRate: number
    impressionToPurchaseRate: number
    designs: ConceptRow[]
    personalities: ConceptRow[]
    attribution: {
      acceptedSessions: number
      attributedPurchases: number
      netPurchases: number
      fullyRefundedPurchases: number
      grossRevenue: number
      refundedRevenue: number
      attributedRevenue: number
      acceptedPurchaseRate: number
      note: string
    }
  }
}

const DAY_OPTIONS = [7, 30, 90]

export function StorefrontPerformance() {
  const { storeId } = useResolvedStoreId()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Performance | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(showSpinner = true) {
    if (!storeId) return
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const res = await shopifySessionFetch(`/api/analytics/bargain?storeId=${storeId}&days=${days}`)
      if (!res.ok) throw new Error(`Failed to load storefront performance (HTTP ${res.status})`)
      setData(await res.json())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load storefront performance')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, days])

  if (!storeId) return null
  if (loading && !data) {
    return (
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-6 text-blue-300/70 text-sm flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading storefront performance…
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-slate-900/60 border border-red-800/40 rounded-xl p-6 text-red-300 text-sm flex items-center gap-2">
        <AlertCircle className="w-4 h-4" /> {error}
        <button onClick={() => load()} className="ml-auto px-3 py-1.5 rounded-lg border border-red-700/50 text-red-200">Retry</button>
      </div>
    )
  }

  const exp = data?.experience
  const empty = !exp || (exp.impressions === 0 && exp.chatOpens === 0 && (data?.funnel.started ?? 0) === 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" /> Storefront Performance
          </h2>
          <p className="text-sm text-blue-300/70 mt-1">
            Qualified invitation impressions → clicks → chats → verified purchases. Preview activity is excluded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-blue-800/40 overflow-hidden">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setDays(option)}
                className={`px-3 py-1.5 text-xs font-medium transition ${days === option ? 'bg-cyan-700/60 text-white' : 'text-blue-300/70 hover:text-white'}`}
              >
                {option}d
              </button>
            ))}
          </div>
          <button onClick={() => load()} disabled={loading} className="p-2 rounded-lg border border-blue-800/40 text-blue-200 hover:text-white disabled:opacity-50" aria-label="Refresh performance">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-8 text-center">
          <MousePointerClick className="w-8 h-8 text-blue-400/60 mx-auto mb-3" />
          <div className="text-white font-medium">No storefront experience data yet</div>
          <p className="text-sm text-blue-300/60 mt-1 max-w-xl mx-auto">
            Publish a Bargain Experience so the invitation is shown first. Qualified impressions and clicks will appear here within a few minutes.
          </p>
        </div>
      ) : exp && data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric icon={MousePointerClick} label="Invitation impressions" value={exp.impressions.toLocaleString('en-IN')} hint={`${exp.uniqueVisitors} unique visitors`} />
            <Metric icon={MousePointerClick} label="Click-through rate" value={`${exp.ctr}%`} hint={`${exp.clicks} invitation clicks`} />
            <Metric icon={MessageSquare} label="Chats opened" value={exp.chatOpens.toLocaleString('en-IN')} hint={`${exp.clickToChatRate}% of clicks`} />
            <Metric icon={ShoppingBag} label="Purchases" value={exp.attribution.attributedPurchases.toLocaleString('en-IN')} hint={`${exp.impressionToPurchaseRate}% of impressions`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-900/60 border border-blue-800/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-medium">Storefront funnel</h3>
                <span className="text-xs text-blue-300/50">Last {data.windowDays} days</span>
              </div>
              <Funnel exp={exp} funnel={data.funnel} />
            </div>

            <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5 space-y-3">
              <h3 className="text-white font-medium flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-emerald-400" /> Attribution</h3>
              <div className="text-3xl font-bold text-emerald-300">₹{exp.attribution.attributedRevenue.toLocaleString('en-IN')}</div>
              <div className="text-xs text-blue-300/50">net after refunds</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-blue-300/70">
                <div>Gross <span className="text-blue-100">₹{exp.attribution.grossRevenue.toLocaleString('en-IN')}</span></div>
                <div>Refunded <span className="text-amber-300">₹{exp.attribution.refundedRevenue.toLocaleString('en-IN')}</span></div>
              </div>
              <div className="text-sm text-blue-200">
                {exp.attribution.attributedPurchases} of {exp.attribution.acceptedSessions} accepted bargains purchased
                <span className="text-blue-300/60"> ({exp.attribution.acceptedPurchaseRate}%)</span>
              </div>
              {exp.attribution.fullyRefundedPurchases > 0 && (
                <div className="text-xs text-amber-300/80">{exp.attribution.fullyRefundedPurchases} fully refunded · {exp.attribution.netPurchases} net purchases</div>
              )}
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, exp.attribution.acceptedPurchaseRate)}%` }} />
              </div>
              <p className="text-xs text-blue-300/60 flex gap-2"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {exp.attribution.note}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric icon={IndianRupee} label="Gross bargain revenue" value={`₹${data.funnel.grossRevenue.toLocaleString('en-IN')}`} hint={`${exp.attribution.attributedPurchases} attributed orders`} />
            <Metric icon={IndianRupee} label="Net bargain revenue" value={`₹${data.funnel.revenue.toLocaleString('en-IN')}`} hint={`₹${data.funnel.refundedRevenue.toLocaleString('en-IN')} refunded`} />
            <Metric icon={ShoppingBag} label="Net purchases" value={`${exp.attribution.netPurchases}`} hint={`${exp.attribution.fullyRefundedPurchases} fully refunded`} />
            <Metric icon={MessageSquare} label="Chat → session" value={`${exp.chatToSessionRate}%`} hint={`${data.funnel.started} bargain sessions`} />
          </div>

          <ConceptTable title="Invitation designs" rows={exp.designs} empty="No design telemetry yet." />
          <ConceptTable title="Shopkeeper personalities" rows={exp.personalities} empty="No personality telemetry yet." />

          <div className="text-xs text-blue-300/50 flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Design and personality are resolved server-side at the time of the published snapshot. Old sessions without an experience snapshot are grouped as “unknown”. Evidence needs 200 impressions, 30 sessions and 3 purchases before it is considered sufficient.
          </div>
        </>
      ) : null}
    </div>
  )
}

function Metric({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint: string }) {
  return (
    <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
      <div className="flex items-center gap-2 text-blue-300/70 text-xs uppercase tracking-wide"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-2xl font-bold text-white mt-2">{value}</div>
      <div className="text-xs text-blue-300/50 mt-1">{hint}</div>
    </div>
  )
}

function Funnel({ exp, funnel }: { exp: Performance['experience']; funnel: Performance['funnel'] }) {
  const stages = [
    { label: 'Impressions', value: exp.impressions },
    { label: 'Clicks', value: exp.clicks, rate: exp.ctr },
    { label: 'Chat opens', value: exp.chatOpens, rate: exp.clickToChatRate },
    { label: 'Bargain sessions', value: funnel.started, rate: exp.chatToSessionRate },
    { label: 'Accepted', value: funnel.accepted, rate: funnel.started > 0 ? Math.round((funnel.accepted / funnel.started) * 1000) / 10 : 0 },
    { label: 'Purchased', value: funnel.purchased, rate: funnel.started > 0 ? Math.round((funnel.purchased / funnel.started) * 1000) / 10 : 0 },
  ]
  const max = Math.max(1, ...stages.map((stage) => stage.value))
  return (
    <div className="space-y-2.5">
      {stages.map((stage, index) => (
        <div key={stage.label} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs text-blue-300/70">{stage.label}</div>
          <div className="flex-1 h-7 rounded-md bg-slate-950/60 overflow-hidden">
            <div
              className="h-full rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-500/60 flex items-center justify-end pr-2 text-[11px] font-semibold text-white"
              style={{ width: `${Math.max(stage.value > 0 ? 4 : 0, (stage.value / max) * 100)}%` }}
            >
              {stage.value > 0 ? stage.value.toLocaleString('en-IN') : ''}
            </div>
          </div>
          <div className="w-16 shrink-0 text-right text-xs text-blue-300/60">
            {index === 0 ? '—' : `${stage.rate ?? 0}%`}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConceptTable({ title, rows, empty }: { title: string; rows: ConceptRow[]; empty: string }) {
  return (
    <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-blue-800/30 text-blue-100 font-semibold">{title}</div>
      {rows.length === 0 ? (
        <div className="p-5 text-blue-300/60 text-sm">{empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-blue-300/80">
              <tr>
                <th className="text-left px-4 py-2">Variant</th>
                <th className="text-right px-4 py-2">Impressions</th>
                <th className="text-right px-4 py-2">CTR</th>
                <th className="text-right px-4 py-2">Chats</th>
                <th className="text-right px-4 py-2">Sessions</th>
                <th className="text-right px-4 py-2">Accepted</th>
                <th className="text-right px-4 py-2">Purchased</th>
                <th className="text-right px-4 py-2">Revenue</th>
                <th className="text-right px-4 py-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-blue-800/20 text-blue-100">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{row.label}</div>
                    <div className="text-[11px] text-blue-300/50">{row.uniqueVisitors} visitors · {row.purchaseRate}% purchase rate</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">{row.impressions.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-right">{row.ctr}%</td>
                  <td className="px-4 py-2.5 text-right">{row.chatOpens}</td>
                  <td className="px-4 py-2.5 text-right">{row.sessions}</td>
                  <td className="px-4 py-2.5 text-right">{row.accepted}</td>
                  <td className="px-4 py-2.5 text-right">{row.purchased}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-300">₹{row.revenue.toLocaleString('en-IN')}
                    {row.refundedRevenue > 0 && <div className="text-[10px] text-amber-300/70">−₹{row.refundedRevenue.toLocaleString('en-IN')} refunded</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right"><EvidenceBadge value={row.evidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EvidenceBadge({ value }: { value: ConceptRow['evidence'] }) {
  const styles = value === 'sufficient'
    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
    : value === 'directional'
      ? 'bg-amber-950/60 text-amber-300 border-amber-800/50'
      : 'bg-slate-800/60 text-blue-300/60 border-blue-800/40'
  const label = value === 'sufficient' ? 'Sufficient' : value === 'directional' ? 'Directional' : 'Too little data'
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] ${styles}`}>{label}</span>
}
