import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/bargain?storeId=…&days=30
 *
 * The Bargain funnel, measured from BargainSession rows — not from the cart
 * recovery tables.
 *
 *   started → negotiated → offer made → accepted → code issued → purchased
 *
 * Every stage is a real event on the session, so the funnel can be trusted:
 *  - "negotiated" = at least one customer message
 *  - "offer made" = at least one customer message carrying an offeredPrice
 *  - "accepted"   = finalPrice set (the merchant's engine agreed)
 *  - "issued"     = a discount code was created
 *  - "purchased"  = an order was attributed to the session (purchasedAt)
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

  const sessions = await prisma.bargainSession.findMany({
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
      _count: { select: { messages: true } },
    },
  })

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
    },
    rates: {
      negotiationRate: rate(negotiated, started),
      offerRate: rate(offered, started),
      acceptRate: rate(accepted, started),
      codeRate: rate(issued, started),
      purchaseRate: rate(purchased, started),
      // The number that matters commercially: share of started sessions that
      // ended in a paid order.
      endToEndRate: rate(purchased, started),
    },
    averageDiscountPercent:
      discountPercents.length > 0
        ? Math.round((discountPercents.reduce((a, b) => a + b, 0) / discountPercents.length) * 10) / 10
        : 0,
    series: Array.from(byDay.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  })
}
