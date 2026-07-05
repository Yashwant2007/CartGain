import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { optimizeDiscount } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { cartId, storeMargin = 30 } = await request.json()

    if (!cartId) {
      return NextResponse.json({ message: 'cartId is required' }, { status: 400 })
    }

    const cart = await prisma.cart.findUnique({ where: { id: cartId } })
    if (!cart) {
      return NextResponse.json({ message: 'Cart not found' }, { status: 404 })
    }

    const store = await prisma.store.findUnique({ where: { id: cart.storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    let lifetimeValue = 0
    let totalOrders = 0
    let totalAbandons = 0

    if (cart.customerId) {
      const customer = await prisma.customer.findUnique({
        where: { storeId_customerId: { storeId: store.id, customerId: cart.customerId } }
      })
      if (customer) {
        totalOrders = customer.totalOrders
        lifetimeValue = customer.totalOrders > 0
          ? (await prisma.recoveredCart.aggregate({ where: { cart: { customerId: cart.customerId } }, _sum: { netRevenue: true } }))._sum.netRevenue || 0
          : 0
        totalAbandons = await prisma.cart.count({
          where: { storeId: store.id, customerId: cart.customerId, isRecovered: false, convertedAt: null }
        })
      }
    }

    const result = await optimizeDiscount(cart.totalValue, { totalOrders, totalAbandons, lifetimeValue }, storeMargin)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Discount optimizer error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}