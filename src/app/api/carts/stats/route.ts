import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { authenticate } from '@/lib/auth-context'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId')

    const auth = await authenticate(request)
    if (!auth.success) {
      return NextResponse.json({ message: auth.error }, { status: auth.status })
    }

    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: auth.ctx.userId },
    })

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)

    const [abandoned30d, recovered30d, revenueAgg, recoveredAllTime, lifetimeRevenueAgg] =
      await Promise.all([
        prisma.cart.count({ where: { storeId, abandonedAt: { gte: thirtyDaysAgo } } }),
        prisma.recoveredCart.count({ where: { storeId, recoveredAt: { gte: thirtyDaysAgo } } }),
        prisma.recoveredCart.aggregate({
          where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
          _sum: { netRevenue: true },
        }),
        prisma.recoveredCart.count({ where: { storeId } }),
        prisma.recoveredCart.aggregate({
          where: { storeId },
          _sum: { netRevenue: true },
        }),
      ])

    const recoveryRate30d = abandoned30d > 0 ? (recovered30d / abandoned30d) * 100 : 0

    return NextResponse.json({
      stats: {
        abandoned30d,
        recovered30d,
        recoveryRate30d: Math.round(recoveryRate30d * 100) / 100,
        revenueRecovered30d: revenueAgg._sum.netRevenue || 0,
        recoveredAllTime,
        revenueRecoveredAllTime: lifetimeRevenueAgg._sum.netRevenue || 0,
      },
    })
  } catch (error) {
    console.error('Cart stats error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
