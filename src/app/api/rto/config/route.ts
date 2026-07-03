import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { ensureMerchantConfig } from '@/lib/rto/config'

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

    const config = await ensureMerchantConfig(storeId)

    return NextResponse.json({
      rtoReductionEnabled: config.rtoReductionEnabled,
      paymentRecoveryEnabled: config.paymentRecoveryEnabled,
      rtoWeights: config.rtoWeights,
      rtoThresholds: config.rtoThresholds,
      rtoIncentive: config.rtoIncentive,
      rtoEnabledCategories: config.rtoEnabledCategories,
      paymentRetrySchedule: config.paymentRetrySchedule,
      paymentChannelPriority: config.paymentChannelPriority,
      paymentIncentive: config.paymentIncentive,
      paymentEnabledGateways: config.paymentEnabledGateways,
    })
  } catch (error) {
    console.error('Config fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { storeId, ...updates } = body

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const store = await prisma.store.findFirst({ where: { id: storeId, userId: session.user.id } })
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const allowedFields = [
      'rtoReductionEnabled', 'paymentRecoveryEnabled',
      'rtoWeights', 'rtoThresholds', 'rtoIncentive', 'rtoEnabledCategories',
      'paymentRetrySchedule', 'paymentChannelPriority', 'paymentIncentive', 'paymentEnabledGateways',
    ]

    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in updates) data[field] = updates[field]
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const config = await prisma.merchantConfig.upsert({
      where: { storeId },
      create: { storeId, ...data } as never,
      update: data as never,
    })

    return NextResponse.json(config)
  } catch (error) {
    console.error('Config update error:', error)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
