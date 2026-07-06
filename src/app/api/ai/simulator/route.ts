import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { simulateRecovery } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { storeId, improvements } = await request.json()

    if (!storeId) {
      return NextResponse.json({ message: 'storeId required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)

    const abandonedCount = await prisma.cart.count({
      where: { storeId, abandonedAt: { gte: thirtyDaysAgo } }
    })

    const recoveredCarts = await prisma.recoveredCart.findMany({
      where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
    })

    const recoveredCount = recoveredCarts.length
    const recoveredRevenue = recoveredCarts.reduce((s, c) => s + c.netRevenue, 0)

    const allCarts = await prisma.cart.findMany({
      where: { storeId, abandonedAt: { gte: thirtyDaysAgo } },
      select: { totalValue: true }
    })
    const avgCartValue = allCarts.length > 0
      ? allCarts.reduce((s, c) => s + c.totalValue, 0) / allCarts.length
      : 1500

    const result = simulateRecovery({
      monthlyAbandonedCarts: Math.max(abandonedCount, 100),
      avgCartValue,
      currentRecoveryRate: abandonedCount > 0 ? (recoveredCount / abandonedCount) * 100 : 5,
      currentRevenueRecovered: recoveredRevenue,
    }, improvements || {})

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Simulator error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}