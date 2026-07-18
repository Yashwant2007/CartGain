import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { INDUSTRY_BENCHMARKS } from '@/lib/services/ai'

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
    const recoveryRate = abandoned > 0 ? (recovered / abandoned) * 100 : 0

    const channels = ['email', 'sms', 'whatsapp']
    const storeChannelData: Record<string, { sent: number; recovered: number }> = {}

    for (const ch of channels) {
      const sent = await prisma.message.count({
        where: { cart: { storeId }, channel: ch, sentAt: { gte: thirtyDaysAgo } }
      })
      const rec = await prisma.recoveredCart.count({
        where: { storeId, channel: ch, recoveredAt: { gte: thirtyDaysAgo } }
      })
      storeChannelData[ch] = { sent, recovered: rec }
    }

    const campaigns = await prisma.campaign.findMany({ where: { storeId } })
    const channelsUsed: number = Array.from(new Set(campaigns.flatMap((c: any) => c.channels))).length
    const aiEnabled = campaigns.some((c: any) => c.aiOptimized)

    const revenue = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
      _sum: { netRevenue: true }
    })
    const avgOrderValue = recovered > 0 ? (revenue._sum.netRevenue || 0) / recovered : 0

    const comparison = {
      recoveryRate: { yourValue: recoveryRate, average: INDUSTRY_BENCHMARKS.recoveryRate.average, topPerformers: INDUSTRY_BENCHMARKS.recoveryRate.topPerformers },
      channelsUsed: { yourValue: channelsUsed, average: INDUSTRY_BENCHMARKS.channelsUsed.average, topPerformers: INDUSTRY_BENCHMARKS.channelsUsed.topPerformers },
      avgOrderValue: { yourValue: avgOrderValue, average: INDUSTRY_BENCHMARKS.avgOrderValue.average, topPerformers: INDUSTRY_BENCHMARKS.avgOrderValue.topPerformers },
      aiAdoption: { yourValue: aiEnabled ? 1 : 0, average: INDUSTRY_BENCHMARKS.aiAdoptionRate.average / 100, topPerformers: INDUSTRY_BENCHMARKS.aiAdoptionRate.topPerformers / 100 },
    }

    return NextResponse.json({ benchmarks: INDUSTRY_BENCHMARKS, comparison }, { status: 200 })
  } catch (error) {
    console.error('Benchmarks error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}