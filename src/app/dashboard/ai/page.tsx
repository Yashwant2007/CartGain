'use client'

import { useEffect, useState, useCallback } from 'react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import {
  BrainCircuit, TrendingUp, DollarSign, BarChart3, Target,
  Lightbulb, Sparkles, Zap, Award, FileText, Activity,
  Loader2, RefreshCw, ArrowUp, ArrowDown,
} from 'lucide-react'

type TabType = 'coach' | 'simulator' | 'benchmarks' | 'roi' | 'report'

export default function AIPage() {
  const { storeId, loading: resolving } = useResolvedStoreId()
  const [activeTab, setActiveTab] = useState<TabType>('coach')
  const [loading, setLoading] = useState(false)
  const [healthScore, setHealthScore] = useState<{ score: number; components: Array<{ name: string; score: number; max: number }> } | null>(null)

  useEffect(() => {
    if (!storeId) return
    setLoading(true)
    fetch(`/api/ai/health-score?storeId=${storeId}`)
      .then(r => r.json())
      .then(d => { setHealthScore(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [storeId])

  const tabs: Array<{ key: TabType; label: string; icon: any }> = [
    { key: 'coach', label: 'Revenue Coach', icon: Lightbulb },
    { key: 'simulator', label: 'Recovery Simulator', icon: TrendingUp },
    { key: 'benchmarks', label: 'Benchmarks', icon: Award },
    { key: 'roi', label: 'ROI Dashboard', icon: DollarSign },
    { key: 'report', label: 'Weekly Report', icon: FileText },
  ]

  if (resolving) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Header with Health Score */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <BrainCircuit className="w-7 h-7 text-blue-400" />
            AI Merchant Intelligence
          </h1>
          <p className="text-blue-300/70 text-sm mt-1">AI-powered insights to optimize your cart recovery</p>
        </div>
        {healthScore && <HealthScoreBadge score={healthScore.score} loading={loading} />}
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-blue-800/30 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50'
                : 'text-blue-200/60 hover:text-blue-200 hover:bg-slate-800/30'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'coach' && <RevenueCoach storeId={storeId} />}
      {activeTab === 'simulator' && <RecoverySimulator storeId={storeId} />}
      {activeTab === 'benchmarks' && <Benchmarks storeId={storeId} />}
      {activeTab === 'roi' && <ROIDashboard storeId={storeId} />}
      {activeTab === 'report' && <WeeklyReport storeId={storeId} />}
    </div>
  )
}

function HealthScoreBadge({ score, loading }: { score: number; loading: boolean }) {
  const color = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'
  const bg = score >= 80 ? 'bg-emerald-900/20 border-emerald-500/30' : score >= 50 ? 'bg-amber-900/20 border-amber-500/30' : 'bg-red-900/20 border-red-500/30'
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${bg}`}>
      <Activity className={`w-5 h-5 ${color}`} />
      <div>
        <p className={`text-lg font-bold ${color}`}>{loading ? '...' : score}/100</p>
        <p className="text-xs text-blue-300/60">Health Score</p>
      </div>
    </div>
  )
}

function RevenueCoach({ storeId }: { storeId: string | null }) {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/coach?storeId=${storeId}`)
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch {} finally { setLoading(false) }
  }, [storeId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">AI Revenue Coach</h2>
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-800/40 text-blue-300/60 hover:text-blue-300 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {suggestions.length === 0 ? (
        <div className="text-center py-12 text-blue-300/50">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No suggestions yet. Start a campaign to get AI-powered recommendations.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {suggestions.map((s: any, i: number) => (
            <div key={i} className="bg-slate-800/40 border border-blue-800/20 rounded-xl p-4 hover:border-blue-700/40 transition">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  s.impact === 'high' ? 'bg-emerald-900/30 text-emerald-400' :
                  s.impact === 'medium' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'
                }`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white">{s.title}</h3>
                  <p className="text-xs text-blue-300/70 mt-1">{s.description}</p>
                  {s.metric && (
                    <div className="mt-2 flex gap-4 text-xs text-blue-400/60">
                      {Object.entries(s.metric).map(([k, v]) => (
                        <span key={k}>{k}: <strong className="text-blue-300">{String(v)}</strong></span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                  s.impact === 'high' ? 'bg-emerald-900/30 text-emerald-400' :
                  s.impact === 'medium' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'
                }`}>{s.impact}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecoverySimulator({ storeId }: { storeId: string | null }) {
  const [improvements, setImprovements] = useState({
    addChannel: false, enableAI: false, addDiscount: false, improveTiming: false, addFollowUp: false,
  })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const toggle = (key: string) => setImprovements(prev => ({ ...prev, [key]: !(prev as any)[key] }))

  const simulate = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, improvements }),
      })
      setResult(await res.json())
    } catch {} finally { setLoading(false) }
  }, [storeId, improvements])

  const options = [
    { key: 'addChannel', label: 'Add Another Channel', desc: 'Use 2+ channels (email, SMS, WhatsApp)' },
    { key: 'enableAI', label: 'Enable AI Content', desc: 'AI-generated personalized messages' },
    { key: 'addDiscount', label: 'Add Discount Offers', desc: 'Incentivize with small discounts' },
    { key: 'improveTiming', label: 'Optimize Send Timing', desc: 'Send within 15 min of abandonment' },
    { key: 'addFollowUp', label: 'Add Follow-up Sequence', desc: '2-3 follow-up messages' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Recovery Simulator</h2>
      <p className="text-sm text-blue-300/60">Toggle improvements below to estimate their impact on your recovery rate.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {options.map(opt => (
          <button
            key={opt.key}
            onClick={() => toggle(opt.key)}
            className={`text-left p-4 rounded-xl border transition-all ${
              (improvements as any)[opt.key]
                ? 'bg-blue-900/30 border-blue-600/50 shadow-md shadow-blue-900/30'
                : 'bg-slate-800/40 border-blue-800/20 hover:border-blue-700/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                (improvements as any)[opt.key] ? 'bg-blue-500 border-blue-500' : 'border-blue-500/50'
              }`}>
                {(improvements as any)[opt.key] && <span className="text-white text-[10px]">✓</span>}
              </div>
              <span className="text-sm font-medium text-white">{opt.label}</span>
            </div>
            <p className="text-xs text-blue-300/60 ml-6">{opt.desc}</p>
          </button>
        ))}
      </div>

      <button
        onClick={simulate}
        disabled={loading}
        className="px-6 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg hover:shadow-blue-500/40 transition disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
        {loading ? 'Simulating...' : 'Run Simulation'}
      </button>

      {result && (
        <div className="bg-slate-800/40 border border-blue-800/20 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">Projected Impact</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricBox label="Recovery Rate" value={`${result.projectedRecoveryRate}%`} icon={Target} color="text-blue-400" />
            <MetricBox label="Monthly Revenue" value={`₹${result.projectedRevenue.toLocaleString()}`} icon={DollarSign} color="text-emerald-400" />
            <MetricBox label="Additional Revenue" value={`₹${result.additionalRevenue.toLocaleString()}`} icon={ArrowUp} color="text-cyan-400" />
            <MetricBox label="Est. Messages" value={result.estimatedMessages.toLocaleString()} icon={BarChart3} color="text-amber-400" />
          </div>
          <div className="pt-2">
            <p className="text-xs text-blue-300/50 mb-2">Channel Breakdown</p>
            {result.channelBreakdown?.map((ch: any) => (
              <div key={ch.channel} className="flex items-center justify-between py-1.5 border-b border-blue-800/10 last:border-0">
                <span className="text-sm text-blue-200 capitalize">{ch.channel}</span>
                <div className="flex gap-4 text-xs">
                  <span className="text-blue-300/70">{ch.recoveryRate.toFixed(1)}% recovery</span>
                  <span className="text-emerald-400">₹{ch.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricBox({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-slate-900/40 rounded-lg p-3 border border-blue-800/10">
      <Icon className={`w-4 h-4 ${color} mb-1`} />
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-xs text-blue-300/50">{label}</p>
    </div>
  )
}

function Benchmarks({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!storeId) return
    fetch(`/api/ai/benchmarks?storeId=${storeId}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [storeId])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
  if (!data) return <p className="text-blue-300/50 text-center py-12">No benchmark data available</p>

  const { comparison } = data

  const rows = [
    { label: 'Recovery Rate', key: 'recoveryRate', suffix: '%' },
    { label: 'Channels Used', key: 'channelsUsed', suffix: '' },
    { label: 'Avg Order Value', key: 'avgOrderValue', suffix: '', prefix: '₹' },
    { label: 'AI Adoption', key: 'aiAdoption', suffix: '%', pct: true },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Merchant Benchmarking</h2>
      <p className="text-sm text-blue-300/60">How you compare to industry averages and top performers.</p>

      <div className="bg-slate-800/40 border border-blue-800/20 rounded-xl overflow-hidden">
        {rows.map(row => {
          const c = comparison[row.key]
          if (!c) return null
          const yourVal = row.pct ? Math.round(c.yourValue * 100) : row.prefix ? c.yourValue : c.yourValue
          const avgVal = row.pct ? c.average * 100 : c.average
          const topVal = row.pct ? c.topPerformers * 100 : c.topPerformers
          const vsAvg = c.yourValue > c.average ? 'above' : c.yourValue < c.average ? 'below' : 'equal'
          return (
            <div key={row.key} className="flex items-center justify-between px-4 py-3 border-b border-blue-800/10 last:border-0 hover:bg-slate-700/20">
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{row.label}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-blue-300/50">Avg: {avgVal}{row.suffix}</span>
                  <span className="text-xs text-blue-300/30 mx-1">|</span>
                  <span className="text-xs text-emerald-400/60">Top: {topVal}{row.suffix}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-white">{yourVal}{row.suffix}</p>
                <p className={`text-xs flex items-center gap-1 ${vsAvg === 'above' ? 'text-emerald-400' : vsAvg === 'below' ? 'text-red-400' : 'text-blue-300/50'}`}>
                  {vsAvg === 'above' ? <ArrowUp className="w-3 h-3" /> : vsAvg === 'below' ? <ArrowDown className="w-3 h-3" /> : null}
                  {vsAvg === 'above' ? 'Above average' : vsAvg === 'below' ? 'Below average' : 'At average'}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ROIDashboard({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!storeId) return
    fetch(`/api/ai/roi?storeId=${storeId}`)
      .then(r => r.json()).then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [storeId])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
  if (!data) return <p className="text-blue-300/50 text-center py-12">No ROI data available</p>

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">ROI Dashboard</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricBox label="Monthly Revenue" value={`₹${data.monthlyRecoveredRevenue.toLocaleString()}`} icon={DollarSign} color="text-emerald-400" />
        <MetricBox label="Monthly Cost" value={`₹${data.monthlyCosts.total.toLocaleString()}`} icon={BarChart3} color="text-amber-400" />
        <MetricBox label="Net Profit" value={`₹${data.netProfit.toLocaleString()}`} icon={TrendingUp} color={data.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        <MetricBox label="ROI Multiple" value={`${data.roiMultiple}x`} icon={Zap} color={data.roiMultiple >= 2 ? 'text-emerald-400' : 'text-amber-400'} />
      </div>

      <div className="bg-slate-800/40 border border-blue-800/20 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Cost Breakdown</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-blue-300/70">Messaging ({data.messagesSent.total} msgs)</span>
            <span className="text-white">₹{data.monthlyCosts.messaging.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-blue-300/70">Subscription ({data.plan})</span>
            <span className="text-white">₹{data.monthlyCosts.subscription.toLocaleString()}</span>
          </div>
          <div className="border-t border-blue-800/20 pt-2 flex justify-between text-sm font-semibold">
            <span className="text-blue-200">Total Monthly Cost</span>
            <span className="text-white">₹{data.monthlyCosts.total.toLocaleString()}</span>
          </div>
        </div>
        <div className="pt-2">
          <p className="text-xs text-blue-300/50">Lifetime Recovered Revenue: <strong className="text-emerald-400">₹{data.totalRecoveredRevenue.toLocaleString()}</strong></p>
        </div>
      </div>
    </div>
  )
}

function WeeklyReport({ storeId }: { storeId: string | null }) {
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/weekly-report?storeId=${storeId}`)
      const data = await res.json()
      setReport(data.report || data)
    } catch {} finally { setLoading(false) }
  }, [storeId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
  if (!report) return <p className="text-blue-300/50 text-center py-12">No report available yet</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{report.title}</h2>
          <p className="text-xs text-blue-300/50">AI-generated weekly summary</p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-slate-800/40 text-blue-300/60 hover:text-blue-300 transition">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {report.summary && (
        <div className="bg-slate-800/40 border border-blue-800/20 rounded-xl p-4">
          <p className="text-sm text-blue-200">{report.summary}</p>
        </div>
      )}

      {report.insights && report.insights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Key Insights</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.insights.map((insight: any, i: number) => (
              <div key={i} className="bg-slate-800/40 border border-blue-800/20 rounded-xl p-4">
                <p className="text-2xl mb-1">{insight.icon || '📊'}</p>
                <p className="text-sm font-medium text-white">{insight.title}</p>
                <p className="text-xs text-blue-300/60 mt-1">{insight.description}</p>
                {insight.metric && <p className="text-lg font-bold text-blue-400 mt-1">{insight.metric}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Recommendations</h3>
          <div className="space-y-2">
            {report.recommendations.map((rec: any, i: number) => (
              <div key={i} className="flex items-start gap-3 bg-slate-800/40 border border-blue-800/20 rounded-xl p-4">
                <div className={`p-1.5 rounded-lg ${
                  rec.priority === 'high' ? 'bg-emerald-900/30 text-emerald-400' :
                  rec.priority === 'medium' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'
                }`}>
                  <Target className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white">{rec.action}</p>
                  {rec.impact && <p className="text-xs text-blue-300/50 mt-0.5">Impact: {rec.impact}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                  rec.priority === 'high' ? 'bg-emerald-900/30 text-emerald-400' :
                  rec.priority === 'medium' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'
                }`}>{rec.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}