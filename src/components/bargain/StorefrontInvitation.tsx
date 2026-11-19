'use client'

import { useEffect, useRef, useState } from 'react'
import type { BargainExperienceConfig } from '@/lib/bargain/experience/types'
import { shouldCountImpression, trackExperienceEvent } from '@/lib/bargain/experience/analytics'
import { uiText, type UiKey } from '@/lib/bargain/i18n'

interface Props {
  experience: BargainExperienceConfig
  onOpen: () => void
  language?: string
  storeName?: string
  storeId?: string
  productId?: string | null
  variantId?: string | null
  source?: 'item' | 'cart' | 'storefront'
  trackingEnabled?: boolean
  preview?: boolean
}

const DESIGN_STYLES: Record<string, { bg: string; border: string; shadow: string; accent: string }> = {
  'smart-assistant': { bg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '#e2e8f0', shadow: '0 20px 60px rgba(15,23,42,0.12)', accent: '#4f46e5' },
  'playful-bargain-club': { bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '#fde68a', shadow: '0 20px 60px rgba(217,119,6,0.18)', accent: '#d97706' },
  'unlock-your-deal': { bg: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', border: '#f0abfc', shadow: '0 20px 60px rgba(168,85,247,0.16)', accent: '#9333ea' },
  'human-shopkeeper': { bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '#86efac', shadow: '0 20px 60px rgba(16,185,129,0.16)', accent: '#059669' },
}

export default function StorefrontInvitation({
  experience,
  onOpen,
  language = 'auto',
  storeId,
  productId,
  variantId,
  source = 'storefront',
  trackingEnabled = false,
  preview = false,
}: Props) {
  const [expression, setExpression] = useState<'idle' | 'curious' | 'listening'>('idle')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const impressionTracked = useRef(false)
  const design = DESIGN_STYLES[experience.designVariant] || DESIGN_STYLES['smart-assistant']
  const accent = experience.accentColor || design.accent
  const t = (key: UiKey) => uiText(language, key)
  const copy = experience.customGreeting || t(defaultCopyKey(experience.designVariant))
  const cta = experience.ctaLabel || t(defaultCtaKey(experience.designVariant))
  const animate = experience.motionEnabled

  useEffect(() => {
    if (!trackingEnabled || preview || !storeId || !productId || impressionTracked.current) return
    if (!shouldCountImpression(storeId, productId, experience)) return
    const node = buttonRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (timer) return
          timer = setTimeout(() => {
            if (impressionTracked.current) return
            impressionTracked.current = true
            trackExperienceEvent({
              storeId,
              eventType: 'invitation_impression',
              experience,
              productId,
              variantId,
              source,
            })
          }, 800)
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: [0.5] }
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
    // Experience identity is the published snapshot at mount; changing design
    // remounts/re-evaluates and gets its own qualified impression.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingEnabled, preview, storeId, productId, variantId, source, experience.designVariant, experience.publishedVersion])

  function handleOpen() {
    if (trackingEnabled && !preview && storeId) {
      trackExperienceEvent({
        storeId,
        eventType: 'invitation_click',
        experience,
        productId,
        variantId,
        source,
      })
    }
    onOpen()
  }

  return (
    <button
      ref={buttonRef}
      onClick={handleOpen}
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
        borderRadius: 24,
        background: experience.accentColor ? `linear-gradient(135deg, ${accent}18 0%, #ffffff 100%)` : design.bg,
        border: `1px solid ${accent}55`,
        boxShadow: design.shadow,
        cursor: 'pointer',
        transform: animate && expression === 'curious' ? 'translateY(-3px)' : 'none',
        transition: animate ? 'transform 220ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 220ms ease' : 'none',
        textAlign: 'left',
      }}
      onFocus={() => setExpression('listening')}
      onBlur={() => setExpression('idle')}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>{copy}</div>
        <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, color: accent, fontWeight: 700, fontSize: 13 }}>
          {cta}
          <span aria-hidden style={{ display: 'inline-block', transition: 'transform 0.2s ease', transform: expression === 'curious' ? 'translateX(3px)' : 'none' }}>→</span>
        </div>
      </div>
    </button>
  )
}

function defaultCopyKey(design: string): UiKey {
  switch (design) {
    case 'playful-bargain-club': return 'invitePlayfulCopy'
    case 'unlock-your-deal': return 'inviteUnlockCopy'
    case 'human-shopkeeper': return 'inviteHumanCopy'
    default: return 'inviteSmartCopy'
  }
}

function defaultCtaKey(design: string): UiKey {
  switch (design) {
    case 'playful-bargain-club': return 'invitePlayfulCta'
    case 'unlock-your-deal': return 'inviteUnlockCta'
    case 'human-shopkeeper': return 'inviteHumanCta'
    default: return 'inviteSmartCta'
  }
}
