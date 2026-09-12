import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { getGoalStatus } from '@/lib/bargain/goals'

export const dynamic = 'force-dynamic'

// GET /api/bargain/goals/status?storeId=xxx — live progress for the merchant
// dashboard: daily goal achieved vs target, pacing and the current dynamic
// strategy (all deterministic; never customer-facing strategy labels).
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

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: session.user.id },
    })
    if (!store) {
      // Same stale-storeId fallback the config route uses.
      const fallback = await prisma.store.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
      })
      if (!fallback) {
        return NextResponse.json({ message: 'Store not found' }, { status: 404 })
      }
      const fallbackConfig = await prisma.bargainConfig.findUnique({
        where: { storeId: fallback.id },
      })
      const status = await getGoalStatus(fallback, fallbackConfig ?? defaultConfig(), new Date())
      return NextResponse.json({ status, resolvedStoreId: fallback.id })
    }

    const config = await prisma.bargainConfig.findUnique({ where: { storeId } })
    const status = await getGoalStatus(store, config ?? defaultConfig(), new Date())

    return NextResponse.json({ status })
  } catch (error) {
    console.error('[BARGAIN_GOALS_STATUS]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

function defaultConfig() {
  return {
    goalEnabled: false,
    goalType: 'orders',
    goalTarget: 10,
    goalStartTime: null,
    goalEndTime: null,
    goalTimezone: null,
    dynamicStrategyEnabled: false,
    campaignName: null,
    campaignMessage: null,
    campaignStart: null,
    campaignEnd: null,
  }
}