import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { Analytics } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId')
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30')
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    let resolvedStoreId = storeId

    if (!resolvedStoreId) {
      const store = await prisma.store.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
      })

      if (!store) {
        return NextResponse.json({ message: 'No store found for this account' }, { status: 404 })
      }

      resolvedStoreId = store.id
    }

    const resolvedStore = await prisma.store.findUnique({ where: { id: resolvedStoreId! } })

    if (!resolvedStore || resolvedStore.userId !== session.user.id) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    // Get recent carts for this period
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [
      cartsAbandoned,
      cartsRecovered,
      revenueRecovered,
      messagesSent,
      analyticsRows,
      recentCarts,
      recentMessages,
    ] = await Promise.all([
      prisma.cart.count({ where: { storeId: resolvedStoreId! } }),
      prisma.cart.count({ where: { storeId: resolvedStoreId!, isRecovered: true } }),
      prisma.recoveredCart.aggregate({
        _sum: { recoveredValue: true },
        where: { storeId: resolvedStoreId! },
      }),
      prisma.message.count({
        where: {
          campaign: {
            storeId: resolvedStoreId!,
          },
        },
      }),
      prisma.analytics.findMany({
        where: {
          userId: session.user.id,
        },
      }),
      prisma.cart.findMany({
        where: {
          storeId: resolvedStoreId!,
          abandonedAt: { gte: startDate },
        },
        orderBy: { abandonedAt: 'desc' },
      }),
      prisma.message.findMany({
        where: {
          campaign: {
            storeId: resolvedStoreId!,
          },
          createdAt: { gte: startDate },
        },
        distinct: ['channel'],
      }),
    ])

    const totals = analyticsRows.reduce(
      (acc: { messagesDelivered: number; messagesClicked: number; smsCount: number; whatsappCount: number; emailCount: number; pushCount: number }, row: Analytics) => {
        acc.messagesDelivered += row.messagesDelivered
        acc.messagesClicked += row.messagesClicked
        acc.smsCount += row.smsCount
        acc.whatsappCount += row.whatsappCount
        acc.emailCount += row.emailCount
        acc.pushCount += row.pushCount
        return acc
      },
      {
        messagesDelivered: 0,
        messagesClicked: 0,
        smsCount: 0,
        whatsappCount: 0,
        emailCount: 0,
        pushCount: 0,
      }
    )

    const recoveryRate = cartsAbandoned > 0 ? (cartsRecovered / cartsAbandoned) * 100 : 0

    // Build revenue chart data
    const chartData = Array.from({ length: days }, (_, i) => {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]

      const dayRecovered = recentCarts.filter(
        (c) =>
          c.isRecovered &&
          c.recoveredAt &&
          c.recoveredAt.toISOString().split('T')[0] === dateStr
      )

      const dayAbandoned = recentCarts.filter(
        (c) =>
          c.abandonedAt.toISOString().split('T')[0] === dateStr
      )

      const revenue = dayRecovered.reduce((sum, cart) => sum + cart.totalValue, 0)

      return {
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        revenue: Math.round(revenue),
        recoveredCarts: dayRecovered.length,
        abandonedCarts: dayAbandoned.length,
      }
    })

    // Channel performance from recent messages
    const channelStats = ['sms', 'whatsapp', 'email', 'push'].map((channel) => {
      const channelMessages = recentMessages.filter((m) => m.channel === channel)
      return {
        channel: channel.charAt(0).toUpperCase() + channel.slice(1),
        sent: channelMessages.length,
        delivered: channelMessages.filter((m) => m.status === 'delivered').length,
        clicked: channelMessages.filter((m) => m.clickedAt).length,
        converted: channelMessages.filter((m) => m.convertedAt).length,
      }
    })

    return NextResponse.json({
      overview: {
        cartsAbandoned,
        cartsRecovered,
        recoveryRate: Number(recoveryRate.toFixed(2)),
        revenueRecovered: revenueRecovered._sum.recoveredValue ?? 0,
        messagesSent,
        messagesDelivered: totals.messagesDelivered,
        messagesClicked: totals.messagesClicked,
        channels: {
          sms: totals.smsCount,
          whatsapp: totals.whatsappCount,
          email: totals.emailCount,
          push: totals.pushCount,
        },
      },
      chartData,
      channelStats,
    })
  } catch (error) {
    console.error('Analytics overview error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
