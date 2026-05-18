import React from 'react'

type MetricCardProps = {
  title: string
  value: string | number
  change: string
  trend: 'up' | 'down'
  icon: React.ReactNode
  color: 'primary' | 'green' | 'accent' | 'blue'
  changeSuffix?: string
}

export function MetricCard({
  title,
  value,
  change,
  trend,
  icon,
  color,
  changeSuffix = 'from last period',
}: MetricCardProps) {
  const colorClasses = {
    primary: 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30',
    green: 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30',
    accent: 'bg-purple-400/20 text-purple-300 border border-purple-400/30',
    blue: 'bg-blue-400/20 text-blue-300 border border-blue-400/30',
  }

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm hover:border-blue-700/60 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-blue-300/80">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          <p className={`text-sm mt-2 ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
            {change} {changeSuffix}
          </p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
