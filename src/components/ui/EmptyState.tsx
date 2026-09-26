import React from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/**
 * Shared empty-state surface: a centered icon + headline + optional CTA used
 * across dashboard views so "no data yet" looks consistent everywhere.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
    {icon && <div className="mb-4 text-5xl leading-none" aria-hidden="true">{icon}</div>}
    <h3 className="text-base font-semibold text-slate-100">{title}</h3>
    {description && <p className="mt-2 max-w-sm text-sm text-slate-400">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
)

export default EmptyState