'use client'

import dynamic from 'next/dynamic'
import type { RevenueChartDataPoint } from './RevenueChartClient'

function ChartFallback() {
  return <div className="h-[300px] w-full animate-pulse rounded-lg bg-slate-800/40" />
}

export const RevenueChart = dynamic(
  () => import('./RevenueChartClient').then((mod) => mod.RevenueChart),
  { ssr: false, loading: ChartFallback },
)

export const ChannelPerformanceChart = dynamic(
  () => import('./RevenueChartClient').then((mod) => mod.ChannelPerformanceChart),
  { ssr: false, loading: ChartFallback },
)

export type { RevenueChartDataPoint }
