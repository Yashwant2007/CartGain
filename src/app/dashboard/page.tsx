'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Plus,
  MoreVertical,
  Mail,
  Bell,
  Sparkles,
  Zap,
  Trophy,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import ROICalculator from '@/components/ROICalculator'

type Campaign = {
  id: string
  name: string
  isActive: boolean
  channels: string[]
}

type Cart = {
  id: string
  customerName: string | null
  customerEmail: string | null
  totalValue: number
  isRecovered: boolean
  recoveredVia: string | null
  abandonedAt: string
}

type Overview = {
  cartsAbandoned: number
  cartsRecovered: number
  recoveryRate: number
  revenueRecovered: number
  messagesSent: number
}

type ChartDataPoint = {
  date: string
  revenue: number
  recoveredCarts: number
  abandonedCarts: number
}

type ChannelStat = {
  channel: string
  sent: number
  delivered: number
  clicked: number
  converted: number
}

export default function DashboardPage() {
  const router = useRouter()
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [channelStats, setChannelStats] = useState<ChannelStat[]>([])
  const [carts, setCarts] = useState<Cart[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (storeError && storeError.includes('Sign in')) {
      router.push('/login')
    }
  }, [storeError, router])

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!storeId) return

      try {
        setLoadingData(true)
        setLoadError(null)

        const [overviewResponse, cartsResponse, campaignsResponse] = await Promise.all([
          fetch(`/api/analytics/overview?storeId=${storeId}`),
          fetch(`/api/carts?storeId=${storeId}`),
          fetch(`/api/campaigns?storeId=${storeId}`),
        ])

        if (!overviewResponse.ok || !cartsResponse.ok || !campaignsResponse.ok) {
          throw new Error('Failed to load dashboard data')
        }

        const [overviewData, cartsData, campaignsData] = await Promise.all([
          overviewResponse.json(),
          cartsResponse.json(),
          campaignsResponse.json(),
        ])

        if (!cancelled) {
          setOverview(overviewData.overview)
          setChartData(overviewData.chartData || [])
          setChannelStats(overviewData.channelStats || [])
          setCarts(cartsData.carts || [])
          setCampaigns(campaignsData.campaigns || [])
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load dashboard data')
        }
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    }

    loadData()

    return () => { cancelled = true }
  }, [storeId])

  const recentCarts = useMemo(
    () =>
      carts.slice(0, 5).map((cart) => ({
        id: cart.id,
        customer: cart.customerName || 'Guest Customer',
        email: cart.customerEmail || 'No email',
        total: cart.totalValue,
        status: cart.isRecovered ? 'recovered' : 'abandoned',
        channel: cart.recoveredVia || '-',
        time: new Date(cart.abandonedAt).toLocaleString(),
      })),
    [carts]
  )

  const activeCampaigns = useMemo(
    () =>
      campaigns.slice(0, 3).map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        channels: campaign.channels,
        active: campaign.isActive,
      })),
    [campaigns]
  )

  const stats = {
    cartsAbandoned: overview?.cartsAbandoned ?? 0,
    cartsRecovered: overview?.cartsRecovered ?? 0,
    revenueRecovered: overview?.revenueRecovered ?? 0,
    recoveryRate: overview?.recoveryRate ?? 0,
    messagesSent: overview?.messagesSent ?? 0,
  }

  const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0)
  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-blue-300 text-sm sm:text-base mt-1">Track your cart recovery performance</p>
        </div>
        <button 
          onClick={() => router.push('/dashboard/campaigns')}
          className="w-full xs:w-auto py-2.5 sm:py-3 px-4 sm:px-6 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm sm:text-base font-semibold rounded-lg border border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 transition-all active:scale-95 flex items-center justify-center gap-2 min-h-10">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>New Campaign</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <MetricCard title="Carts Abandoned" value={stats.cartsAbandoned.toLocaleString()} change="+12%" trend="up" icon={<ShoppingCart className="w-6 h-6" />} color="primary" changeSuffix="from last month" loading={isLoading} />
        <MetricCard title="Carts Recovered" value={stats.cartsRecovered.toLocaleString()} change="+24%" trend="up" icon={<DollarSign className="w-6 h-6" />} color="green" changeSuffix="from last month" loading={isLoading} />
        <MetricCard title="Revenue Recovered" value={`₹${stats.revenueRecovered.toLocaleString()}`} change="+18%" trend="up" icon={<TrendingUp className="w-6 h-6" />} color="accent" changeSuffix="from last month" loading={isLoading} />
        <MetricCard title="Recovery Rate" value={`${stats.recoveryRate}%`} change="+2.1%" trend="up" icon={<MessageSquare className="w-6 h-6" />} color="blue" changeSuffix="from last month" loading={isLoading} />
      </div>

      {error && (
        <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue Recovered (Last 30 Days)</h3>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse w-full h-full bg-slate-700/30 rounded-lg" />
            </div>
          ) : chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e3a5f' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px' }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#06b6d4" strokeWidth={2} fill="url(#revenueGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 bg-gradient-to-br from-blue-900/40 to-slate-900/40 rounded-lg flex items-center justify-center border border-blue-700/20">
              <div className="text-center text-blue-300/50">
                <p>No revenue data yet</p>
                <p className="text-sm">Data will appear once carts are recovered</p>
              </div>
            </div>
          )}
          <div className="mt-3 text-xs text-blue-300/50 text-right">
            Total: ₹{totalRevenue.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Channel Performance</h3>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <div className="h-4 bg-slate-700/50 rounded animate-pulse mb-1 w-20" />
                  <div className="h-2 bg-slate-700/50 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ) : channelStats.length > 0 ? (
            <div className="space-y-4">
              {channelStats.map((stat) => (
                <ChannelBar key={stat.channel} name={stat.channel} sent={stat.sent} delivered={stat.delivered} converted={stat.converted} />
              ))}
            </div>
          ) : (
            <div className="p-4 bg-slate-700/40 rounded-lg text-sm text-blue-300/60">
              No channel data yet. Connect your store and create a campaign to see performance.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Carts</h3>
            <LinkButton href="/dashboard/campaigns">View All</LinkButton>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-700/40 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-blue-300/70 border-b border-blue-700/30">
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Total</th>
                    <th className="pb-3 font-medium">Channel</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {recentCarts.map((cart) => (
                    <tr key={cart.id} className="border-b border-blue-700/20 last:border-0">
                      <td className="py-3">
                        <div>
                          <div className="font-medium text-white">{cart.customer}</div>
                          <div className="text-blue-300/60 text-xs">{cart.email}</div>
                        </div>
                      </td>
                      <td className="py-3 font-medium text-cyan-300">₹{cart.total.toFixed(2)}</td>
                      <td className="py-3"><ChannelBadge channel={cart.channel} /></td>
                      <td className="py-3"><StatusBadge status={cart.status} /></td>
                      <td className="py-3 text-blue-300/70">{cart.time}</td>
                    </tr>
                  ))}
                  {recentCarts.length === 0 && (
                    <tr><td className="py-4 text-blue-300/50" colSpan={5}>No carts yet for this store.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <NotificationFeed isLoading={isLoading} storeId={storeId} campaigns={activeCampaigns} />
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold text-white mb-6">📊 ROI Calculator</h2>
        <ROICalculator isLoggedIn={true} />
      </div>
    </div>
  )
}

function ChannelBar({ name, sent, delivered, converted }: { name: string; sent: number; delivered: number; converted: number }) {
  const colorMap: Record<string, string> = {
    Sms: 'bg-blue-500',
    Whatsapp: 'bg-green-500',
    Email: 'bg-purple-500',
    Push: 'bg-orange-500',
  }

  const channelKey = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  const barColor = colorMap[channelKey] || 'bg-blue-500'
  const conversionRate = sent > 0 ? ((converted / sent) * 100).toFixed(1) : '0.0'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-white">{channelKey}</span>
        <span className="text-sm text-blue-300/70">{converted}/{sent} converted ({conversionRate}%)</span>
      </div>
      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden border border-blue-700/20">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${sent > 0 ? (converted / sent) * 100 : 0}%` }} />
      </div>
    </div>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const badges: Record<string, string> = {
    sms: 'bg-blue-600/30 text-blue-300 border border-blue-500/50',
    whatsapp: 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50',
    email: 'bg-purple-600/30 text-purple-300 border border-purple-500/50',
    push: 'bg-orange-600/30 text-orange-300 border border-orange-500/50',
  }

  const icons: Record<string, React.ReactNode> = {
    sms: <MessageSquare className="w-3 h-3 mr-1" />,
    whatsapp: <MessageSquare className="w-3 h-3 mr-1" />,
    email: <Mail className="w-3 h-3 mr-1" />,
    push: <Bell className="w-3 h-3 mr-1" />,
  }

  if (channel === '-') return <span className="text-blue-300/50">-</span>

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badges[channel] || 'bg-slate-700/40 text-blue-300/70'}`}>
      {icons[channel]}
      {channel.toUpperCase()}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const badges: Record<string, string> = {
    recovered: 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50',
    pending: 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50',
    sent: 'bg-blue-600/30 text-blue-300 border border-blue-500/50',
    abandoned: 'bg-slate-700/40 text-blue-300/70 border border-slate-600',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badges[status] || 'bg-slate-700/40 text-blue-300/70'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">
      {children}
    </a>
  )
}

type Notification = {
  id: string
  type: 'recovery' | 'cart' | 'campaign' | 'milestone'
  title: string
  description: string
  timestamp: string
  icon: string
}

function NotificationFeed({ isLoading, storeId, campaigns }: { isLoading: boolean; storeId: string | null; campaigns: Array<{ id: string; name: string; channels: string[]; active: boolean }> }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  useEffect(() => {
    if (!storeId) return
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/notifications')
        const data = await res.json()
        if (res.ok) setNotifications(data.notifications || [])
      } catch {
        // silent
      } finally {
        setFeedLoading(false)
      }
    }
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [storeId])

  const iconMap: Record<string, React.ReactNode> = {
    recovery: <DollarSign className="w-4 h-4 text-emerald-400" />,
    cart: <ShoppingCart className="w-4 h-4 text-orange-400" />,
    campaign: <Zap className="w-4 h-4 text-cyan-400" />,
    milestone: <Trophy className="w-4 h-4 text-amber-400" />,
  }

  const isBusy = isLoading || feedLoading

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Activity Feed</h3>
        <LinkButton href="/dashboard/campaigns">View All</LinkButton>
      </div>

      {/* Active Campaigns Pills */}
      {campaigns.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-blue-700/20">
          <span className="text-xs text-blue-300/60 self-center mr-1">Campaigns:</span>
          {campaigns.map((c) => (
            <a key={c.id} href="/dashboard/campaigns" className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-600/30 transition-all">
              <span className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-emerald-400' : 'bg-slate-500'} mr-1.5`} />
              {c.name}
            </a>
          ))}
        </div>
      )}

      {/* Notifications */}
      <div className="space-y-1 min-h-[120px]">
        {isBusy ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-slate-700/30 rounded-lg animate-pulse" />)}
          </div>
        ) : notifications.length > 0 ? (
          notifications.slice(0, 6).map((n) => (
            <div key={n.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-700/30 transition-all group">
              <div className="w-8 h-8 bg-slate-700/60 rounded-lg flex items-center justify-center shrink-0 border border-blue-700/20">
                {iconMap[n.type] || <Bell className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{n.title}</p>
                <p className="text-xs text-blue-300/70 line-clamp-1">{n.description}</p>
                <p className="text-[10px] text-blue-300/40 mt-0.5">{new Date(n.timestamp).toLocaleString()}</p>
              </div>
              <span className="text-lg shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">{n.icon}</span>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="w-8 h-8 text-blue-300/30 mb-3" />
            <p className="text-sm text-blue-300/60">No activity yet</p>
            <p className="text-xs text-blue-300/40 mt-1">Activity will appear here once carts start coming in</p>
          </div>
        )}
      </div>
    </div>
  )
}
