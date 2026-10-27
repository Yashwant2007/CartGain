'use client'

import type { BargainExperienceConfig } from './types'

export const EXPERIENCE_EVENT_TYPES = [
  'invitation_impression',
  'invitation_click',
  'chat_open',
] as const

export type ExperienceEventType = (typeof EXPERIENCE_EVENT_TYPES)[number]

const VISITOR_KEY = 'cartgain_exp_visitor'
const IMPRESSION_PREFIX = 'cartgain_exp_impression:'
const IMPRESSION_TTL_MS = 12 * 60 * 60 * 1000

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

export function getExperienceVisitorKey(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY)
    if (existing && /^[a-zA-Z0-9_-]{8,80}$/.test(existing)) return existing
    const next = randomId()
    window.localStorage.setItem(VISITOR_KEY, next)
    return next
  } catch {
    return null
  }
}

/** One qualified impression per visitor/product/design in a 12h window. */
export function shouldCountImpression(storeId: string, productId: string, experience: BargainExperienceConfig): boolean {
  if (typeof window === 'undefined') return false
  try {
    const key = `${IMPRESSION_PREFIX}${storeId}:${productId}:${experience.designVariant}:${experience.publishedVersion}`
    const raw = window.localStorage.getItem(key)
    const at = raw ? Number(raw) : 0
    if (Number.isFinite(at) && Date.now() - at < IMPRESSION_TTL_MS) return false
    window.localStorage.setItem(key, String(Date.now()))
    return true
  } catch {
    return true
  }
}

interface TrackArgs {
  storeId: string
  eventType: ExperienceEventType
  experience: BargainExperienceConfig
  productId?: string | null
  variantId?: string | null
  sessionId?: string | null
  source?: 'item' | 'cart' | 'storefront'
  preview?: boolean
  dedupeKey?: string
}

/**
 * Fire-and-forget presentation telemetry. Preview frames are never recorded,
 * and the server re-derives design/personality from the published snapshot —
 * the browser cannot attribute metrics to a variant.
 */
export function trackExperienceEvent({
  storeId,
  eventType,
  experience,
  productId,
  variantId,
  sessionId,
  source = 'storefront',
  preview = false,
  dedupeKey,
}: TrackArgs): void {
  if (preview || typeof window === 'undefined' || !storeId || !eventType) return
  if (dedupeKey) {
    try {
      const key = `cartgain_exp_event:${dedupeKey}`
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {}
  }

  const visitorKey = getExperienceVisitorKey()
  if (!visitorKey) return
  const payload = {
    eventId: randomId(),
    storeId,
    eventType,
    visitorKey,
    sessionId: sessionId || undefined,
    productId: productId || undefined,
    variantId: variantId || undefined,
    source,
    occurredAt: new Date().toISOString(),
    clientDesign: experience.designVariant,
    clientPersonality: experience.personality,
  }
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon('/api/bargain/experience/event', blob)) return
    }
    void fetch('/api/bargain/experience/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {}
}
