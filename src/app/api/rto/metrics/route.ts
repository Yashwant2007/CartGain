import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const store = await prisma.store.findFirst({ where: { id: storeId, userId: session.user.id } })
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const [
      totalScores,
      byBand,
      recentScores,
      totalNudges,
      convertedNudges,
      nudgeConversionTrend,
    ] = await Promise.all([
      prisma.rtoRiskScore.count({ where: { storeId } }),
      prisma.rtoRiskScore.groupBy({ by: ['band'], where: { storeId }, _count: true }),
      prisma.rtoRiskScore.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { score: true, band: true, createdAt: true },
      }),
      prisma.codNudge.count({ where: { storeId } }),
      prisma.codNudge.count({ where: { storeId, status: 'converted' } }),
      prisma.codNudge.groupBy({
        by: ['status'],
        where: { storeId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
        _count: true,
      }),
    ])

    const bandDistribution: Record<string, number> = {}
    for (const b of byBand) bandDistribution[b.band] = b._count

    return NextResponse.json({
      totalScored: totalScores,
      bandDistribution,
      recentScores,
      nudgeMetrics: {
        total: totalNudges,
        converted: convertedNudges,
        conversionRate: totalNudges > 0 ? Math.round((convertedNudges / totalNudges) * 100) : 0,
        trend: nudgeConversionTrend,
      },
    })
  } catch (error) {
    console.error('RTO metrics error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
