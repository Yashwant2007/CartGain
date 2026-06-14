'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts'

interface RevenueChartProps {
  data: Array<{
    date: string
    revenue: number
    recoveredCarts: number
    abandonedCarts: number
  }>
  variant?: 'line' | 'bar' | 'composed'
}

export function RevenueChart({ data, variant = 'line' }: RevenueChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      // Return mock data for empty state
      return Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: 0,
        recoveredCarts: 0,
        abandonedCarts: 0,
      }))
    }
    return data
  }, [data])

  const hasData = data && data.length > 0 && data.some((d) => d.revenue > 0)

  const chartProps = {
    data: chartData,
    margin: { top: 5, right: 30, left: 0, bottom: 5 },
  }

  const commonProps = {
    dataKey: 'revenue',
    stroke: '#06b6d4',
    fill: '#06b6d4',
    name: 'Revenue (₹)',
    isAnimationActive: true,
  }

  if (variant === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart {...chartProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Line {...commonProps} strokeWidth={2} dot={{ fill: '#06b6d4', r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (variant === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart {...chartProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar {...commonProps} />
          <Bar dataKey="recoveredCarts" fill="#10b981" name="Recovered Carts" />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Composed chart
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart {...chartProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '8px',
          }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Legend wrapperStyle={{ paddingTop: '20px' }} />
        <Bar dataKey="revenue" fill="#06b6d4" name="Revenue (₹)" />
        <Line
          dataKey="recoveredCarts"
          stroke="#10b981"
          name="Recovered Carts"
          strokeWidth={2}
          yAxisId="right"
        />
        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function ChannelPerformanceChart({
  data,
}: {
  data: Array<{
    channel: string
    sent: number
    delivered: number
    clicked: number
    converted: number
  }>
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="channel" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '8px',
          }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Legend wrapperStyle={{ paddingTop: '20px' }} />
        <Bar dataKey="sent" fill="#06b6d4" name="Sent" />
        <Bar dataKey="delivered" fill="#3b82f6" name="Delivered" />
        <Bar dataKey="clicked" fill="#10b981" name="Clicked" />
        <Bar dataKey="converted" fill="#f59e0b" name="Converted" />
      </BarChart>
    </ResponsiveContainer>
  )
}
