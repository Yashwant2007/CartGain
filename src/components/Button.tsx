import React from 'react'
import Link from 'next/link'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLink?: boolean
  href?: string
  external?: boolean
  children: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    isLink = false,
    href,
    external = false,
    className = '',
    children,
    ...props
  }, ref) => {
    const baseStyles = 'font-semibold rounded-lg transition-all duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 min-h-12 inline-flex items-center justify-center gap-2'
    
    const variantStyles = {
      primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl',
      secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300',
      accent: 'bg-accent-600 hover:bg-accent-700 text-white shadow-lg hover:shadow-xl',
      ghost: 'text-primary-600 hover:bg-primary-50 border border-primary-200',
    }

    const sizeStyles = {
      sm: 'px-3 py-2 text-xs sm:text-sm',
      md: 'px-6 py-3 text-sm sm:text-base',
      lg: 'px-8 py-4 text-base sm:text-lg',
    }

    const buttonClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`

    if (isLink && href) {
      if (external) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClassName}
          >
            {children}
          </a>
        )
      }
      return (
        <Link href={href} className={buttonClassName}>
          {children}
        </Link>
      )
    }

    return (
      <button
        ref={ref}
        className={buttonClassName}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
