import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { fromDb } from '@/lib/bargain/experience/config'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { isProduction } from '@/lib/observability/version'

export const dynamic = 'force-dynamic'

const EXPERIENCE_EVENT_TYPES = ['invitation_impression', 'invitation_click', 'chat_open'] as const
type ExperienceEventType = (typeof EXPERIENCE_EVENT_TYPES)[number]
const EVENT_TYPES = new Set<string>(EXPERIENCE_EVENT_TYPES)
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/
const KEY_PATTERN = /^[a-zA-Z0-9_-]{8,120}$/

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function parseOccurredAt(value: unknown, now: number): Date | null {
  if (typeof value !== 'string') return null
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return null
  // Reject stale/future events; clamp tiny clock skew instead of trusting it.
  if (at < now - 24 * 60 * 60 * 1000 || at > now + 10 * 60 * 1000) return null
  return new Date(at)
}

/**
 * POST /api/bargain/experience/event — unauthenticated storefront telemetry.
 *
 * Only three presentation events are accepted. Design/personality always come
 * from the server-side published config; the client cannot write analytics for
 * a design it is not currently serving. Preview frames are rejected. No message
 * text, customer identity, or order data is accepted.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isProduction() && process.env.ENABLE_DEV_ANALYTICS !== 'true' && process.env.NODE_ENV !== 'test') {
      return NextResponse.json({ ok: true, ignored: true })
    }
    const rate = await checkSimpleRateLimit(`bargain_exp_event_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ ok: true }, { status: 202, headers: { 'Retry-After': String(rate.retryAfter) } })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Invalid body' }, { status: 400 })
    }
    if (body.isPreview === true) return NextResponse.json({ ok: true, ignored: true })

    const eventId = clean(body.eventId, 80)
    const storeId = clean(body.storeId, 64)
    const eventType = clean(body.eventType, 40)
    const visitorKey = clean(body.visitorKey, 120)
    const sessionId = clean(body.sessionId, 80)
    const productId = clean(body.productId, 80)
    const variantId = clean(body.variantId, 80)
    const source = clean(body.source, 20) || 'storefront'
    const occurredAt = parseOccurredAt(body.occurredAt, Date.now())

    if (!eventId || !ID_PATTERN.test(eventId)) {
      return NextResponse.json({ message: 'Invalid eventId' }, { status: 400 })
    }
    if (!storeId) return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    if (!eventType || !EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ message: 'Invalid eventType' }, { status: 400 })
    }
    if (!visitorKey || !KEY_PATTERN.test(visitorKey)) {
      return NextResponse.json({ message: 'Invalid visitorKey' }, { status: 400 })
    }
    if (!occurredAt) return NextResponse.json({ message: 'Invalid occurredAt' }, { status: 400 })

    const store = await prisma.store.findFirst({ where: { id: storeId, isActive: true }, select: { id: true } })
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

    const config = await prisma.bargainConfig.findUnique({ where: { storeId: store.id } })
    if (!config) return NextResponse.json({ ok: true, ignored: true })
    const experience = fromDb(config, 'published')

    let linkedSessionId: string | null = null
    if (sessionId && ID_PATTERN.test(sessionId)) {
      const linked = await prisma.bargainSession.findFirst({
        where: { id: sessionId, storeId: store.id },
        select: { id: true },
      })
      linkedSessionId = linked?.id ?? null
    }

    try {
      await prisma.bargainExperienceEvent.create({
        data: {
          eventId,
          storeId: store.id,
          sessionId: linkedSessionId,
          visitorKey,
          eventType: eventType as ExperienceEventType,
          designVariant: experience.designVariant,
          personality: experience.personality,
          productId: productId && KEY_PATTERN.test(productId) ? productId : null,
          variantId: variantId && KEY_PATTERN.test(variantId) ? variantId : null,
          source: source === 'cart' || source === 'item' ? source : 'storefront',
          isPreview: false,
          occurredAt,
        },
      })
    } catch (error: any) {
      // eventId is the idempotency key; duplicate beacons are a no-op.
      if (error?.code !== 'P2002') throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[BARGAIN_EXPERIENCE_EVENT]', error)
    return NextResponse.json({ ok: true }, { status: 202 })
  }
}
