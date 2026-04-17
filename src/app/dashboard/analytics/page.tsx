'use client'

import { useState } from 'react'
import { TrendingUp, DollarSign, ShoppingCart, MessageSquare, Download, Calendar } from 'lucide-react'

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState('30d')

  const metrics = {
    totalRevenue: 45870,
    recoveryRate: 15.8,
    cartsAbandoned: 2890,
    cartsRecovered: 456,
    avgOrderValue: 127.50,
    roi: 385,
    messagesSent: 3421,
    messagesClicked: 1876,
    clickRate: 54.8,
  }

  const channelData = [
    { channel: 'SMS', sent: 1567, delivered: 1542, clicked: 892, converted: 178, revenue: 22450, rate: 11.6 },
    { channel: 'WhatsApp', sent: 892, delivered: 878, clicked: 534, converted: 134, revenue: 17080, rate: 15.5 },
    { channel: 'Email', sent: 856, delivered: 823, clicked: 398, converted: 98, revenue: 5340, rate: 11.9 },
    { channel: 'Push', sent: 106, delivered: 98, clicked: 52, converted: 12, revenue: 1000, rate: 12.2 },
  ]

  const dailyData = [
    { date: 'Jan 1', abandoned: 89, recovered: 12, revenue: 1524 },
    { date: 'Jan 2', abandoned: 102, recovered: 18, revenue: 2340 },
    { date: 'Jan 3', abandoned: 78, recovered: 14, revenue: 1876 },
    { date: 'Jan 4', abandoned: 124, recovered: 21, revenue: 2890 },
    { date: 'Jan 5', abandoned: 156, recovered: 28, revenue: 3567 },
    { date: 'Jan 6', abandoned: 134, recovered: 19, revenue: 2456 },
    { date: 'Jan 7', abandoned: 98, recovered: 16, revenue: 2123 },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Deep dive into your recovery performance</p>
        </div>
        <div className="flex items-center space-x-2">
          <button className="btn-secondary flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            {dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : 'Last 90 days'}
          </button>
          <button className="btn-secondary flex items-center">
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

      {/* Revenue Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Daily revenue recovered</span>
          </div>
        </div>
        <div className="h-72 flex items-end justify-between space-x-2 px-4">
          {dailyData.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-primary-500 to-primary-400 rounded-t-lg transition-all hover:from-primary-600 hover:to-primary-500"
                style={{ height: `${(day.revenue / 4000) * 100}%` }}
              />
              <span className="text-xs text-gray-500 mt-2">{day.date}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Channel Performance */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Channel Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600">Channel</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Sent</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Delivered</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Clicked</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Converted</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Revenue</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-600">Rate</th>
              </tr>
            </thead>
            <tbody>
              {channelData.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <ChannelBadge channel={row.channel} />
                  </td>
                  <td className="text-right py-3 px-4 text-gray-700">{row.sent.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-gray-700">{row.delivered.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-gray-700">{row.clicked.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 text-gray-700">{row.converted.toLocaleString()}</td>
                  <td className="text-right py-3 px-4 font-medium text-green-600">${row.revenue.toLocaleString()}</td>
                  <td className="text-right py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      row.rate >= 15 ? 'bg-green-100 text-green-700' :
                      row.rate >= 10 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
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

function MetricCard({ title, value, change, trend, icon, color }: {
  title: string
  value: string | number
  change: string
  trend: 'up' | 'down'
  icon: React.ReactNode
  color: 'primary' | 'green' | 'accent' | 'blue'
}) {
  const colorClasses = {
    primary: 'bg-primary-100 text-primary-600',
    green: 'bg-green-100 text-green-600',
    accent: 'bg-accent-100 text-accent-600',
    blue: 'bg-blue-100 text-blue-600',
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          <p className={`text-sm mt-2 ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {change} from last period
          </p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
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
