import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId')

    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        userId: session.user.id,
      },
    })

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const carts = await prisma.cart.findMany({
      where: { storeId },
      orderBy: { abandonedAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ carts })
  } catch (error) {
    console.error('List carts error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      storeId,
      cartId,
      customerId,
      customerEmail,
      customerPhone,
      customerName,
      items,
      totalValue,
      currency = 'USD',
    } = body

    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!storeId || !cartId || !Array.isArray(items) || items.length === 0 || typeof totalValue !== 'number') {
      return NextResponse.json(
        { message: 'storeId, cartId, items, and numeric totalValue are required' },
        { status: 400 }
      )
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })

    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const existingCart = await prisma.cart.findUnique({
      where: {
        storeId_cartId: {
          storeId,
          cartId,
        },
      },
    })

    const cart = await prisma.cart.upsert({
      where: {
        storeId_cartId: {
          storeId,
          cartId,
        },
      },
      update: {
        customerId,
        customerEmail,
        customerPhone,
        customerName,
        items,
        totalValue,
        currency,
      },
      create: {
        storeId,
        cartId,
        customerId,
        customerEmail,
        customerPhone,
        customerName,
        items,
        totalValue,
        currency,
      },
    })

    if (!existingCart) {
      const now = new Date()
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

      await prisma.analytics.upsert({
        where: {
          userId_date: {
            userId: store.userId,
            date: day,
          },
        },
        update: {
          cartsAbandoned: { increment: 1 },
        },
        create: {
          userId: store.userId,
          date: day,
          cartsAbandoned: 1,
        },
      })
    }

    return NextResponse.json(
      {
        message: existingCart ? 'Cart updated successfully' : 'Cart created successfully',
        cart,
      },
      { status: existingCart ? 200 : 201 }
    )
  } catch (error) {
    console.error('Create or update cart error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
