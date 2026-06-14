'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ShoppingCart,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Plus,
  MoreVertical,
} from 'lucide-react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { RevenueChart, ChannelPerformanceChart } from '@/components/dashboard/RevenueChart'
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

type AnalyticsData = {
  chartData: Array<{
    date: string
    revenue: number
    recoveredCarts: number
    abandonedCarts: number
  }>
  channelStats: Array<{
    channel: string
    sent: number
    delivered: number
    clicked: number
    converted: number
  }>
}

export default function DashboardPage() {
  const router = useRouter()
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [carts, setCarts] = useState<Cart[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Check for auth errors
  useEffect(() => {
    if (storeError && storeError.includes('Sign in')) {
      router.push('/login')
    }
  }, [storeError, router])

  // Load dashboard data
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

        const [overviewResponseData, cartsData, campaignsData] = await Promise.all([
          overviewResponse.json(),
          cartsResponse.json(),
          campaignsResponse.json(),
        ])

        if (!cancelled) {
          setOverview(overviewResponseData.overview)
          setAnalyticsData({
            chartData: overviewResponseData.chartData || [],
            channelStats: overviewResponseData.channelStats || [],
          })
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
          className="w-full xs:w-auto py-2.5 sm:py-3 px-4 sm:px-6 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm sm:text-base font-semibold rounded-lg border border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 transition-all active:scale-95 flex items-center justify-center gap-2 min-h-10"
        >
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
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">
          ⏳ Loading live dashboard data...
        </div>
      )}

      {error && (
        <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">
          ⚠️ {error}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Revenue Recovered (Last 30 Days)</h3>
          {analyticsData && analyticsData.chartData.length > 0 ? (
            <RevenueChart data={analyticsData.chartData} variant="line" />
          ) : (
            <div className="h-64 flex items-center justify-center text-blue-300/50">
              <p>No data yet. Create a campaign to start tracking.</p>
            </div>
          )}
        </div>

        {/* Channel Performance */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-white mb-4">Channel Performance</h3>
          {analyticsData && analyticsData.channelStats.length > 0 ? (
            <ChannelPerformanceChart data={analyticsData.channelStats} />
          ) : (
            <div className="h-64 flex items-center justify-center text-blue-300/50">
              <p>No message data yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Carts */}
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Carts</h3>
            <Link href="/dashboard/campaigns" className="text-sm text-blue-400 hover:text-blue-300">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-blue-300/70 border-b border-blue-700/30">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Channel</th>
                </tr>
              </thead>
              <tbody>
                {recentCarts.map((cart) => (
                  <tr key={cart.id} className="border-b border-blue-700/20 last:border-0 hover:bg-slate-700/30">
                    <td className="py-3">
                      <div>
                        <div className="font-medium text-white">{cart.customer}</div>
                        <div className="text-blue-300/60 text-xs">{cart.email}</div>
                      </div>
                    </td>
                    <td className="py-3 font-medium text-cyan-300">₹{cart.total.toFixed(0)}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          cart.status === 'recovered'
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-yellow-500/20 text-yellow-300'
                        }`}
                      >
                        {cart.status}
                      </span>
                    </td>
                    <td className="py-3 text-blue-300">{cart.channel}</td>
                  </tr>
                ))}
                {recentCarts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-blue-300/50">
                      No carts yet for this store.
                    </td>
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
            <Link href="/dashboard/campaigns" className="text-sm text-blue-400 hover:text-blue-300">
              Manage
            </Link>
          </div>
          <div className="space-y-4">
            {activeCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg hover:border-blue-700/60 transition-all"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white">{campaign.name}</span>
                    {campaign.active && <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>}
                  </div>
                  <div className="text-sm text-blue-300/60 mt-1">
                    {campaign.channels.join(', ') || 'No channels'}
                  </div>
                </div>
                <button className="p-2 hover:bg-slate-600/50 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-blue-300/70" />
                </button>
              </div>
            ))}
            {activeCampaigns.length === 0 && (
              <div className="p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg text-sm text-blue-300/60">
                No campaigns yet. Create your first campaign to start automating cart recovery.
              </div>
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
