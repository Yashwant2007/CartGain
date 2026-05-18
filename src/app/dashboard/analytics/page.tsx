'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, DollarSign, ShoppingCart, MessageSquare, Download, Calendar } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type Overview = {
  cartsAbandoned: number
  cartsRecovered: number
  recoveryRate: number
  revenueRecovered: number
  messagesSent: number
  messagesClicked: number
  messagesDelivered: number
  channels: {
    sms: number
    whatsapp: number
    email: number
    push: number
  }
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d')
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadOverview = async () => {
      if (!storeId) {
        return
      }

      try {
        setLoadingData(true)
        setLoadError(null)

        const response = await fetch(`/api/analytics/overview?storeId=${storeId}`)
        if (!response.ok) {
          throw new Error('Failed to load analytics overview')
        }

        const data = await response.json()

        if (!cancelled) {
          setOverview(data.overview)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    loadOverview()

    return () => {
      cancelled = true
    }
  }, [storeId])

  const metrics = {
    totalRevenue: overview?.revenueRecovered ?? 0,
    recoveryRate: overview?.recoveryRate ?? 0,
    cartsAbandoned: overview?.cartsAbandoned ?? 0,
    cartsRecovered: overview?.cartsRecovered ?? 0,
    avgOrderValue:
      (overview?.cartsRecovered ?? 0) > 0
        ? (overview?.revenueRecovered ?? 0) / (overview?.cartsRecovered ?? 1)
        : 0,
    roi: 0,
    messagesSent: overview?.messagesSent ?? 0,
    messagesClicked: overview?.messagesClicked ?? 0,
    clickRate:
      (overview?.messagesSent ?? 0) > 0
        ? Number((((overview?.messagesClicked ?? 0) / (overview?.messagesSent ?? 1)) * 100).toFixed(1))
        : 0,
  }

  const channelData = useMemo(() => {
    const totalRecovered = metrics.cartsRecovered
    const channels = overview?.channels || { sms: 0, whatsapp: 0, email: 0, push: 0 }

    return [
      { channel: 'SMS', sent: channels.sms, delivered: channels.sms, clicked: 0, converted: 0, revenue: 0, rate: 0 },
      { channel: 'WhatsApp', sent: channels.whatsapp, delivered: channels.whatsapp, clicked: 0, converted: 0, revenue: 0, rate: 0 },
      { channel: 'Email', sent: channels.email, delivered: channels.email, clicked: 0, converted: 0, revenue: 0, rate: 0 },
      { channel: 'Push', sent: channels.push, delivered: channels.push, clicked: 0, converted: 0, revenue: 0, rate: 0 },
    ].map((row) => {
      const converted = metrics.messagesSent > 0 ? Math.round((row.sent / metrics.messagesSent) * totalRecovered) : 0
      const rate = row.sent > 0 ? Number(((converted / row.sent) * 100).toFixed(1)) : 0
      return {
        ...row,
        converted,
        rate,
      }
    })
  }, [metrics.cartsRecovered, metrics.messagesSent, overview?.channels])

  const dailyData = [
    { date: 'Jan 1', abandoned: 89, recovered: 12, revenue: 1524 },
    { date: 'Jan 2', abandoned: 102, recovered: 18, revenue: 2340 },
    { date: 'Jan 3', abandoned: 78, recovered: 14, revenue: 1876 },
    { date: 'Jan 4', abandoned: 124, recovered: 21, revenue: 2890 },
    { date: 'Jan 5', abandoned: 156, recovered: 28, revenue: 3567 },
    { date: 'Jan 6', abandoned: 134, recovered: 19, revenue: 2456 },
    { date: 'Jan 7', abandoned: 98, recovered: 16, revenue: 2123 },
  ]

  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-blue-300/80 mt-1">Deep dive into your recovery performance</p>
        </div>
        <div className="flex items-center space-x-2">
          <button className="px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm font-medium hover:border-blue-700/80 transition-all flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            {dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : 'Last 90 days'}
          </button>
          <button className="px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm font-medium hover:border-blue-700/80 transition-all flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Revenue Recovered"
          value={`$${metrics.totalRevenue.toLocaleString()}`}
          change="+24.5%"
          trend="up"
          icon={<DollarSign className="w-6 h-6" />}
          color="green"
        />
        <MetricCard
          title="Recovery Rate"
          value={`${metrics.recoveryRate}%`}
          change="+2.1%"
          trend="up"
          icon={<TrendingUp className="w-6 h-6" />}
          color="primary"
        />
        <MetricCard
          title="Carts Recovered"
          value={metrics.cartsRecovered.toLocaleString()}
          change="+18.2%"
          trend="up"
          icon={<ShoppingCart className="w-6 h-6" />}
          color="blue"
        />
        <MetricCard
          title="Message Click Rate"
          value={`${metrics.clickRate}%`}
          change="+5.3%"
          trend="up"
          icon={<MessageSquare className="w-6 h-6" />}
          color="accent"
        />
      </div>

      {isLoading && (
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading live analytics...</div>
      )}

      {error && (
        <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>
      )}

      {/* Revenue Chart */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Revenue Trend</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-blue-300/70">Daily revenue recovered</span>
          </div>
        </div>
        <div className="h-72 flex items-end justify-between space-x-2 px-4">
          {dailyData.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t-lg transition-all hover:from-cyan-600 hover:to-cyan-500"
                style={{ height: `${(day.revenue / 4000) * 100}%` }}
              />
              <span className="text-xs text-blue-300/60 mt-2">{day.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Channel Performance */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="text-lg font-semibold text-white mb-6">Channel Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-blue-700/30">
                <th className="text-left py-3 px-4 text-sm font-semibold text-blue-300/80">Channel</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-blue-300/80">Sent</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-blue-300/80">Delivered</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-blue-300/80">Clicked</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-blue-300/80">Converted</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-blue-300/80">Revenue</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-blue-300/80">Rate</th>
              </tr>
            </thead>
            <tbody>
              {channelData.map((row, i) => (
                <tr key={i} className="border-b border-blue-700/20 hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4">
                    <ChannelBadge channel={row.channel} />
                  </td>
                  <td className="text-right py-3 px-4 text-blue-200">{row.sent.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-blue-200">{row.delivered.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-blue-200">{row.clicked.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-blue-200">{row.converted.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 font-medium text-emerald-300">${row.revenue.toLocaleString()}</td>
                  <td className="text-right py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      row.rate >= 15 ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' :
                      row.rate >= 10 ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50' :
                      'bg-red-600/30 text-red-300 border border-red-500/50'
                    }`}>
                      {row.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROI Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">ROI Analysis</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-gray-600">Revenue Recovered</span>
              <span className="font-semibold text-green-600">+${metrics.totalRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-gray-600">SMS Costs</span>
              <span className="font-semibold text-red-600">-$1,245</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-gray-600">WhatsApp Costs</span>
              <span className="font-semibold text-red-600">-$892</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-gray-600">Email Costs</span>
              <span className="font-semibold text-red-600">-$156</span>
            </div>
            <div className="flex justify-between items-center py-4 bg-green-50 -mx-4 px-4">
              <span className="font-semibold text-gray-900">Net ROI</span>
              <span className="font-bold text-green-600 text-xl">{metrics.roi}%</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recovery Funnel</h3>
          <div className="space-y-4">
            <FunnelStep label="Carts Abandoned" value={metrics.cartsAbandoned} percentage={100} color="bg-gray-500" />
            <FunnelStep label="Messages Sent" value={metrics.messagesSent} percentage={metrics.messagesSent / metrics.cartsAbandoned * 100} color="bg-blue-500" />
            <FunnelStep label="Messages Clicked" value={metrics.messagesClicked} percentage={metrics.messagesClicked / metrics.cartsAbandoned * 100} color="bg-purple-500" />
            <FunnelStep label="Carts Recovered" value={metrics.cartsRecovered} percentage={metrics.recoveryRate} color="bg-green-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const badges: Record<string, string> = {
    SMS: 'bg-blue-100 text-blue-700',
    WhatsApp: 'bg-green-100 text-green-700',
    Email: 'bg-purple-100 text-purple-700',
    Push: 'bg-orange-100 text-orange-700',
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badges[channel] || 'bg-gray-100 text-gray-700'}`}>
      {channel}
    </span>
  )
}

function FunnelStep({ label, value, percentage, color }: {
  label: string
  value: number
  percentage: number
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700">{label}</span>
        <span className="text-sm font-medium text-gray-900">{value.toLocaleString()}</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}
