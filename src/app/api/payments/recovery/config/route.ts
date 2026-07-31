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
      paymentRecoveryEnabled: config.paymentRecoveryEnabled,
      paymentRetrySchedule: config.paymentRetrySchedule,
      paymentChannelPriority: config.paymentChannelPriority,
      paymentIncentive: config.paymentIncentive,
      paymentEnabledGateways: config.paymentEnabledGateways,
    })
  } catch (error) {
    console.error('Payment recovery config error:', error)
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
      'paymentRecoveryEnabled', 'paymentRetrySchedule',
      'paymentChannelPriority', 'paymentIncentive', 'paymentEnabledGateways',
    ]

    const data: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (!(field in updates)) continue
      const value = updates[field]
      if (field === 'paymentRecoveryEnabled' && typeof value !== 'boolean') {
        return NextResponse.json({ error: 'paymentRecoveryEnabled must be a boolean' }, { status: 400 })
      }
      if (field === 'paymentIncentive') {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          return NextResponse.json({ error: 'paymentIncentive must be a finite number' }, { status: 400 })
        }
        if (typeof value === 'object' && value !== null) {
          const nested = Object.values(value as Record<string, unknown>)
          if (!nested.every(v => typeof v === 'number' && Number.isFinite(v))) {
            return NextResponse.json({ error: 'paymentIncentive values must be finite numbers' }, { status: 400 })
          }
        } else if (typeof value !== 'number') {
          return NextResponse.json({ error: 'paymentIncentive must be a number or number map' }, { status: 400 })
        }
      }
      if (['paymentRetrySchedule', 'paymentChannelPriority', 'paymentEnabledGateways'].includes(field)) {
        if (!Array.isArray(value) || !value.every(v => typeof v === 'string' || typeof v === 'number')) {
          return NextResponse.json({ error: `${field} must be an array of strings or numbers` }, { status: 400 })
        }
      }
      data[field] = value
    }

    const config = await prisma.merchantConfig.upsert({
      where: { storeId },
      create: { storeId, ...data } as never,
      update: data as never,
    })

    return NextResponse.json(config)
  } catch (error) {
    console.error('Payment recovery config update error:', error)
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}
