import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { DESIGN_VARIANT_META, PERSONALITY_META } from '@/lib/bargain/experience/types'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { bargainRequestMetrics } from '@/lib/bargain/request-metrics'

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

  const [sessions, eventCounts, uniqueVisitorRows, latencyRows, intelligenceRows] = await Promise.all([
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
        experimentArm: true,
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
    prisma.bargainLearningEvent.findMany({
      where: {
        storeId: store.id,
        environment: 'production',
        createdAt: { gte: start },
        latencyMs: { not: null },
      },
      select: { latencyMs: true, agentSource: true, failureCategory: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    }),
    prisma.productEvent.findMany({
      where: {
        name: 'cartgain_bargain_intelligence_turn',
        storeId: store.id,
        createdAt: { gte: start },
      },
      select: { properties: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
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
  const latencySamples = latencyRows
    .map((row) => row.latencyMs)
    .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0)
    .sort((a, b) => a - b)
  const percentile = (p: number): number => {
    if (latencySamples.length === 0) return 0
    const index = Math.min(latencySamples.length - 1, Math.ceil((p / 100) * latencySamples.length) - 1)
    return Math.round(latencySamples[Math.max(0, index)])
  }
  const latencyBySource: Record<string, { samples: number; p95Ms: number }> = {}
  for (const source of ['primary', 'fallback', 'emergency', 'reflex', 'unknown']) {
    const values = latencyRows
      .filter((row) => (row.agentSource || 'unknown') === source && typeof row.latencyMs === 'number')
      .map((row) => row.latencyMs as number)
      .sort((a, b) => a - b)
    if (values.length) {
      const index = Math.min(values.length - 1, Math.ceil(0.95 * values.length) - 1)
      latencyBySource[source] = { samples: values.length, p95Ms: Math.round(values[Math.max(0, index)]) }
    }
  }

  const intelligence = buildIntelligenceAnalytics(intelligenceRows)

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

  // Phase 14 — deterministic holdout cohorts recorded on every session at start.
  // Only verified purchases count; an accepted bargain is never a sale.
  const arms = new Map<string, ExperimentMetrics>()
  for (const s of sessions) {
    const key =
      s.experimentArm === 'control' || s.experimentArm === 'treatment'
        ? s.experimentArm
        : 'unassigned'
    const arm = experimentBucket(arms, key)
    arm.sessions++
    if (s.finalPrice !== null) {
      arm.accepted++
      if (s.originalPrice > 0) {
        arm.discountSum += ((s.originalPrice - s.finalPrice) / s.originalPrice) * 100
        arm.discountN++
      }
    }
    if (s.purchasedAt) {
      arm.purchased++
      arm.revenue += s.purchaseValue ?? 0
      arm.grossRevenue += s.purchaseGrossValue ?? s.purchaseValue ?? 0
      arm.refundedRevenue += s.purchaseRefundedAmount ?? 0
      if (s.purchaseRefundStatus === 'fully_refunded') arm.refundedPurchases++
    }
  }
  const experimentRows = Array.from(arms.entries())
    .map(([key, value]) => experimentRow(key, value))
    .sort((a, b) => b.sessions - a.sessions)

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
    performance: {
      samples: latencySamples.length,
      p50Ms: percentile(50),
      p95Ms: percentile(95),
      p99Ms: percentile(99),
      bySource: latencyBySource,
      degradedSamples: latencyRows.filter((row) => Boolean(row.failureCategory)).length,
      note: 'AI turn latency from production learning events. Provider failover attempts share one bounded deadline.',
    },
    requestMetrics: bargainRequestMetrics.snapshot(),
    intelligence,
    experiments: {
      enabled: isFeatureEnabled('BARGAIN_DUAL_AGENT'),
      arms: experimentRows,
      note: isFeatureEnabled('BARGAIN_DUAL_AGENT')
        ? 'Control keeps the baseline engine; treatment receives the learning layer. Cohorts are assigned deterministically per store + product + visitor.'
        : 'Cohorts are recorded but no engine difference is active, so differences are observational — not causal. Enable the dual-agent flag to run a real A/B.',
    },
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

type ExperimentMetrics = {
  sessions: number
  accepted: number
  purchased: number
  revenue: number
  grossRevenue: number
  refundedRevenue: number
  refundedPurchases: number
  discountSum: number
  discountN: number
}

function experimentBucket(map: Map<string, ExperimentMetrics>, key: string): ExperimentMetrics {
  let bucket = map.get(key)
  if (!bucket) {
    bucket = {
      sessions: 0,
      accepted: 0,
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

function experimentRow(key: string, m: ExperimentMetrics) {
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)
  const label =
    key === 'control'
      ? 'Control (baseline engine)'
      : key === 'treatment'
        ? 'Treatment (learning layer)'
        : 'Unassigned (legacy sessions)'
  const evidence =
    m.sessions >= 30 && m.purchased >= 3
      ? 'sufficient'
      : m.sessions >= 10
        ? 'directional'
        : 'insufficient'
  return {
    key,
    label,
    sessions: m.sessions,
    accepted: m.accepted,
    purchased: m.purchased,
    netPurchases: m.purchased - m.refundedPurchases,
    revenue: Math.round(m.revenue * 100) / 100,
    grossRevenue: Math.round(m.grossRevenue * 100) / 100,
    refundedRevenue: Math.round(m.refundedRevenue * 100) / 100,
    refundedPurchases: m.refundedPurchases,
    avgDiscountPercent: m.discountN > 0 ? Math.round((m.discountSum / m.discountN) * 10) / 10 : 0,
    sessionAcceptRate: pct(m.accepted, m.sessions),
    purchaseRate: pct(m.purchased, m.sessions),
    revenuePerSession: m.sessions > 0 ? Math.round((m.revenue / m.sessions) * 100) / 100 : 0,
    evidence: evidence as 'sufficient' | 'directional' | 'insufficient',
  }
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

type IntelligenceEventRow = { properties: unknown }
type CountBucket = { key: string; count: number }
type CountRow = { key: string; label: string; turns: number; share: number }

function propertyBag(properties: unknown): Record<string, unknown> {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {}
  return properties as Record<string, unknown>
}

function stringProperty(row: IntelligenceEventRow, key: string): string | null {
  const value = propertyBag(row.properties)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberProperty(row: IntelligenceEventRow, key: string): number {
  const value = propertyBag(row.properties)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function countBucket(map: Map<string, CountBucket>, key: string | null): void {
  const normalized = key ?? 'unknown'
  const bucket = map.get(normalized)
  if (bucket) bucket.count++
  else map.set(normalized, { key: normalized, count: 1 })
}

function countRows(map: Map<string, CountBucket>, total: number): CountRow[] {
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)
  return Array.from(map.values())
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      turns: bucket.count,
      share: pct(bucket.count, total),
    }))
    .sort((a, b) => b.turns - a.turns || a.key.localeCompare(b.key))
    .slice(0, 12)
}

function buildIntelligenceAnalytics(rows: IntelligenceEventRow[]) {
  const readiness = new Map<string, CountBucket>()
  const objections = new Map<string, CountBucket>()
  const recommendations = new Map<string, CountBucket>()
  const states = new Map<string, CountBucket>()
  const reasons = new Map<string, CountBucket>()
  const offerBases = new Map<string, CountBucket>()
  const sessionIds = new Set<string>()
  const durations: number[] = []
  let checkedTurns = 0
  let compliantTurns = 0
  let blockedTurns = 0
  let llmCalls = 0
  let agentContributions = 0
  let clarificationTurns = 0

  for (const row of rows) {
    countBucket(readiness, stringProperty(row, 'readiness'))
    countBucket(objections, stringProperty(row, 'objectionCategory'))
    countBucket(recommendations, stringProperty(row, 'recommendation'))
    countBucket(states, stringProperty(row, 'state'))
    countBucket(offerBases, stringProperty(row, 'offerBasis'))
    if (propertyBag(row.properties).offerClarificationNeeded === true) clarificationTurns++
    const reason = stringProperty(row, 'validationReason')
    if (reason) countBucket(reasons, reason)
    const sessionId = stringProperty(row, 'sessionId')
    if (sessionId) sessionIds.add(sessionId)
    if (propertyBag(row.properties).validationChecked === true) {
      checkedTurns++
      if (propertyBag(row.properties).floorSafe === true) compliantTurns++
      else blockedTurns++
    }
    llmCalls += numberProperty(row, 'llmCalls')
    agentContributions += numberProperty(row, 'agentCount')
    const durationMs = numberProperty(row, 'durationMs')
    if (durationMs > 0) durations.push(durationMs)
  }

  durations.sort((a, b) => a - b)
  const percentile = (p: number): number => {
    if (durations.length === 0) return 0
    const index = Math.min(durations.length - 1, Math.ceil((p / 100) * durations.length) - 1)
    return Math.round(durations[Math.max(0, index)])
  }
  const avg = (value: number) => (rows.length > 0 ? Math.round((value / rows.length) * 100) / 100 : 0)

  return {
    turns: rows.length,
    sessions: sessionIds.size,
    readiness: countRows(readiness, rows.length),
    objections: countRows(objections, rows.length),
    recommendations: countRows(recommendations, rows.length),
    states: countRows(states, rows.length),
    offerBases: countRows(offerBases, rows.length),
    clarificationTurns,
    validation: {
      checkedTurns,
      compliantTurns,
      blockedTurns,
      reasons: countRows(reasons, rows.length),
    },
    overhead: {
      llmCalls,
      agentContributions,
      avgAgentContributions: avg(agentContributions),
      avgDurationMs: avg(durations.reduce((sum, ms) => sum + ms, 0)),
      p95DurationMs: percentile(95),
    },
    note: 'Coordination is deterministic and uses no extra AI provider call. Messages, prices, floors and internal prompts are never persisted here.',
  }
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
