import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { DESIGN_VARIANT_META, PERSONALITY_META } from '@/lib/bargain/experience/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/bargain?storeId=…&days=30
 *
 * Two completely separate truths, joined only by date/store:
 *  1. The bargain funnel from BargainSession rows (started → purchased).
 *  2. Storefront presentation telemetry from BargainExperienceEvent rows
 *     (qualified impression → invitation click → chat open).
 *
 * Design/personality revenue uses the snapshot stored on each session at start,
 * so a later publish never rewrites historical performance. Presentation events
 * also carry the server-resolved published variant at receipt time. Sessions
 * that predate the experience layer are reported as "unknown", never guessed.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('storeId')
  if (!storeId) {
    return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
  }

  const store = await prisma.store.findFirst({
    where: { id: storeId, userId: session.user.id },
    select: { id: true },
  })
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  const daysRaw = Number(request.nextUrl.searchParams.get('days') || '30')
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 365) : 30
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [sessions, eventCounts, uniqueVisitorRows] = await Promise.all([
    prisma.bargainSession.findMany({
      where: { storeId: store.id, startedAt: { gte: start } },
      select: {
        id: true,
        startedAt: true,
        status: true,
        originalPrice: true,
        finalPrice: true,
        discountCode: true,
        purchasedAt: true,
        purchaseValue: true,
        purchaseGrossValue: true,
        purchaseRefundedAmount: true,
        purchaseRefundStatus: true,
        experienceDesign: true,
        experiencePersonality: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.bargainExperienceEvent.groupBy({
      by: ['eventType', 'designVariant', 'personality'],
      where: { storeId: store.id, occurredAt: { gte: start }, isPreview: false },
      _count: { _all: true },
    }),
    prisma.bargainExperienceEvent.findMany({
      where: { storeId: store.id, occurredAt: { gte: start }, isPreview: false },
      select: { visitorKey: true, designVariant: true, personality: true },
      distinct: ['visitorKey', 'designVariant', 'personality'],
    }),
  ])

  const sessionIds = sessions.map((s) => s.id)
  const offers =
    sessionIds.length > 0
      ? await prisma.bargainMessage.findMany({
          where: { sessionId: { in: sessionIds }, offeredPrice: { not: null } },
          select: { sessionId: true },
          distinct: ['sessionId'],
        })
      : []
  const sessionsWithOffer = new Set(offers.map((o) => o.sessionId))

  const started = sessions.length
  const negotiated = sessions.filter((s) => s._count.messages > 0).length
  const offered = sessionsWithOffer.size
  const accepted = sessions.filter((s) => s.finalPrice !== null).length
  const issued = sessions.filter((s) => Boolean(s.discountCode)).length
  const purchased = sessions.filter((s) => Boolean(s.purchasedAt)).length
  const revenue = sessions.reduce((sum, s) => sum + (s.purchasedAt ? s.purchaseValue ?? 0 : 0), 0)
  const grossRevenue = sessions.reduce((sum, s) => sum + (s.purchasedAt ? s.purchaseGrossValue ?? s.purchaseValue ?? 0 : 0), 0)
  const refundedRevenue = sessions.reduce((sum, s) => sum + (s.purchasedAt ? s.purchaseRefundedAmount ?? 0 : 0), 0)
  const fullyRefundedPurchases = sessions.filter((s) => s.purchasedAt && s.purchaseRefundStatus === 'fully_refunded').length

  const discountPercents = sessions
    .filter((s) => s.finalPrice !== null && s.originalPrice > 0)
    .map((s) => ((s.originalPrice - (s.finalPrice as number)) / s.originalPrice) * 100)

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

  // Daily series (session start day) for the funnel chart.
  const byDay = new Map<string, { date: string; started: number; accepted: number; purchased: number; revenue: number }>()
  for (const s of sessions) {
    const key = s.startedAt.toISOString().slice(0, 10)
    if (!byDay.has(key)) byDay.set(key, { date: key, started: 0, accepted: 0, purchased: 0, revenue: 0 })
    const entry = byDay.get(key)!
    entry.started++
    if (s.finalPrice !== null) entry.accepted++
    if (s.purchasedAt) {
      entry.purchased++
      entry.revenue += s.purchaseValue ?? 0
    }
  }

  const concepts = new Map<string, ConceptMetrics>()
  const personalities = new Map<string, ConceptMetrics>()
  const eventTotal: EventTotals = {
    invitation_impression: 0,
    invitation_click: 0,
    chat_open: 0,
  }
  const uniqueVisitors = new Set<string>()
  for (const row of uniqueVisitorRows) {
    if (row.visitorKey) uniqueVisitors.add(row.visitorKey)
    const design = conceptBucket(concepts, row.designVariant || 'unknown')
    const personality = conceptBucket(personalities, row.personality || 'unknown')
    if (row.visitorKey) {
      design.visitors.add(row.visitorKey)
      personality.visitors.add(row.visitorKey)
    }
  }
  for (const row of eventCounts) {
    const count = row._count._all
    const design = conceptBucket(concepts, row.designVariant || 'unknown')
    const personality = conceptBucket(personalities, row.personality || 'unknown')
    if (row.eventType === 'invitation_impression') {
      eventTotal.invitation_impression += count
      design.impressions += count
      personality.impressions += count
    } else if (row.eventType === 'invitation_click') {
      eventTotal.invitation_click += count
      design.clicks += count
      personality.clicks += count
    } else if (row.eventType === 'chat_open') {
      eventTotal.chat_open += count
      design.chatOpens += count
      personality.chatOpens += count
    }
  }

  for (const s of sessions) {
    const design = conceptBucket(concepts, s.experienceDesign || 'unknown')
    const personality = conceptBucket(personalities, s.experiencePersonality || 'unknown')
    for (const bucket of [design, personality]) {
      bucket.sessions++
      if (s._count.messages > 0) bucket.negotiated++
      if (sessionsWithOffer.has(s.id)) bucket.offered++
      if (s.finalPrice !== null) {
        bucket.accepted++
        if (s.originalPrice > 0) {
          bucket.discountSum += ((s.originalPrice - s.finalPrice) / s.originalPrice) * 100
          bucket.discountN++
        }
      }
      if (s.discountCode) bucket.issued++
      if (s.purchasedAt) {
        bucket.purchased++
        bucket.revenue += s.purchaseValue ?? 0
        bucket.grossRevenue += s.purchaseGrossValue ?? s.purchaseValue ?? 0
        bucket.refundedRevenue += s.purchaseRefundedAmount ?? 0
        if (s.purchaseRefundStatus === 'fully_refunded') bucket.refundedPurchases++
      }
    }
  }

  const designRows = Array.from(concepts.entries())
    .map(([key, value]) => conceptRow(key, 'design', value))
    .sort((a, b) => b.impressions - a.impressions || b.sessions - a.sessions)
  const personalityRows = Array.from(personalities.entries())
    .map(([key, value]) => conceptRow(key, 'personality', value))
    .sort((a, b) => b.impressions - a.impressions || b.sessions - a.sessions)

  const clickToChat = rate(eventTotal.chat_open, eventTotal.invitation_click)
  const chatToSession = rate(started, eventTotal.chat_open)

  return NextResponse.json({
    windowDays: days,
    funnel: {
      started,
      negotiated,
      offered,
      accepted,
      issued,
      purchased,
      revenue: Math.round(revenue * 100) / 100,
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      refundedRevenue: Math.round(refundedRevenue * 100) / 100,
      fullyRefundedPurchases,
    },
    rates: {
      negotiationRate: rate(negotiated, started),
      offerRate: rate(offered, started),
      acceptRate: rate(accepted, started),
      codeRate: rate(issued, started),
      purchaseRate: rate(purchased, started),
      endToEndRate: rate(purchased, started),
    },
    averageDiscountPercent:
      discountPercents.length > 0
        ? Math.round((discountPercents.reduce((a, b) => a + b, 0) / discountPercents.length) * 10) / 10
        : 0,
    series: Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    experience: {
      impressions: eventTotal.invitation_impression,
      clicks: eventTotal.invitation_click,
      chatOpens: eventTotal.chat_open,
      uniqueVisitors: uniqueVisitors.size,
      ctr: rate(eventTotal.invitation_click, eventTotal.invitation_impression),
      clickToChatRate: clickToChat,
      chatToSessionRate: chatToSession,
      impressionToChatRate: rate(eventTotal.chat_open, eventTotal.invitation_impression),
      impressionToPurchaseRate: rate(purchased, eventTotal.invitation_impression),
      designs: designRows,
      personalities: personalityRows,
      attribution: {
        acceptedSessions: accepted,
        attributedPurchases: purchased,
        netPurchases: purchased - fullyRefundedPurchases,
        fullyRefundedPurchases,
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        refundedRevenue: Math.round(refundedRevenue * 100) / 100,
        attributedRevenue: Math.round(revenue * 100) / 100,
        acceptedPurchaseRate: rate(purchased, accepted),
        note: 'Purchases are counted only from verified Shopify order attribution, never inferred from an accepted bargain.',
      },
    },
  })
}

type ConceptMetrics = {
  impressions: number
  clicks: number
  chatOpens: number
  visitors: Set<string>
  sessions: number
  negotiated: number
  offered: number
  accepted: number
  issued: number
  purchased: number
  revenue: number
  grossRevenue: number
  refundedRevenue: number
  refundedPurchases: number
  discountSum: number
  discountN: number
}

type EventTotals = {
  invitation_impression: number
  invitation_click: number
  chat_open: number
}

function conceptBucket(map: Map<string, ConceptMetrics>, key: string): ConceptMetrics {
  let bucket = map.get(key)
  if (!bucket) {
    bucket = {
      impressions: 0,
      clicks: 0,
      chatOpens: 0,
      visitors: new Set<string>(),
      sessions: 0,
      negotiated: 0,
      offered: 0,
      accepted: 0,
      issued: 0,
      purchased: 0,
      revenue: 0,
      grossRevenue: 0,
      refundedRevenue: 0,
      refundedPurchases: 0,
      discountSum: 0,
      discountN: 0,
    }
    map.set(key, bucket)
  }
  return bucket
}

function conceptRow(key: string, kind: 'design' | 'personality', m: ConceptMetrics) {
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)
  const label =
    kind === 'design'
      ? DESIGN_VARIANT_META.find((d) => d.id === key)?.name ?? key
      : PERSONALITY_META.find((p) => p.id === key)?.name ?? key
  const evidence =
    m.impressions >= 200 && m.sessions >= 30 && m.purchased >= 3
      ? 'sufficient'
      : m.impressions >= 50 || m.sessions >= 10
        ? 'directional'
        : 'insufficient'
  return {
    key,
    label,
    impressions: m.impressions,
    clicks: m.clicks,
    chatOpens: m.chatOpens,
    uniqueVisitors: m.visitors.size,
    ctr: pct(m.clicks, m.impressions),
    clickToChatRate: pct(m.chatOpens, m.clicks),
    sessions: m.sessions,
    negotiated: m.negotiated,
    offered: m.offered,
    accepted: m.accepted,
    issued: m.issued,
    purchased: m.purchased,
    netPurchases: m.purchased - m.refundedPurchases,
    revenue: Math.round(m.revenue * 100) / 100,
    grossRevenue: Math.round(m.grossRevenue * 100) / 100,
    refundedRevenue: Math.round(m.refundedRevenue * 100) / 100,
    refundedPurchases: m.refundedPurchases,
    avgDiscountPercent: m.discountN > 0 ? Math.round((m.discountSum / m.discountN) * 10) / 10 : 0,
    sessionAcceptRate: pct(m.accepted, m.sessions),
    purchaseRate: pct(m.purchased, m.sessions),
    endToEndRate: pct(m.purchased, m.impressions),
    evidence,
  }
}
