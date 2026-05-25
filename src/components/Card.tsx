import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'gradient' | 'glass'
  hoverable?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = '', variant = 'default', hoverable = false }, ref) => {
    const baseStyles = 'rounded-xl border transition-all duration-300'

    const variantStyles = {
      default: 'bg-slate-800/40 border-blue-700/50',
      gradient: 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-500/60',
      glass: 'bg-slate-800/40 backdrop-blur-sm border-blue-700/30',
    }

    const interactiveStyles = hoverable ? 'hover:border-blue-500/70 hover:shadow-xl cursor-pointer' : ''

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${interactiveStyles} ${className}`}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`mb-6 ${className}`}>{children}</div>
)

export const CardTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h3 className={`text-xl sm:text-2xl font-bold text-white ${className}`}>{children}</h3>
)

export const CardDescription = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-blue-100 text-sm sm:text-base ${className}`}>{children}</p>
)

export const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={className}>{children}</div>
)

export const CardFooter = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`mt-6 ${className}`}>{children}</div>
)
