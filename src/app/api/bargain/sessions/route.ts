import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/bargain/sessions?storeId=...&status=...&take=50&days=30
// Merchant analytics: session list + summary (win rate, revenue saved, per-product breakdown)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    // Ownership check
    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const status = request.nextUrl.searchParams.get('status') ?? undefined
    const takeRaw = parseInt(request.nextUrl.searchParams.get('take') ?? '50', 10)
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 200) : 50
    const daysRaw = parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10)
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const where: any = {
      storeId,
      startedAt: { gte: since },
      ...(status ? { status } : {}),
    }

    const [sessions, totalCount] = await Promise.all([
      prisma.bargainSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          shopifyProductId: true,
          customerEmail: true,
          originalPrice: true,
          finalPrice: true,
          discountCode: true,
          attemptsUsed: true,
          status: true,
          startedAt: true,
        },
      }),
      prisma.bargainSession.count({ where }),
    ])

    // ── Analytics summary (aggregated over the period, not just the page) ──
    const allSessions = await prisma.bargainSession.findMany({
      where: { storeId, startedAt: { gte: since } },
      select: {
        status: true,
        shopifyProductId: true,
        originalPrice: true,
        finalPrice: true,
      },
    })

    const byStatus: Record<string, number> = {}
    let accepted = 0
    let revenueSaved = 0
    let finalPriceSum = 0
    let finalPriceCount = 0
    const productMap = new Map<
      string,
      { productId: string; sessions: number; accepted: number; revenueSaved: number; avgOriginal: number }
    >()

    for (const s of allSessions) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
      if (s.status === 'accepted') {
        accepted++
        const saved = Math.max(0, s.originalPrice - (s.finalPrice ?? s.originalPrice))
        revenueSaved += saved
        if (s.finalPrice != null) {
          finalPriceSum += s.finalPrice
          finalPriceCount++
        }
      }
      const entry = productMap.get(s.shopifyProductId) ?? {
        productId: s.shopifyProductId,
        sessions: 0,
        accepted: 0,
        revenueSaved: 0,
        avgOriginal: 0,
      }
      entry.sessions++
      entry.avgOriginal += s.originalPrice
      if (s.status === 'accepted') {
        entry.accepted++
        entry.revenueSaved += Math.max(0, s.originalPrice - (s.finalPrice ?? s.originalPrice))
      }
      productMap.set(s.shopifyProductId, entry)
    }

    const totalSessions = allSessions.length
    const productBreakdown = Array.from(productMap.values())
      .map(p => ({
        productId: p.productId,
        sessions: p.sessions,
        accepted: p.accepted,
        winRate: p.sessions > 0 ? Math.round((p.accepted / p.sessions) * 1000) / 10 : 0,
        revenueSaved: Math.round(p.revenueSaved * 100) / 100,
        avgOriginal: p.sessions > 0 ? Math.round((p.avgOriginal / p.sessions) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.revenueSaved - a.revenueSaved)

    const summary = {
      totalSessions,
      accepted,
      rejected: byStatus.rejected ?? 0,
      expired: byStatus.expired ?? 0,
      abandoned: byStatus.abandoned ?? 0,
      active: byStatus.active ?? 0,
      avgOriginalPrice: totalSessions > 0 ? Math.round((allSessions.reduce((a, s) => a + s.originalPrice, 0) / totalSessions) * 100) / 100 : null,
      avgFinalPrice: finalPriceCount > 0 ? Math.round((finalPriceSum / finalPriceCount) * 100) / 100 : null,
      winRate: totalSessions > 0 ? Math.round((accepted / totalSessions) * 1000) / 10 : 0,
      revenueSaved: Math.round(revenueSaved * 100) / 100,
      productBreakdown,
      periodDays: days,
    }

    return NextResponse.json({
      sessions,
      summary,
      totalCount,
      nextCursor: sessions.length === take ? sessions[sessions.length - 1].id : null,
    })
  } catch (error) {
    console.error('[BARGAIN_SESSIONS_GET]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
