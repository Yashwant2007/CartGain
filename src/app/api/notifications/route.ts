import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
    })

    if (!store) {
      return NextResponse.json({ notifications: [] })
    }

    const [
      recentRecoveries,
      recentCarts,
      activeCampaigns,
      totalRecovered,
    ] = await Promise.all([
      prisma.recoveredCart.findMany({
        where: { storeId: store.id },
        orderBy: { recoveredAt: 'desc' },
        take: 5,
        include: { cart: { select: { customerName: true, customerEmail: true } } },
      }),
      prisma.cart.findMany({
        where: { storeId: store.id },
        orderBy: { abandonedAt: 'desc' },
        take: 5,
      }),
      prisma.campaign.findMany({
        where: { storeId: store.id, isActive: true },
        take: 3,
      }),
      prisma.recoveredCart.count({
        where: { storeId: store.id },
      }),
    ])

    const notifications: Array<{
      id: string
      type: 'recovery' | 'cart' | 'campaign' | 'milestone'
      title: string
      description: string
      timestamp: string
      icon: string
    }> = []

    for (const recovery of recentRecoveries) {
      notifications.push({
        id: `recovery-${recovery.id}`,
        type: 'recovery',
        title: 'Cart Recovered!',
        description: `${recovery.cart?.customerName || 'A customer'}'s cart worth $${(recovery.recoveredValue ?? 0).toFixed(2)} was recovered via ${recovery.channel}.`,
        timestamp: recovery.recoveredAt?.toISOString?.() || new Date().toISOString(),
        icon: '💰',
      })
    }

    const seenCarts = new Set<string>()
    for (const cart of recentCarts) {
      if (seenCarts.has(cart.cartId)) continue
      seenCarts.add(cart.cartId)
      if (cart.isRecovered) continue
      notifications.push({
        id: `cart-${cart.id}`,
        type: 'cart',
        title: 'Cart Abandoned',
        description: `${cart.customerName || 'A guest'} abandoned a cart worth $${(cart.totalValue ?? 0).toFixed(2)}.`,
        timestamp: cart.abandonedAt?.toISOString?.() || new Date().toISOString(),
        icon: '🛒',
      })
    }

    for (const campaign of activeCampaigns) {
      notifications.push({
        id: `campaign-${campaign.id}`,
        type: 'campaign',
        title: 'Campaign Active',
        description: `"${campaign.name}" is running with ${(campaign.channels?.length ?? 0)} channel(s).`,
        timestamp: campaign.updatedAt?.toISOString?.() || new Date().toISOString(),
        icon: '📢',
      })
    }

    if (totalRecovered > 0 && totalRecovered % 10 === 0) {
      notifications.push({
        id: `milestone-${totalRecovered}`,
        type: 'milestone',
        title: 'Milestone Reached!',
        description: `You've recovered ${totalRecovered} carts! 🎉`,
        timestamp: new Date().toISOString(),
        icon: '🏆',
      })
    }

    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ notifications: notifications.slice(0, 10) })
  } catch (error) {
    console.error('Notifications error:', error)
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        { error: 'Database connection failed', notifications: [] },
        { status: 503 }
      )
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2021') {
        return NextResponse.json(
          { error: 'Database tables missing. Run migrations.', notifications: [] },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { error: 'Database query failed', notifications: [] },
        { status: 500 }
      )
    }
    return NextResponse.json({ notifications: [] })
  }
}
