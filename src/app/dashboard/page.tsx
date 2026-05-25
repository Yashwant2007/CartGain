'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart,
  DollarSign,
  MessageSquare,
  TrendingUp,
  BarChart3,
  Plus,
  MoreVertical,
  Mail,
  Bell,
} from 'lucide-react'
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

export default function DashboardPage() {
  const router = useRouter()
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [carts, setCarts] = useState<Cart[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Check for auth errors from useResolvedStoreId
  useEffect(() => {
    if (storeError && storeError.includes('Sign in')) {
      router.push('/login')
    }
  }, [storeError, router])

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!storeId) {
        return
      }

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
          setCarts(cartsData.carts || [])
          setCampaigns(campaignsData.campaigns || [])
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load dashboard data')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
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

  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <MetricCard
          title="Carts Abandoned"
          value={stats.cartsAbandoned.toLocaleString()}
          change="+12%"
          trend="up"
          icon={<ShoppingCart className="w-6 h-6" />}
          color="primary"
          changeSuffix="from last month"
        />
        <MetricCard
          title="Carts Recovered"
          value={stats.cartsRecovered.toLocaleString()}
          change="+24%"
          trend="up"
          icon={<DollarSign className="w-6 h-6" />}
          color="green"
          changeSuffix="from last month"
        />
        <MetricCard
          title="Revenue Recovered"
          value={`₹${stats.revenueRecovered.toLocaleString()}`}
          change="+18%"
          trend="up"
          icon={<TrendingUp className="w-6 h-6" />}
          color="accent"
          changeSuffix="from last month"
        />
        <MetricCard
          title="Recovery Rate"
          value={`${stats.recoveryRate}%`}
          change="+2.1%"
          trend="up"
          icon={<MessageSquare className="w-6 h-6" />}
          color="blue"
          changeSuffix="from last month"
        />
      </div>

      {isLoading && (
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading live dashboard data...</div>
      )}

      {error && (
        <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart Placeholder */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue Recovered (Last 30 Days)</h3>
          <div className="h-64 bg-gradient-to-br from-blue-900/40 to-slate-900/40 rounded-lg flex items-center justify-center border border-blue-700/20">
            <div className="text-center text-blue-300/50">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Interactive chart will render here</p>
              <p className="text-sm">Using Recharts library</p>
            </div>
          </div>
        </div>

        {/* Channel Performance */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Channel Performance</h3>
          <div className="space-y-4">
            <ChannelBar name="SMS" recovered={89} total={456} rate={19.5} color="bg-blue-500" />
            <ChannelBar name="WhatsApp" recovered={52} total={234} rate={22.2} color="bg-green-500" />
            <ChannelBar name="Email" recovered={38} total={412} rate={9.2} color="bg-purple-500" />
            <ChannelBar name="Push" recovered={Math.min(stats.messagesSent, 10)} total={Math.max(stats.messagesSent, 1)} rate={stats.messagesSent > 0 ? 10 : 0} color="bg-orange-500" />
          </div>
        </div>
      </div>

      {/* Recent Activity & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Carts */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Carts</h3>
            <LinkButton href="/dashboard/campaigns">View All</LinkButton>
          </div>
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
                    <td className="py-3">
                      <ChannelBadge channel={cart.channel} />
                    </td>
                    <td className="py-3">
                      <StatusBadge status={cart.status} />
                    </td>
                    <td className="py-3 text-blue-300/70">{cart.time}</td>
                  </tr>
                ))}
                {recentCarts.length === 0 && (
                  <tr>
                    <td className="py-4 text-blue-300/50" colSpan={5}>No carts yet for this store.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Active Campaigns</h3>
            <LinkButton href="/dashboard/campaigns">Manage</LinkButton>
          </div>
          <div className="space-y-4">
            {activeCampaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg hover:border-blue-700/60 transition-all">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white">{campaign.name}</span>
                    {campaign.active && (
                      <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                    )}
                  </div>
                  <div className="text-sm text-blue-300/60 mt-1">
                    Channels: {campaign.channels.join(', ') || 'none configured'}
                  </div>
                </div>
                <button className="p-2 hover:bg-slate-600/50 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-blue-300/70" />
                </button>
              </div>
            ))}
            {activeCampaigns.length === 0 && (
              <div className="p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg text-sm text-blue-300/60">No campaigns yet. Create your first campaign to start automation.</div>
            )}
          </div>
        </div>
      </div>

      {/* ROI Calculator Widget */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-white mb-6">📊 ROI Calculator</h2>
        <ROICalculator isLoggedIn={true} />
      </div>
    </div>
  )
}

function ChannelBar({ name, recovered, total, rate, color }: {
  name: string
  recovered: number
  total: number
  rate: number
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-white">{name}</span>
        <span className="text-sm text-blue-300/70">{recovered}/{total} ({rate}%)</span>
      </div>
      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden border border-blue-700/20">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${(recovered / total) * 100}%` }}
        />
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
