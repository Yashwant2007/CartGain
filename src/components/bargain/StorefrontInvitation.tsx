'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import {
  shouldCountImpression,
  trackExperienceEvent,
} from '@/lib/bargain/experience/analytics'
import type {
  BargainExperienceConfig,
  CharacterStyle,
  InvitationFont,
  ShopkeeperPersonality,
} from '@/lib/bargain/experience/types'
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
  showAvatar?: boolean
  personality?: ShopkeeperPersonality
  characterStyle?: CharacterStyle
  motionEnabled?: boolean
  essentialMotionOnly?: boolean
  viewport?: 'desktop' | 'mobile'
}

const DESIGN_STYLES: Record<string, { bg: string; border: string; shadow: string; accent: string }> = {
  'smart-assistant': { bg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '#e2e8f0', shadow: '0 20px 60px rgba(15,23,42,0.12)', accent: '#4f46e5' },
  'playful-bargain-club': { bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '#fde68a', shadow: '0 20px 60px rgba(217,119,6,0.18)', accent: '#d97706' },
  'unlock-your-deal': { bg: 'linear-gradient(135deg, #fdf4ff 0%, #fae8ff 100%)', border: '#f0abfc', shadow: '0 20px 60px rgba(168,85,247,0.16)', accent: '#9333ea' },
  'human-shopkeeper': { bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '#86efac', shadow: '0 20px 60px rgba(16,185,129,0.16)', accent: '#059669' },
}

const FONT_STACKS: Record<InvitationFont, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  rounded: "'Trebuchet MS', 'Nunito', 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
}

