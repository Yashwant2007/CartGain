'use client'

import { useState } from 'react'
import ShopkeeperAvatar from './ShopkeeperAvatar'
import type { BargainExperienceConfig } from '@/lib/bargain/experience/types'
import type { ExpressionState } from './ShopkeeperAvatar'

interface Props {
  experience: BargainExperienceConfig
  onOpen: () => void
  storeName?: string
}

const DESIGN_STYLES: Record<string, { bg: string; border: string; shadow: string; accent: string }> = {
  'smart-assistant': { bg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '#e2e8f0', shadow: '0 20px 60px rgba(15,23,42,0.12)', accent: '#4f46e5' },
  'playful-bargain-club': { bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '#fde68a', shadow: '0 20px 60px rgba(217,119,6,0.18)', accent: '#d97706' },
  'unlock-your-deal': { bg: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', border: '#f0abfc', shadow: '0 20px 60px rgba(168,85,247,0.16)', accent: '#9333ea' },
  'human-shopkeeper': { bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '#86efac', shadow: '0 20px 60px rgba(16,185,129,0.16)', accent: '#059669' },
}

export default function StorefrontInvitation({ experience, onOpen }: Props) {
  const [expression, setExpression] = useState<ExpressionState>('idle')
  const design = DESIGN_STYLES[experience.designVariant] || DESIGN_STYLES['smart-assistant']
  const accent = experience.accentColor || design.accent
  const copy = experience.customGreeting || getDefaultCopy(experience.designVariant)
  const cta = experience.ctaLabel || getDefaultCta(experience.designVariant)
  const animate = experience.motionEnabled

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setExpression('curious')}
      onMouseLeave={() => setExpression('idle')}
      aria-label={cta}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        maxWidth: 320,
        padding: experience.compact ? '10px 14px' : '14px 18px',
        borderRadius: 16,
        background: experience.accentColor ? `linear-gradient(135deg, ${accent}15 0%, #ffffff 100%)` : design.bg,
        border: `1px solid ${accent}44`,
        boxShadow: design.shadow,
        cursor: 'pointer',
        transition: animate ? 'transform 200ms ease, box-shadow 200ms ease' : 'none',
        textAlign: 'left',
      }}
      onFocus={() => setExpression('listening')}
      onBlur={() => setExpression('idle')}
    >
      {experience.avatarEnabled && (
        <ShopkeeperAvatar
          personality={experience.personality}
          expression={expression}
          size={experience.avatarSize}
          motionEnabled={experience.motionEnabled}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>{copy}</div>
        <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, color: accent, fontWeight: 700, fontSize: 13 }}>
          {cta}
          <span aria-hidden>→</span>
        </div>
      </div>
    </button>
  )
}

function getDefaultCopy(design: string) {
  switch (design) {
    case 'playful-bargain-club': return 'Think you can beat this price? 😏'
    case 'unlock-your-deal': return 'Your personal deal awaits ✨'
    case 'human-shopkeeper': return 'Bhai, price ki baat karein? 😄'
    default: return "Got a price in mind? 💬 Let's talk."
  }
}

function getDefaultCta(design: string) {
  switch (design) {
    case 'playful-bargain-club': return 'Challenge the price'
    case 'unlock-your-deal': return 'Unlock your deal'
    case 'human-shopkeeper': return "Let's negotiate"
    default: return 'Make an offer'
  }
}
