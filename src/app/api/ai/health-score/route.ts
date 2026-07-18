import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { calculateHealthScore } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ message: 'storeId required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)

    const abandoned = await prisma.cart.count({ where: { storeId, abandonedAt: { gte: thirtyDaysAgo } } })
    const recovered = await prisma.recoveredCart.count({ where: { storeId, recoveredAt: { gte: thirtyDaysAgo } } })
    const campaigns = await prisma.campaign.findMany({ where: { storeId } })
    const activeCampaigns = campaigns.filter((c: any) => c.isActive)
    const channelsUsed: string[] = Array.from(new Set(campaigns.flatMap((c: any) => c.channels)))
    const hasDiscount = campaigns.some((c: any) => c.discountEnabled)
    const aiEnabled = campaigns.some((c: any) => c.aiOptimized)
    const hasRecovered = await prisma.recoveredCart.findFirst({ where: { storeId } })

    const prevPeriod = new Date(Date.now() - 60 * 86400000)
    const prevRevenue = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: prevPeriod, lt: thirtyDaysAgo } },
      _sum: { netRevenue: true }
    })
    const currentRevenue = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
      _sum: { netRevenue: true }
    })

    let revenueTrend: 'up' | 'down' | 'stable' = 'stable'
    if (prevRevenue._sum.netRevenue && currentRevenue._sum.netRevenue) {
      revenueTrend = currentRevenue._sum.netRevenue > prevRevenue._sum.netRevenue * 1.1 ? 'up'
        : currentRevenue._sum.netRevenue < prevRevenue._sum.netRevenue * 0.9 ? 'down' : 'stable'
    }

    const result = calculateHealthScore({
      recoveryRate: abandoned > 0 ? (recovered / abandoned) * 100 : 0,
      aiOptimized: aiEnabled,
      activeCampaigns: activeCampaigns.length,
      channelsUsed: channelsUsed.length,
      hasDiscountCampaigns: hasDiscount,
      hasRecoveredCarts: !!hasRecovered,
      revenueTrend,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Health score error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}