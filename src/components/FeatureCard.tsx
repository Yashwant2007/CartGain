import React from 'react'

interface FeatureCardProps {
  icon?: React.ReactNode
  title: string
  description: string
  features?: string[]
  className?: string
  role?: string
  badge?: string
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  features,
  className = '',
  role,
  badge,
}) => {
  return (
    <div 
      role={role}
      className={`bg-slate-800/40 rounded-xl p-6 sm:p-8 border border-blue-700/50 hover:border-blue-500/70 hover:shadow-xl transition duration-300 flex flex-col h-full ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-primary-100 to-primary-50 rounded-lg flex items-center justify-center mb-6 flex-shrink-0">
          {icon}
        </div>
      )}
      
      <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
        {title}
        {badge && <span className="ml-2 text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">{badge}</span>}
      </h3>
      <p className="text-blue-100 mb-6 flex-grow">{description}</p>
      
      {features && features.length > 0 && (
        <ul className="space-y-2 text-xs sm:text-sm text-blue-100">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-primary-600 rounded-full flex-shrink-0"></div>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FeatureCard
