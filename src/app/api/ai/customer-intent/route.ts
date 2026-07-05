import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { detectCustomerIntent } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { customerId: extCustomerId, storeId } = await request.json()

    if (!extCustomerId || !storeId) {
      return NextResponse.json({ message: 'customerId and storeId required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const customer = await prisma.customer.findUnique({
      where: { storeId_customerId: { storeId, customerId: extCustomerId } }
    })

    const totalAbandons = await prisma.cart.count({
      where: { storeId, customerId: extCustomerId, isRecovered: false }
    })
    const totalRecoveries = await prisma.recoveredCart.count({
      where: { cart: { storeId, customerId: extCustomerId } }
    })
    const goodCarts = await prisma.cart.findMany({
      where: { storeId, customerId: extCustomerId, isRecovered: true },
      select: { totalValue: true }
    })
    const vals = goodCarts.map(c => c.totalValue)
    const avgOrderValue = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0

    const insightData = {
      totalOrders: customer?.totalOrders || 0,
      totalAbandons,
      totalRecoveries,
      avgOrderValue,
      lifetimeValue: customer?.totalOrders ? (avgOrderValue * customer.totalOrders) : 0,
      cartValue: 0,
      daysSinceLastOrder: customer?.lastOrderAt
        ? Math.floor((Date.now() - customer.lastOrderAt.getTime()) / 86400000)
        : null,
    }

    const latestCart = await prisma.cart.findFirst({
      where: { storeId, customerId: extCustomerId, isRecovered: false },
      orderBy: { abandonedAt: 'desc' }
    })
    insightData.cartValue = latestCart?.totalValue || 0

    const result = await detectCustomerIntent(insightData)

    await prisma.customer.update({
      where: { storeId_customerId: { storeId, customerId: extCustomerId } },
      data: { intentType: result.intentType, intentScore: result.confidence / 100, intentUpdatedAt: new Date() },
    })

    await prisma.customerInsight.upsert({
      where: { storeId_customerId: { storeId, customerId: extCustomerId } },
      update: { intentType: result.intentType, intentScore: result.confidence / 100, totalAbandons, totalRecoveries, avgOrderValue, lifetimeValue: insightData.lifetimeValue },
      create: { storeId, customerId: extCustomerId, intentType: result.intentType, intentScore: result.confidence / 100, totalAbandons, totalRecoveries, avgOrderValue, lifetimeValue: insightData.lifetimeValue },
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Customer intent error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}