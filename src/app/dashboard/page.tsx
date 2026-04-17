'use client'

import { useState } from 'react'
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

export default function DashboardPage() {
  // Mock data - will be fetched from API
  const stats = {
    cartsAbandoned: 1247,
    cartsRecovered: 186,
    revenueRecovered: 24750,
    recoveryRate: 14.9,
    messagesSent: 892,
    roi: 340,
  }

  const recentCarts = [
    { id: 1, customer: 'John D.', email: 'john@example.com', total: 125.00, status: 'recovered', channel: 'sms', time: '2 min ago' },
    { id: 2, customer: 'Sarah M.', email: 'sarah@example.com', total: 89.50, status: 'pending', channel: 'email', time: '5 min ago' },
    { id: 3, customer: 'Mike R.', email: 'mike@example.com', total: 234.00, status: 'recovered', channel: 'whatsapp', time: '12 min ago' },
    { id: 4, customer: 'Emma L.', email: 'emma@example.com', total: 67.00, status: 'sent', channel: 'sms', time: '18 min ago' },
    { id: 5, customer: 'Alex K.', email: 'alex@example.com', total: 312.00, status: 'abandoned', channel: '-', time: '25 min ago' },
  ]

  const activeCampaigns = [
    { id: 1, name: 'Standard Recovery', carts: 156, recovered: 28, rate: 17.9, active: true },
    { id: 2, name: 'High Value Carts', carts: 42, recovered: 12, rate: 28.6, active: true },
    { id: 3, name: 'Weekend Special', carts: 89, recovered: 8, rate: 9.0, active: false },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Track your cart recovery performance</p>
        </div>
        <button className="btn-primary flex items-center">
          <Plus className="w-5 h-5 mr-2" />
          New Campaign
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Carts Abandoned"
          value={stats.cartsAbandoned.toLocaleString()}
          change="+12%"
          trend="up"
          icon={<ShoppingCart className="w-6 h-6" />}
          color="primary"
        />
        <StatCard
          title="Carts Recovered"
          value={stats.cartsRecovered.toLocaleString()}
          change="+24%"
          trend="up"
          icon={<DollarSign className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Revenue Recovered"
          value={`$${stats.revenueRecovered.toLocaleString()}`}
          change="+18%"
          trend="up"
          icon={<TrendingUp className="w-6 h-6" />}
          color="accent"
        />
        <StatCard
          title="Recovery Rate"
          value={`${stats.recoveryRate}%`}
          change="+2.1%"
          trend="up"
          icon={<MessageSquare className="w-6 h-6" />}
          color="blue"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart Placeholder */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Recovered (Last 30 Days)</h3>
          <div className="h-64 bg-gradient-to-br from-primary-50 to-accent-50 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Interactive chart will render here</p>
              <p className="text-sm">Using Recharts library</p>
            </div>
          </div>
        </div>

        {/* Channel Performance */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Channel Performance</h3>
          <div className="space-y-4">
            <ChannelBar name="SMS" recovered={89} total={456} rate={19.5} color="bg-blue-500" />
            <ChannelBar name="WhatsApp" recovered={52} total={234} rate={22.2} color="bg-green-500" />
            <ChannelBar name="Email" recovered={38} total={412} rate={9.2} color="bg-purple-500" />
            <ChannelBar name="Push" recovered={7} total={145} rate={4.8} color="bg-orange-500" />
          </div>
        </div>
      </div>

      {/* Recent Activity & Active Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Carts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Carts</h3>
            <LinkButton href="/dashboard/campaigns">View All</LinkButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Total</th>
                  <th className="pb-3 font-medium">Channel</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentCarts.map((cart) => (
                  <tr key={cart.id} className="border-b last:border-0">
                    <td className="py-3">
                      <div>
                        <div className="font-medium text-gray-900">{cart.customer}</div>
                        <div className="text-gray-500 text-xs">{cart.email}</div>
                      </div>
                    </td>
                    <td className="py-3 font-medium text-gray-900">${cart.total.toFixed(2)}</td>
                    <td className="py-3">
                      <ChannelBadge channel={cart.channel} />
                    </td>
                    <td className="py-3">
                      <StatusBadge status={cart.status} />
                    </td>
                    <td className="py-3 text-gray-500">{cart.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Active Campaigns</h3>
            <LinkButton href="/dashboard/campaigns">Manage</LinkButton>
          </div>
          <div className="space-y-4">
            {activeCampaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">{campaign.name}</span>
                    {campaign.active && (
                      <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {campaign.recovered} recovered from {campaign.carts} carts ({campaign.rate}% rate)
                  </div>
                </div>
                <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, change, trend, icon, color }: {
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
            {change} from last month
          </p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
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
        <span className="text-sm font-medium text-gray-700">{name}</span>
        <span className="text-sm text-gray-500">{recovered}/{total} ({rate}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
    sms: 'bg-blue-100 text-blue-700',
    whatsapp: 'bg-green-100 text-green-700',
    email: 'bg-purple-100 text-purple-700',
    push: 'bg-orange-100 text-orange-700',
  }

  const icons: Record<string, React.ReactNode> = {
    sms: <MessageSquare className="w-3 h-3 mr-1" />,
    whatsapp: <MessageSquare className="w-3 h-3 mr-1" />,
    email: <Mail className="w-3 h-3 mr-1" />,
    push: <Bell className="w-3 h-3 mr-1" />,
  }

  if (channel === '-') return <span className="text-gray-400">-</span>

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badges[channel] || 'bg-gray-100 text-gray-700'}`}>
      {icons[channel]}
      {channel.toUpperCase()}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const badges: Record<string, string> = {
    recovered: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    sent: 'bg-blue-100 text-blue-700',
    abandoned: 'bg-gray-100 text-gray-700',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badges[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
      {children}
    </a>
  )
}
