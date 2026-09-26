import React from 'react'

interface LoadingStateProps {
  label?: string
  className?: string
}

/**
 * Shared loading surface: centered spinner + optional label. Keeps every
 * "Loading…" moment visually consistent and screen-reader friendly.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading…',
  className = '',
}) => (
  <div
    role="status"
    aria-live="polite"
    className={`flex flex-col items-center justify-center py-14 px-6 text-slate-400 ${className}`}
  >
    <span className="block h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" aria-hidden="true" />
    <span className="mt-3 text-sm">{label}</span>
  </div>
)

export default LoadingState