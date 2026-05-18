import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Check status of test data and carts
 */
export async function GET(request: NextRequest) {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' },
      include: {
        stores: true,
        campaigns: true,
      },
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        message: 'No test user found',
      })
    }

    const store = user.stores[0]
    if (!store) {
      return NextResponse.json({
        success: false,
        message: 'No test store found',
      })
    }

    const carts = await prisma.cart.findMany({
      where: { storeId: store.id },
      include: { messages: true },
    })

    const campaign = user.campaigns[0]

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      store: {
        id: store.id,
        name: store.name,
        domain: store.domain,
      },
      campaign: campaign ? {
        id: campaign.id,
        name: campaign.name,
        isActive: campaign.isActive,
        channels: campaign.channels,
      } : null,
      carts: carts.map((c) => ({
        id: c.id,
        cartId: c.cartId,
        customer: c.customerName,
        email: c.customerEmail,
        phone: c.customerPhone,
        totalValue: c.totalValue,
        isRecovered: c.isRecovered,
        abandonedAt: c.abandonedAt,
        messagesCount: c.messages.length,
      })),
      summary: {
        totalCarts: carts.length,
        unrecoveredCarts: carts.filter((c) => !c.isRecovered).length,
        cartsWithMessages: carts.filter((c) => c.messages.length > 0).length,
      },
    })
  } catch (error: any) {
    console.error('Error checking status:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}
