'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Download, TrendingUp } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type CampaignAnalytics = {
  id: string
  name: string
  channels: string[]
  totalMessagesUnknown: number
  totalMessagesSent: number
  totalMessagesDelivered: number
  totalMessagesClicked: number
  totalMessagesConverted: number
  deliveryRate: number
  clickRate: number
  conversionRate: number
  totalCarts: number
  recoveredCarts: number
  recoveryRate: number
  totalRevenue: number
  revenuePerCart: number
  createdAt: string
}

export default function CampaignAnalyticsPage() {
  const router = useRouter()
  const params = useParams()
  const { storeId, loading: resolvingStore } = useResolvedStoreId()
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const campaignId = params.id as string

  useEffect(() => {
    const loadAnalytics = async () => {
      if (!storeId || !campaignId) return

      try {
        setLoading(true)
        const response = await fetch(`/api/campaigns/${campaignId}/analytics`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Campaign not found')
          } else {
            setError('Failed to load analytics')
          }
          return
        }

        const data = await response.json()
        setAnalytics(data.analytics)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [storeId, campaignId])

  const handleExport = () => {
    if (!analytics) return

    const csv = [
      ['Campaign Analytics Report'],
      ['Campaign Name', analytics.name],
      ['Created', new Date(analytics.createdAt).toLocaleDateString()],
      [''],
      ['Metric', 'Value'],
      ['Total Messages Sent', analytics.totalMessagesSent],
      ['Total Messages Delivered', analytics.totalMessagesDelivered],
      ['Delivery Rate', `${analytics.deliveryRate.toFixed(1)}%`],
      ['Total Clicks', analytics.totalMessagesClicked],
      ['Click Rate', `${analytics.clickRate.toFixed(1)}%`],
      ['Total Conversions', analytics.totalMessagesConverted],
      ['Conversion Rate', `${analytics.conversionRate.toFixed(1)}%`],
      [''],
      ['Carts Data', ''],
      ['Total Abandoned Carts', analytics.totalCarts],
      ['Recovered Carts', analytics.recoveredCarts],
      ['Recovery Rate', `${analytics.recoveryRate.toFixed(1)}%`],
      ['Total Revenue', `₹${analytics.totalRevenue.toFixed(2)}`],
      ['Revenue per Cart', `₹${analytics.revenuePerCart.toFixed(2)}`],
    ]
      .map((row) => row.join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-analytics-${campaignId}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  if (loading || resolvingStore) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-blue-300">Loading analytics...</div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="flex items-center text-blue-300 hover:text-blue-200"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-300">{error || 'Analytics not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center text-blue-300 hover:text-blue-200 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">{analytics.name}</h1>
          <p className="text-blue-300/80 mt-1">
            Campaign analytics • Created {new Date(analytics.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center px-4 py-2 bg-blue-600/20 border border-blue-500/50 text-blue-300 rounded-lg hover:bg-blue-600/30 transition-colors"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Channels */}
      <div className="flex gap-2 flex-wrap">
        {analytics.channels.map((channel) => (
          <span
            key={channel}
            className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 rounded-full text-sm capitalize"
          >
            {channel}
          </span>
        ))}
      </div>

      {/* Message Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Messages Sent"
          value={analytics.totalMessagesSent}
          icon="📤"
        />
        <MetricCard
          label="Delivery Rate"
          value={`${analytics.deliveryRate.toFixed(1)}%`}
          icon="✓"
          subValue={`${analytics.totalMessagesDelivered} delivered`}
        />
        <MetricCard
          label="Click Rate"
          value={`${analytics.clickRate.toFixed(1)}%`}
          icon="🔗"
          subValue={`${analytics.totalMessagesClicked} clicks`}
        />
        <MetricCard
          label="Conversion Rate"
          value={`${analytics.conversionRate.toFixed(1)}%`}
          icon="🎯"
          subValue={`${analytics.totalMessagesConverted} conversions`}
        />
      </div>

      {/* Cart Recovery Metrics */}
      <div className="grid gap-6 md:grid-cols-3">
        <MetricCard
          label="Total Carts"
          value={analytics.totalCarts}
          icon="🛒"
        />
        <MetricCard
          label="Recovered Carts"
          value={analytics.recoveredCarts}
          icon="💰"
          subValue={`${analytics.recoveryRate.toFixed(1)}% recovery rate`}
        />
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-700/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-blue-300/60">Total Revenue</p>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-emerald-400">₹{analytics.totalRevenue.toFixed(0)}</p>
          <p className="text-xs text-blue-300/60 mt-2">
            ₹{analytics.revenuePerCart.toFixed(0)} per cart
          </p>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Performance Summary</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-blue-300/60">Engagement Performance</p>
            <div className="mt-3 space-y-2">
              <ProgressBar
                label="Delivery"
                value={analytics.deliveryRate}
                color="from-blue-500 to-cyan-500"
              />
              <ProgressBar
                label="Click-through"
                value={analytics.clickRate}
                color="from-cyan-500 to-emerald-500"
              />
              <ProgressBar
                label="Conversion"
                value={analytics.conversionRate}
                color="from-emerald-500 to-green-500"
              />
            </div>
          </div>
          <div>
            <p className="text-sm text-blue-300/60">Recovery Performance</p>
            <div className="mt-3 space-y-2">
              <ProgressBar
                label="Cart Recovery"
                value={analytics.recoveryRate}
                color="from-purple-500 to-pink-500"
              />
              <div className="pt-4 border-t border-blue-700/30">
                <p className="text-xs text-blue-300/60 mb-1">ROI Estimate</p>
                <p className="text-xl font-bold text-emerald-400">
                  {analytics.totalRevenue > 0
                    ? `₹${analytics.totalRevenue.toFixed(0)} recovered`
                    : 'No data yet'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon,
  subValue,
}: {
  label: string
  value: string | number
  icon: string
  subValue?: string
}) {
  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-blue-300/60">{label}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-cyan-300">{value}</p>
      {subValue && <p className="text-xs text-blue-300/60 mt-2">{subValue}</p>}
    </div>
  )
}

function ProgressBar({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-blue-300/80">{label}</span>
        <span className="text-xs font-medium text-blue-300">{value.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}