const INVITATION_CSS = `
.cg-premium-invite {
  --cg-invite-accent: #7c3aed;
  --cg-invite-secondary: #a78bfa;
  --cg-invite-bg: #faf9ff;
  --cg-invite-border: #ddd6fe;
  --cg-invite-text: #111827;
  --cg-invite-button: #7c3aed;
  --cg-invite-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --cg-invite-avatar-scale: 1.24;
  --cg-invite-avatar-size-scale: 1;
  position: relative;
  display: block;
  width: 100%;
  max-width: 360px;
  min-height: 104px;
  padding: 11px 14px 11px 124px;
  overflow: visible;
  border: 1px solid var(--cg-invite-border);
  border-radius: 20px;
  background: var(--cg-invite-bg);
  box-shadow: 0 16px 40px rgba(76, 29, 149, 0.13), 0 2px 8px rgba(15, 23, 42, 0.05);
  color: var(--cg-invite-text);
  font-family: var(--cg-invite-font);
  text-align: left;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: transform 220ms cubic-bezier(.34,1.4,.64,1), box-shadow 220ms ease, border-color 220ms ease;
}
.cg-premium-invite::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.7);
}
.cg-premium-invite:hover { transform: translateY(-2px); border-color: var(--cg-invite-secondary); box-shadow: 0 24px 58px rgba(76,29,149,.18), 0 3px 10px rgba(15,23,42,.06); }
.cg-premium-invite:focus-visible { outline: 3px solid var(--cg-invite-secondary); outline-offset: 3px; }
.cg-premium-invite--compact { --cg-invite-avatar-scale: 1.14; max-width: 340px; min-height: 92px; padding: 9px 12px 9px 112px; border-radius: 18px; }
.cg-premium-invite--avatar-sm { --cg-invite-avatar-size-scale: .92; }
.cg-premium-invite--avatar-md { --cg-invite-avatar-size-scale: 1; }
.cg-premium-invite--avatar-lg { --cg-invite-avatar-size-scale: 1.16; }
.cg-premium-invite--mobile { --cg-invite-avatar-scale: 1.08; max-width: 330px; min-height: 100px; padding: 10px 12px 10px 104px; }
.cg-premium-invite--mobile.cg-premium-invite--compact { min-height: 86px; padding-left: 96px; }
.cg-premium-invite--no-avatar { padding-left: 16px; }
.cg-premium-invite-avatar {
  position: absolute;
  left: -20px;
  bottom: -14px;
  width: 128px;
  height: 140px;
  pointer-events: none;
  z-index: 1;
  transform: scale(calc(var(--cg-invite-avatar-scale) * var(--cg-invite-avatar-size-scale)));
  transform-origin: 0 100%;
  transition: transform 220ms ease;
  filter: drop-shadow(0 10px 12px rgba(76,29,149,.12));
}
.cg-premium-invite--compact .cg-premium-invite-avatar { left: -16px; bottom: -12px; }
.cg-premium-invite--mobile .cg-premium-invite-avatar { left: -12px; bottom: -10px; }
.cg-premium-invite-content { position: relative; z-index: 2; display: block; min-width: 0; }
.cg-premium-invite-title-row { display: flex; align-items: center; gap: 7px; }
.cg-premium-invite-sparkle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--cg-invite-secondary) 26%, transparent);
  color: var(--cg-invite-accent);
  font-size: 12px;
  animation: cgInviteSparkle 2.4s ease-in-out infinite;
}
.cg-premium-invite-title {
  display: block;
  min-width: 0;
  font-size: 16.5px;
  line-height: 1.18;
  font-weight: 800;
  letter-spacing: -0.015em;
}
.cg-premium-invite-highlight {
  color: var(--cg-invite-accent);
  background: linear-gradient(transparent 68%, color-mix(in srgb, var(--cg-invite-secondary) 55%, transparent) 68%);
  padding: 0 1px;
}
.cg-premium-invite-subtitle {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: #4b5563;
}
.cg-premium-invite-cta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  min-height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--cg-invite-button), var(--cg-invite-accent));
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(124,58,237,.24);
}
.cg-premium-invite-cta-arrow { display: inline-block; transition: transform 200ms ease; }
.cg-premium-invite:hover .cg-premium-invite-cta-arrow { transform: translateX(3px); }
.cg-premium-invite-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.cg-premium-invite-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--cg-invite-accent) 16%, transparent);
  border-radius: 999px;
  background: rgba(255,255,255,.72);
  color: #4b5563;
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}
.cg-premium-invite--compact .cg-premium-invite-title { font-size: 15.5px; }
.cg-premium-invite--compact .cg-premium-invite-subtitle { font-size: 11.5px; margin-top: 3px; }
.cg-premium-invite--compact .cg-premium-invite-cta { margin-top: 7px; min-height: 30px; }
.cg-premium-invite--compact .cg-premium-invite-indicators { margin-top: 6px; gap: 4px; }
.cg-premium-invite--compact .cg-premium-invite-indicator { padding: 2px 6px; font-size: 9.5px; }
.cg-premium-invite--left .cg-premium-invite-title-row,
.cg-premium-invite--left .cg-premium-invite-content { justify-content: flex-start; text-align: left; }
.cg-premium-invite--center .cg-premium-invite-title-row { justify-content: center; }
.cg-premium-invite--center .cg-premium-invite-content { text-align: center; }
.cg-premium-invite--center .cg-premium-invite-indicators { justify-content: center; }
@keyframes cgInviteSparkle { 0%,100% { transform: scale(.92) rotate(0deg); opacity: .75; } 50% { transform: scale(1.08) rotate(12deg); opacity: 1; } }
@media (max-width: 420px) {
  .cg-premium-invite { --cg-invite-avatar-scale: 1.08; max-width: 330px; min-height: 100px; padding: 10px 12px 10px 104px; }
  .cg-premium-invite--avatar-lg { --cg-invite-avatar-size-scale: 1.04; }
  .cg-premium-invite--avatar-sm { --cg-invite-avatar-size-scale: .88; }
  .cg-premium-invite-avatar { left: -12px; bottom: -10px; }
  .cg-premium-invite-title { font-size: 15.5px; }
  .cg-premium-invite-subtitle { font-size: 11.5px; }
  .cg-premium-invite-cta { margin-top: 8px; min-height: 31px; }
}
@media (prefers-reduced-motion: reduce) {
  .cg-premium-invite, .cg-premium-invite * { animation: none !important; transition: none !important; }
}
`

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
  showAvatar = true,
  personality = 'friendly_shopkeeper',
  characterStyle = 'signature',
  motionEnabled = true,
  essentialMotionOnly = false,
  viewport,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const ctaRef = useRef<HTMLSpanElement | null>(null)
  const impressionTracked = useRef(false)
  const openingRef = useRef(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const design = DESIGN_STYLES[experience.designVariant] || DESIGN_STYLES['smart-assistant']
  const t = (key: UiKey) => uiText(language, key)
  const headline = experience.invitationHeadline ?? experience.customGreeting ?? t('invitePremiumHeadline')
  const subtitle = experience.invitationSubtitle ?? t('invitePremiumSubtitle')
  const cta = experience.ctaLabel ?? t('inviteSmartCta')
  const indicators = [
    experience.invitationIndicators.quickReply ? { key: 'inviteQuickReply', icon: '⚡' } : null,
    experience.invitationIndicators.noPressure ? { key: 'inviteNoPressure', icon: '🛡' } : null,
    experience.invitationIndicators.smartDeals ? { key: 'inviteSmartDeals', icon: '🤝' } : null,
  ].filter((item): item is { key: UiKey; icon: string } => item !== null)
  const cssVars = {
    '--cg-invite-accent': experience.accentColor || design.accent,
    '--cg-invite-secondary': experience.accentSecondaryColor || experience.accentColor || design.accent,
    '--cg-invite-bg': experience.backgroundColor || design.bg,
    '--cg-invite-border': experience.borderColor || design.border,
    '--cg-invite-text': experience.textColor || '#111827',
    '--cg-invite-button': experience.buttonColor || experience.accentColor || design.accent,
    '--cg-invite-font': FONT_STACKS[experience.fontFamily] || FONT_STACKS.system,
  } as CSSProperties

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

  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current)
  }, [])

  function handleOpen() {
    if (openingRef.current) return
    openingRef.current = true
    if (openTimer.current) clearTimeout(openTimer.current)
    openTimer.current = setTimeout(() => { openingRef.current = false }, 900)
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

  const classNames = [
    'cg-premium-invite',
    experience.compact ? 'cg-premium-invite--compact' : '',
    `cg-premium-invite--avatar-${experience.avatarSize}`,
    viewport === 'mobile' ? 'cg-premium-invite--mobile' : '',
    showAvatar ? '' : 'cg-premium-invite--no-avatar',
    experience.invitationTextAlign === 'center' ? 'cg-premium-invite--center' : 'cg-premium-invite--left',
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleOpen}
      aria-label={experience.invitationCtaVisible ? cta : headline}
      className={classNames}
      style={cssVars}
    >
      <style dangerouslySetInnerHTML={{ __html: INVITATION_CSS }} />
      {showAvatar && (
        <span className="cg-premium-invite-avatar" aria-hidden="true">
          <ShopkeeperStage
            compact
            personality={personality}
            expression="encouraging"
            state="pointing"
            gesture="point"
            position="conversation"
            avatarVariant={experience.avatarVariant}
            characterStyle={characterStyle}
            essentialMotionOnly={essentialMotionOnly}
            name={headline}
            status=""
            line=""
            motionEnabled={motionEnabled}
            enable3D={experience.avatarVariant === 'robot'}
            targetRef={ctaRef}
          />
        </span>
      )}
      <span className="cg-premium-invite-content">
        <span className="cg-premium-invite-title-row">
          {experience.invitationSparkleVisible && <span className="cg-premium-invite-sparkle" aria-hidden="true">✦</span>}
          <span className="cg-premium-invite-title">{highlightPrice(headline)}</span>
        </span>
        <span className="cg-premium-invite-subtitle">{subtitle}</span>
        {experience.invitationCtaVisible && (
          <span ref={ctaRef} className="cg-premium-invite-cta">
            {cta}
            <span aria-hidden="true" className="cg-premium-invite-cta-arrow">→</span>
          </span>
        )}
        {indicators.length > 0 && (
          <span className="cg-premium-invite-indicators">
            {indicators.map((indicator) => (
              <span key={indicator.key} className="cg-premium-invite-indicator">
                {indicator.icon} {t(indicator.key)}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  )
}

function highlightPrice(text: string) {
  const index = text.toLowerCase().indexOf('price')
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <span className="cg-premium-invite-highlight">{text.slice(index, index + 5)}</span>
      {text.slice(index + 5)}
    </>
  )
}
