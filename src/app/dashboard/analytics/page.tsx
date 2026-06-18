'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, DollarSign, ShoppingCart, MessageSquare, Download, Calendar, BarChart3, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { RevenueChart, ChannelPerformanceChart } from '@/components/dashboard/RevenueChart'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type PeriodData = {
  overview: {
    cartsAbandoned: number
    cartsRecovered: number
    recoveryRate: number
    revenueRecovered: number
    netRevenue: number
    messagesSent: number
    messagesDelivered: number
    messagesClicked: number
    totalCosts: number
    roi: number
    avgOrderValue: number
  }
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
    revenue: number
  }>
  insights?: {
    bestChannel: { channel: string; revenue: number; conversionRate: number } | null
    avgConversionTime: number | null
    tips: string[]
  }
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d')
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [current, setCurrent] = useState<PeriodData | null>(null)
  const [previous, setPrevious] = useState<PeriodData | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!storeId) return

      try {
        setLoadingData(true)
        setLoadError(null)

        const res = await fetch(`/api/analytics/overview?storeId=${storeId}&days=${days}`)
        if (!res.ok) throw new Error('Failed to load analytics')

        const data = await res.json()

        if (!cancelled) {
          setCurrent(data.current)
          setPrevious(data.previous)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) setLoadingData(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [storeId, days])

  const change = useMemo(() => {
    if (!current || !previous) return { revenue: '+0%', rate: '+0%', carts: '+0%', clickRate: '+0%' }

    const calc = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? '+100%' : '+0%'
      const pct = ((curr - prev) / prev) * 100
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
    }

    return {
      revenue: calc(current.overview.revenueRecovered, previous.overview.revenueRecovered),
      rate: calc(current.overview.recoveryRate, previous.overview.recoveryRate),
      carts: calc(current.overview.cartsRecovered, previous.overview.cartsRecovered),
      clickRate: calc(current.overview.messagesClicked, previous.overview.messagesClicked),
    }
  }, [current, previous])

  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  const dateRangeLabel = dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : 'Last 90 days'

  const handleExport = async () => {
    if (!current || !storeId) return

    try {
      setExporting(true)
      setExportError(null)
      setExportSuccess(false)

      // Generate CSV content
      const csvRows: string[] = []
      
      // Header
      csvRows.push('CartGain Analytics Report')
      csvRows.push(`Period: ${dateRangeLabel}`)
      csvRows.push(`Generated: ${new Date().toLocaleString('en-IN')}`)
      csvRows.push('')

      // Overview Section
      csvRows.push('=== OVERVIEW ===')
      csvRows.push('Metric,Value')
      csvRows.push(`Revenue Recovered,₹${current.overview.revenueRecovered.toLocaleString('en-IN')}`)
      csvRows.push(`Recovery Rate,${current.overview.recoveryRate}%`)
      csvRows.push(`Carts Recovered,${current.overview.cartsRecovered}`)
      csvRows.push(`Carts Abandoned,${current.overview.cartsAbandoned}`)
      csvRows.push(`Messages Sent,${current.overview.messagesSent}`)
      csvRows.push(`Messages Delivered,${current.overview.messagesDelivered}`)
      csvRows.push(`Messages Clicked,${current.overview.messagesClicked}`)
      csvRows.push(`Total Costs,₹${current.overview.totalCosts.toFixed(2)}`)
      csvRows.push(`Net Revenue,₹${current.overview.netRevenue.toLocaleString('en-IN')}`)
      csvRows.push(`ROI,${current.overview.roi}%`)
      csvRows.push(`Avg Order Value,₹${current.overview.avgOrderValue.toFixed(2)}`)
      csvRows.push('')

      // Channel Performance Section
      csvRows.push('=== CHANNEL PERFORMANCE ===')
      csvRows.push('Channel,Sent,Delivered,Clicked,Converted,Revenue,Conversion Rate')
      current.channelStats.forEach((channel) => {
        const convRate = channel.sent > 0 ? ((channel.converted / channel.sent) * 100).toFixed(1) : '0.0'
        csvRows.push(`${channel.channel},${channel.sent},${channel.delivered},${channel.clicked},${channel.converted},₹${channel.revenue.toLocaleString('en-IN')},${convRate}%`)
      })
      csvRows.push('')

      // Daily Data Section
      csvRows.push('=== DAILY DATA ===')
      csvRows.push('Date,Revenue,Recovered Carts,Abandoned Carts')
      current.chartData.forEach((day) => {
        csvRows.push(`${day.date},₹${day.revenue.toLocaleString('en-IN')},${day.recoveredCarts},${day.abandonedCarts}`)
      })

      // Create blob and download
      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `cartgain-analytics-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (error) {
      setExportError('Failed to export data. Please try again.')
      console.error('Export error:', error)
      setTimeout(() => setExportError(null), 3000)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-blue-300/80 mt-1">Deep dive into your recovery performance</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-700/50 border border-blue-700/50 rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  dateRange === range
                    ? 'bg-cyan-600/40 text-cyan-300 border border-cyan-500/50'
                    : 'text-blue-300/70 hover:text-white'
                }`}
              >
                {range === '7d' ? '7D' : range === '30d' ? '30D' : '90D'}
              </button>
            ))}
          </div>
          <button 
            onClick={handleExport}
            disabled={exporting || !current}
            className="px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm font-medium hover:border-blue-700/80 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed relative"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />
                Exported!
              </>
            ) : exportError ? (
              <>
                <AlertCircle className="w-4 h-4 mr-2 text-red-400" />
                Failed
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Revenue Recovered"
          value={`₹${(current?.overview.revenueRecovered ?? 0).toLocaleString('en-IN')}`}
          change={change.revenue}
          trend={change.revenue.startsWith('+') ? 'up' : 'down'}
          icon={<DollarSign className="w-6 h-6" />}
          color="green"
          loading={isLoading}
        />
        <MetricCard
          title="Recovery Rate"
          value={`${current?.overview.recoveryRate ?? 0}%`}
          change={change.rate}
          trend={change.rate.startsWith('+') ? 'up' : 'down'}
          icon={<TrendingUp className="w-6 h-6" />}
          color="primary"
          loading={isLoading}
        />
        <MetricCard
          title="Carts Recovered"
          value={(current?.overview.cartsRecovered ?? 0).toLocaleString('en-IN')}
          change={change.carts}
          trend={change.carts.startsWith('+') ? 'up' : 'down'}
          icon={<ShoppingCart className="w-6 h-6" />}
          color="blue"
          loading={isLoading}
        />
        <MetricCard
          title="Message Clicks"
          value={(current?.overview.messagesClicked ?? 0).toLocaleString('en-IN')}
          change={change.clickRate}
          trend={change.clickRate.startsWith('+') ? 'up' : 'down'}
          icon={<MessageSquare className="w-6 h-6" />}
          color="accent"
          loading={isLoading}
        />
      </div>

      {isLoading && (
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading live analytics...</div>
      )}

      {error && (
        <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>
      )}

      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">Revenue Trend</h3>
            <p className="text-sm text-blue-300/60">{dateRangeLabel} • Daily revenue recovered</p>
          </div>
        </div>
        {current ? (
          <RevenueChart data={current.chartData} variant="composed" />
        ) : (
          <div className="h-[300px] flex items-center justify-center text-blue-300/40">No data available</div>
        )}
      </div>

      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">Channel Performance</h3>
        </div>
        {current && current.channelStats.some((c) => c.sent > 0) ? (
          <>
            <div className="mb-6">
              <ChannelPerformanceChart data={current.channelStats} />
            </div>
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
                  {current.channelStats.map((row, i) => {
                    const conversionRate = row.sent > 0 ? ((row.converted / row.sent) * 100).toFixed(1) : '0.0'
                    return (
                      <tr key={i} className="border-b border-blue-700/20 hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4">
                          <ChannelBadge channel={row.channel} />
                        </td>
                        <td className="text-right py-3 px-4 text-blue-200">{row.sent.toLocaleString('en-IN')}</td>
                        <td className="text-right py-3 px-4 text-blue-200">{row.delivered.toLocaleString('en-IN')}</td>
                        <td className="text-right py-3 px-4 text-blue-200">{row.clicked.toLocaleString('en-IN')}</td>
                        <td className="text-right py-3 px-4 text-blue-200">{row.converted.toLocaleString('en-IN')}</td>
                        <td className="text-right py-3 px-4 font-medium text-emerald-300">₹{row.revenue.toLocaleString('en-IN')}</td>
                        <td className="text-right py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            Number(conversionRate) >= 15 ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' :
                            Number(conversionRate) >= 10 ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50' :
                            'bg-red-600/30 text-red-300 border border-red-500/50'
                          }`}>
                            {conversionRate}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : current ? (
          <div className="text-center py-12 text-blue-300/50">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No channel data yet. Start a campaign to see performance.</p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-cyan-300 mb-4">ROI Analysis</h3>
          {current ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-blue-700/30">
                <span className="text-blue-300/80">Revenue Recovered</span>
                <span className="font-semibold text-emerald-400">+₹{current.overview.revenueRecovered.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-blue-700/30">
                <span className="text-blue-300/80">Total Costs</span>
                <span className="font-semibold text-red-400">-₹{current.overview.totalCosts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-blue-700/30">
                <span className="text-blue-300/80">Net Revenue</span>
                <span className={`font-semibold ${current.overview.netRevenue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {current.overview.netRevenue >= 0 ? '+' : '-'}₹{Math.abs(current.overview.netRevenue).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-blue-700/30">
                <span className="text-blue-300/80">Messages Sent</span>
                <span className="font-medium text-white">{current.overview.messagesSent.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center py-4 bg-slate-700/40 border border-blue-700/30 -mx-4 px-4 rounded">
                <span className="font-semibold text-cyan-300">Net ROI</span>
                <span className={`font-bold text-xl ${current.overview.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {current.overview.roi >= 0 ? '+' : ''}{current.overview.roi}%
                </span>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-blue-300/40">No data available</div>
          )}
        </div>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-cyan-300 mb-4">Recovery Funnel</h3>
          {current ? (
            <div className="space-y-4">
              <FunnelStep
                label="Carts Abandoned"
                value={current.overview.cartsAbandoned}
                percentage={100}
                color="bg-blue-600"
              />
              <FunnelStep
                label="Messages Sent"
                value={current.overview.messagesSent}
                percentage={current.overview.cartsAbandoned > 0 ? (current.overview.messagesSent / current.overview.cartsAbandoned) * 100 : 0}
                color="bg-blue-500"
              />
              <FunnelStep
                label="Messages Clicked"
                value={current.overview.messagesClicked}
                percentage={current.overview.cartsAbandoned > 0 ? (current.overview.messagesClicked / current.overview.cartsAbandoned) * 100 : 0}
                color="bg-cyan-500"
              />
              <FunnelStep
                label="Carts Recovered"
                value={current.overview.cartsRecovered}
                percentage={current.overview.recoveryRate}
                color="bg-emerald-500"
              />
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-blue-300/40">No data available</div>
          )}
        </div>
      </div>

      {current?.insights && current.insights.tips.length > 0 && (
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-lg font-semibold text-cyan-300 mb-4">💡 Insights & Recommendations</h3>
          <div className="space-y-3">
            {current.insights.bestChannel && (
              <div className="flex items-start space-x-3 p-3 bg-slate-700/40 rounded-lg border border-blue-700/20">
                <span className="text-lg">🏆</span>
                <div>
                  <p className="text-sm text-white font-medium">Best Channel: {current.insights.bestChannel.channel}</p>
                  <p className="text-xs text-blue-300/60">₹{current.insights.bestChannel.revenue.toLocaleString('en-IN')} recovered · {current.insights.bestChannel.conversionRate}% conversion rate</p>
                </div>
              </div>
            )}
            {current.insights.avgConversionTime !== null && (
              <div className="flex items-start space-x-3 p-3 bg-slate-700/40 rounded-lg border border-blue-700/20">
                <span className="text-lg">⏱️</span>
                <div>
                  <p className="text-sm text-white font-medium">Avg. Conversion Time: {current.insights.avgConversionTime} hours</p>
                  <p className="text-xs text-blue-300/60">Time from first message to completed order</p>
                </div>
              </div>
            )}
            {current.insights.tips.map((tip, i) => (
              <div key={i} className="flex items-start space-x-3 p-3 bg-slate-700/40 rounded-lg border border-blue-700/20">
                <span className="text-lg">💡</span>
                <p className="text-sm text-blue-200">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const colors: Record<string, string> = {
    SMS: 'bg-blue-500/20 text-blue-300 border border-blue-500/40',
    WhatsApp: 'bg-green-500/20 text-green-300 border border-green-500/40',
    Email: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
    Push: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors[channel] || 'bg-gray-500/20 text-gray-300 border border-gray-500/40'}`}>
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
        <span className="text-sm text-blue-300/80">{label}</span>
        <span className="text-sm font-medium text-cyan-300">{value.toLocaleString('en-IN')}</span>
      </div>
      <div className="h-4 bg-slate-700/40 rounded-full overflow-hidden border border-blue-700/30">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <p className="text-xs text-blue-300/50 mt-0.5 text-right">{percentage.toFixed(1)}% of abandoned</p>
    </div>
  )
}
