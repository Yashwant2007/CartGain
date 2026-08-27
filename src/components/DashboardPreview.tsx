import { TrendingUp, ShoppingCart, Percent, Handshake, MessageSquare, Mail, Smartphone } from 'lucide-react'

const DAILY = [38, 52, 61, 74, 87, 104, 121]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX = Math.max(...DAILY)

const CHANNELS = [
  { icon: MessageSquare, label: 'WhatsApp', value: 58, live: true, tone: 'text-emerald-300' },
  { icon: Mail, label: 'Email', value: 34, live: true, tone: 'text-blue-300' },
  { icon: Smartphone, label: 'SMS', value: 8, live: false, tone: 'text-amber-300' },
]

const STATS = [
  { icon: TrendingUp, label: 'Recovered revenue', value: '₹1,24,500', sub: 'this month' },
  { icon: Percent, label: 'Recovery rate', value: '17.2%', sub: 'vs 3% email-only' },
  { icon: ShoppingCart, label: 'Recovered orders', value: '86', sub: 'attributed to CartGain' },
  { icon: Handshake, label: 'AI bargain deals', value: '34', sub: 'accepted via negotiator' },
]

export default function DashboardPreview() {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-blue-700/40 shadow-2xl bg-slate-950">
      <div className="absolute top-3 right-4 z-10 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-500/40 text-amber-300 text-[10px] font-semibold uppercase tracking-wider">
        Example · Demo data
      </div>

      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-blue-800/30">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70"></span>
        </div>
        <span className="text-[11px] text-blue-300/70 font-mono ml-2">CartGain · Revenue Overview</span>
        <span className="ml-auto text-[10px] text-emerald-300 font-semibold inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> LIVE SYNC
        </span>
      </div>

      <div className="p-5 sm:p-6">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {STATS.map((s) => (
            <div key={s.label} className="bg-slate-800/60 border border-blue-700/30 rounded-xl p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <s.icon className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] sm:text-[11px] text-blue-300/70">{s.label}</span>
              </div>
              <p className="text-lg sm:text-2xl font-bold text-white">{s.value}</p>
              <p className="text-[10px] sm:text-[11px] text-blue-300/50 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          {/* Chart */}
          <div className="lg:col-span-3 bg-slate-800/40 border border-blue-700/30 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-blue-200">Recovered revenue by day (₹)</span>
              <span className="text-[10px] text-blue-300/50">attributed to CartGain</span>
            </div>
            <div className="flex items-end gap-2 sm:gap-3 h-32">
              {DAILY.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[9px] sm:text-[10px] text-blue-300/60">₹{v}</span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-cyan-600/80 to-blue-400/80 hover:from-cyan-500 hover:to-blue-300 transition-all"
                    style={{ height: `${(v / MAX) * 100}%` }}
                  ></div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 sm:gap-3 mt-1.5">
              {DAYS.map((d, i) => (
                <div key={d} className="flex-1 text-center text-[9px] sm:text-[10px] text-blue-300/60">{d}</div>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div className="lg:col-span-2 bg-slate-800/40 border border-blue-700/30 rounded-xl p-4 sm:p-5">
            <span className="text-xs font-semibold text-blue-200 mb-4 block">Share of recovered orders</span>
            <div className="space-y-4">
              {CHANNELS.map((c) => (
                <div key={c.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-100">
                      <c.icon className={`w-3.5 h-3.5 ${c.tone}`} /> {c.label}
                      {c.live ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-[9px] font-semibold text-emerald-300">LIVE</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-600/40 text-[9px] font-semibold text-amber-300">SOON</span>
                      )}
                    </span>
                    <span className="text-xs text-white font-semibold">{c.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${c.live ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : 'bg-slate-600'}`}
                      style={{ width: `${c.value}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-blue-300/40 mt-4 leading-relaxed">
              Illustrative figures from a sample store. Your dashboard shows only revenue we attribute to CartGain
              recovery messages within the 72-hour window.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}