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
    const merchantId = searchParams.get('merchantId')

    if (!merchantId) return NextResponse.json({ error: 'merchantId required' }, { status: 400 })

    const store = await prisma.store.findFirst({ where: { id: merchantId, userId: session.user.id } })
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const [
      totalAttempts,
      byCategory,
      recoveredCount,
      totalAttempts30d,
      recoveryCampaigns30d,
      recovered30d,
    ] = await Promise.all([
      prisma.paymentAttempt.count({ where: { merchantId } }),
      prisma.paymentAttempt.groupBy({
        by: ['failureCategory'],
        where: { merchantId },
        _count: true,
      }),
      prisma.paymentAttempt.count({
        where: { merchantId, status: 'success' },
      }),
      prisma.paymentAttempt.count({
        where: { merchantId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
      prisma.paymentRecoveryCampaign.count({
        where: {
          attempt: { merchantId },
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
      }),
      prisma.paymentRecoveryCampaign.count({
        where: {
          attempt: { merchantId },
          status: 'recovered',
          createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        },
      }),
    ])

    const failureDistribution: Record<string, number> = {}
    for (const b of byCategory) {
      if (b.failureCategory) failureDistribution[b.failureCategory] = b._count
    }

    return NextResponse.json({
      totalAttempts,
      recovered: recoveredCount,
      recoveryRate: totalAttempts > 0 ? Math.round((recoveredCount / totalAttempts) * 100) : 0,
      failureDistribution,
      last30d: {
        attempts: totalAttempts30d,
        recoveryCampaigns: recoveryCampaigns30d,
        recovered: recovered30d,
        recoveryRate30d: recoveryCampaigns30d > 0
          ? Math.round((recovered30d / recoveryCampaigns30d) * 100)
          : 0,
      },
    })
  } catch (error) {
    console.error('Payment recovery metrics error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}
