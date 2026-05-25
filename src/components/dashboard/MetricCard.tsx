import React from 'react'

type MetricCardProps = {
  title: string
  value: string | number
  change: string
  trend: 'up' | 'down'
  icon: React.ReactNode
  color: 'primary' | 'green' | 'accent' | 'blue'
  changeSuffix?: string
  loading?: boolean
}

export function MetricCard({
  title,
  value,
  change,
  trend,
  icon,
  color,
  changeSuffix = 'from last period',
  loading = false,
}: MetricCardProps) {
  const colorClasses = {
    primary: 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30',
    green: 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30',
    accent: 'bg-purple-400/20 text-purple-300 border border-purple-400/30',
    blue: 'bg-blue-400/20 text-blue-300 border border-blue-400/30',
  }

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-lg sm:rounded-xl p-4 sm:p-6 backdrop-blur-sm hover:border-blue-700/60 transition-all duration-200 h-full min-h-28">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-blue-300/80 mb-2 truncate">{title}</p>
          {loading ? (
            <div className="h-8 sm:h-10 bg-slate-700/50 rounded animate-pulse mb-2 w-24" />
          ) : (
            <p className="text-2xl sm:text-3xl font-bold text-white mb-2 truncate">{value}</p>
          )}
          {loading ? (
            <div className="h-4 bg-slate-700/50 rounded animate-pulse w-32" />
          ) : (
            <p className={`text-xs sm:text-sm mt-2 font-medium ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className="inline-block mr-1">{trend === 'up' ? '↑' : '↓'}</span>
              {change} {changeSuffix}
            </p>
          )}
        </div>
        <div className={`p-2.5 sm:p-3 rounded-lg flex-shrink-0 ${colorClasses[color]}`}>
          <div className="w-5 h-5 sm:w-6 sm:h-6">
            {icon}
          </div>
        </div>
      </div>
    </div>
  )
}
