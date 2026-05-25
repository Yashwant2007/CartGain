import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}) => {
  const baseStyles = 'inline-flex items-center rounded-full font-semibold font-medium'

  const variantStyles = {
    default: 'bg-blue-900/40 border border-blue-700/60 text-blue-200',
    success: 'bg-green-900/40 border border-green-700/60 text-green-200',
    warning: 'bg-yellow-900/40 border border-yellow-700/60 text-yellow-200',
    error: 'bg-red-900/40 border border-red-700/60 text-red-200',
  }

  const sizeStyles = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  }

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {children}
    </span>
  )
}

export default Badge
