'use client'

import { useEffect, useState } from 'react'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'

interface Props {
  personality: ShopkeeperPersonality
  expression?: ExpressionState
  size?: 'sm' | 'md' | 'lg'
  motionEnabled?: boolean
  className?: string
}

const SIZE_MAP = { sm: 32, md: 40, lg: 52 }

const COLORS: Record<ShopkeeperPersonality, { bg: string; accent: string }> = {
  friendly_shopkeeper: { bg: '#eef2ff', accent: '#4f46e5' },
  strict_shopkeeper: { bg: '#f1f5f9', accent: '#475569' },
  playful_shopkeeper: { bg: '#fef3c7', accent: '#d97706' },
}

export function ShopkeeperAvatar({ personality, expression = 'idle', size = 'md', motionEnabled = true, className = '' }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false)
  const px = SIZE_MAP[size]
  const c = COLORS[personality]
  const animate = motionEnabled && !reducedMotion

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const getScale = () => {
    if (!animate) return 1
    if (expression === 'thinking') return 1.02
    if (expression === 'celebrating') return 1.08
    if (expression === 'surprised') return 1.06
    if (expression === 'amused') return 1.04
    return 1
  }

  const getRotation = () => {
    if (!animate) return 0
    if (expression === 'curious' || expression === 'listening') return 2
    if (expression === 'skeptical') return -3
    if (personality === 'playful_shopkeeper' && expression === 'amused') return 4
    return 0
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={`Shopkeeper avatar - ${personality.replace('_', ' ')}, ${expression}`}
      style={{
        width: px,
        height: px,
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, white 0%, ${c.bg} 100%)`,
        border: `2px solid ${c.accent}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        transition: animate ? 'transform 200ms ease' : 'none',
        transform: `scale(${getScale()}) rotate(${getRotation()}deg)`,
        boxShadow: expression === 'celebrating' && animate ? `0 0 0 4px ${c.accent}22` : 'none',
      }}
    >
      <svg width={px * 0.6} height={px * 0.6} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="10" r="3.5" fill={c.accent} opacity="0.8" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke={c.accent} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        {expression === 'thinking' && animate && (
          <g>
            <circle cx="16" cy="6" r="1" fill={c.accent}>
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite" />
            </circle>
            <circle cx="18" cy="5" r="0.8" fill={c.accent}>
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin="0.2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
        {expression === 'surprised' && (
          <circle cx="12" cy="10" r="4" stroke={c.accent} strokeWidth="1.5" fill="none" opacity="0.6" />
        )}
        {expression === 'skeptical' && (
          <path d="M9 9L11 11M13 11L15 9" stroke={c.accent} strokeWidth="1.5" strokeLinecap="round" />
        )}
        {expression === 'celebrating' && animate && (
          <circle cx="12" cy="4" r="1.5" fill={c.accent}>
            <animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="0.6s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
    </div>
  )
}

export type { ExpressionState }
export default ShopkeeperAvatar
