import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { predictRecoveryProbability } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { cartId, channel = 'email' } = await request.json()

    const cart = await prisma.cart.findUnique({ where: { id: cartId } })
    if (!cart) {
      return NextResponse.json({ message: 'Cart not found' }, { status: 404 })
    }

    const store = await prisma.store.findUnique({ where: { id: cart.storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const customer = cart.customerId ? await prisma.customer.findUnique({
      where: { storeId_customerId: { storeId: store.id, customerId: cart.customerId } }
    }) : null

    const customerHistory = {
      totalOrders: customer?.totalOrders || 0,
      totalAbandons: 0,
      totalRecoveries: 0,
      avgOrderValue: 0,
    }

    if (customer) {
      const abandons = await prisma.cart.count({
        where: { storeId: store.id, customerId: cart.customerId!, abandonedAt: { lt: cart.abandonedAt } }
      })
      customerHistory.totalAbandons = abandons

      const recovered = await prisma.recoveredCart.count({
        where: { cart: { customerId: cart.customerId! } }
      })
      customerHistory.totalRecoveries = recovered

      const goodCarts = await prisma.cart.findMany({
        where: { storeId: store.id, customerId: cart.customerId!, isRecovered: true },
        select: { totalValue: true }
      })
      const vals = goodCarts.map(c => c.totalValue)
      customerHistory.avgOrderValue = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }

    const result = await predictRecoveryProbability(cart.totalValue, customerHistory, channel)

    try {
      await prisma.cartPrediction.upsert({
        where: { cartId: cart.id },
        update: { probabilityScore: result.probability, bestChannel: channel, features: customerHistory as any },
        create: { cartId: cart.id, storeId: store.id, probabilityScore: result.probability, bestChannel: channel, features: customerHistory as any },
      })
    } catch (e) {
      // non-critical
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Probability error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}