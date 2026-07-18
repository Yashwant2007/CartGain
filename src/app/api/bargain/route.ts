import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { bargainSessionQuerySchema } from '@/lib/validation/bargain'

export const dynamic = 'force-dynamic'

// GET /api/bargain/sessions?storeId=xxx[&status=...&cursor=...&take=50]
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const params = {
      storeId: request.nextUrl.searchParams.get('storeId') ?? '',
      status: (request.nextUrl.searchParams.get('status') ?? undefined) as
        | 'active' | 'accepted' | 'rejected' | 'expired' | 'abandoned' | undefined,
      cursor: request.nextUrl.searchParams.get('cursor') ?? undefined,
      take: (request.nextUrl.searchParams.get('take') ?? undefined) as unknown as number | undefined,
    }

    const { storeId, status, cursor, take } = bargainSessionQuerySchema.parse(params)

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const [sessions, agg] = await Promise.all([
      prisma.bargainSession.findMany({
        where: { storeId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
      }),
      prisma.bargainSession.groupBy({
        by: ['status'],
        where: { storeId },
        _count: { _all: true },
        _avg: { finalPrice: true, originalPrice: true },
      }),
    ])

    const hasMore = sessions.length > take
    const items = hasMore ? sessions.slice(0, take) : sessions
    const nextCursor = hasMore ? items[items.length - 1].id : null

    // Build summary
    const summary = {
      totalSessions: agg.reduce((s: any, a: any) => s + a._count._all, 0),
      accepted: agg.find((a: any) => a.status === 'accepted')?._count._all ?? 0,
      rejected: agg.find((a: any) => a.status === 'rejected')?._count._all ?? 0,
      expired: agg.find((a: any) => a.status === 'expired')?._count._all ?? 0,
      abandoned: agg.find((a: any) => a.status === 'abandoned')?._count._all ?? 0,
      active: agg.find((a: any) => a.status === 'active')?._count._all ?? 0,
      avgOriginalPrice: agg.find(a => a.status === 'accepted')?._avg.originalPrice ?? null,
      avgFinalPrice: agg.find(a => a.status === 'accepted')?._avg.finalPrice ?? null,
    }

    const winRate = summary.totalSessions > 0
      ? Math.round((summary.accepted / summary.totalSessions) * 1000) / 10
      : 0

    return NextResponse.json({
      sessions: items,
      nextCursor,
      hasMore,
      summary: { ...summary, winRate },
    })
  } catch (error) {
    console.error('[BARGAIN_SESSIONS_GET]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
