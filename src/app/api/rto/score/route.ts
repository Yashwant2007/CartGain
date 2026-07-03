import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { scoreAndNudgeOrder } from '@/lib/rto/nudge'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { storeId, orderId, order, customer, address, velocity } = body

    if (!storeId || !orderId || !order || !customer || !address) {
      return NextResponse.json({ error: 'Missing required fields: storeId, orderId, order, customer, address' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({ where: { id: storeId, userId: session.user.id } })
    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const riskScore = await prisma.rtoRiskScore.findUnique({
      where: { storeId_orderId: { storeId, orderId } },
    })

    if (riskScore) {
      return NextResponse.json({
        score: riskScore.score,
        band: riskScore.band,
        reasons: riskScore.reasons,
        cached: true,
      })
    }

    await scoreAndNudgeOrder({ storeId, orderId, order, customer, address, velocity })

    const newScore = await prisma.rtoRiskScore.findUnique({
      where: { storeId_orderId: { storeId, orderId } },
    })

    return NextResponse.json({
      score: newScore?.score ?? 0,
      band: newScore?.band ?? 'LOW',
      reasons: newScore?.reasons ?? [],
      cached: false,
    })
  } catch (error) {
    console.error('RTO score error:', error)
    return NextResponse.json({ error: 'Failed to score order' }, { status: 500 })
  }
}
