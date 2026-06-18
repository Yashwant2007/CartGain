import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { Analytics } from '@prisma/client'

export const dynamic = 'force-dynamic'

const SMS_RATE = 0.85
const WHATSAPP_RATE = 0.86
const EMAIL_RATE = 0

async function computePeriodData(storeId: string, userId: string, startDate: Date, endDate: Date) {
  const [
    cartsAbandoned,
    cartsRecovered,
    revenueRecovered,
    messagesSent,
    analyticsRows,
    periodCarts,
    channelMessages,
    channelRevenue,
  ] = await Promise.all([
    prisma.cart.count({
      where: { storeId, abandonedAt: { gte: startDate, lt: endDate } },
    }),
    prisma.cart.count({
      where: { storeId, isRecovered: true, recoveredAt: { gte: startDate, lt: endDate } },
    }),
    prisma.recoveredCart.aggregate({
      _sum: { recoveredValue: true, netRevenue: true },
      where: { storeId, recoveredAt: { gte: startDate, lt: endDate } },
    }),
    prisma.message.count({
      where: {
        campaign: { storeId },
        createdAt: { gte: startDate, lt: endDate },
      },
    }),
    prisma.analytics.findMany({ where: { userId } }),
    prisma.cart.findMany({
      where: { storeId, abandonedAt: { gte: startDate, lt: endDate } },
      orderBy: { abandonedAt: 'asc' },
    }),
    prisma.message.findMany({
      where: {
        campaign: { storeId },
        createdAt: { gte: startDate, lt: endDate },
      },
    }),
    prisma.recoveredCart.findMany({
      where: { storeId, recoveredAt: { gte: startDate, lt: endDate } },
    }),
  ])

  const totals = analyticsRows.reduce(
    (acc: { messagesDelivered: number; messagesClicked: number }, row: Analytics) => {
      acc.messagesDelivered += row.messagesDelivered
      acc.messagesClicked += row.messagesClicked
      return acc
    },
    { messagesDelivered: 0, messagesClicked: 0 }
  )

  const recoveryRate = cartsAbandoned > 0 ? (cartsRecovered / cartsAbandoned) * 100 : 0

  const channelBreakdown = ['sms', 'whatsapp', 'email'].map((channel) => {
    const msgs = channelMessages.filter((m) => m.channel === channel)
    const rev = channelRevenue
      .filter((r) => r.channel === channel)
      .reduce((sum, r) => sum + r.netRevenue, 0)
    return {
      channel: channel.charAt(0).toUpperCase() + channel.slice(1),
      sent: msgs.length,
      delivered: msgs.filter((m) => m.status === 'delivered' || m.status === 'sent').length,
      clicked: msgs.filter((m) => m.clickedAt).length,
      converted: msgs.filter((m) => m.convertedAt).length,
      revenue: rev,
    }
  })

  const costs = {
    sms: (channelBreakdown.find((c) => c.channel === 'Sms')?.sent ?? 0) * SMS_RATE,
    whatsapp: (channelBreakdown.find((c) => c.channel === 'Whatsapp')?.sent ?? 0) * WHATSAPP_RATE,
    email: (channelBreakdown.find((c) => c.channel === 'Email')?.sent ?? 0) * EMAIL_RATE,
  }
  const totalCosts = costs.sms + costs.whatsapp + costs.email
  const netRevenue = (revenueRecovered._sum.netRevenue ?? 0)
  const roi = totalCosts > 0 ? ((netRevenue - totalCosts) / totalCosts) * 100 : 0

  // Best channel detection
  const bestChannel = channelBreakdown
    .filter((c) => c.sent > 0)
    .sort((a, b) => b.revenue - a.revenue)[0] || null

  // Average conversion time (hours from first message to recovery)
  const conversionTimes = channelRevenue
    .filter((r) => r.recoveredAt)
    .map((r) => {
      const msg = channelMessages.find(
        (m) => m.cartId === r.cartId && m.status === 'sent'
      )
      if (!msg?.sentAt) return null
      const hours = (r.recoveredAt!.getTime() - msg.sentAt.getTime()) / (1000 * 60 * 60)
      return hours
    })
    .filter((h): h is number => h !== null && h >= 0)
  const avgConversionTime =
    conversionTimes.length > 0
      ? conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length
      : null

  // Generate smart tips
  const tips: string[] = []
  if (bestChannel && bestChannel.revenue > 0) {
    tips.push(`${bestChannel.channel} is your top-performing channel with ₹${bestChannel.revenue.toLocaleString('en-IN')} in recovered revenue.`)
  }
  if (recoveryRate < 5) {
    tips.push('Your recovery rate is below 5%. Try shortening the send delay or adding more follow-up messages.')
  } else if (recoveryRate > 20) {
    tips.push('Great recovery rate! Consider increasing send limits to capture even more revenue.')
  }
  if (channelBreakdown.filter((c) => c.sent > 0).length === 1) {
    tips.push('You\'re only using one channel. Adding SMS or WhatsApp can increase recovery by up to 40%.')
  }
  if (avgConversionTime !== null && avgConversionTime > 48) {
    tips.push(`Average conversion takes ${avgConversionTime.toFixed(1)} hours. Consider reducing follow-up delays for faster recovery.`)
  }

  const chartData = Array.from({ length: Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) }, (_, i) => {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
    const dateStr = date.toISOString().split('T')[0]

    const dayRecovered = periodCarts.filter(
      (c) => c.isRecovered && c.recoveredAt && c.recoveredAt.toISOString().split('T')[0] === dateStr
    )
    const dayAbandoned = periodCarts.filter(
      (c) => c.abandonedAt.toISOString().split('T')[0] === dateStr
    )
    const revenue = dayRecovered.reduce((sum, cart) => sum + cart.totalValue, 0)

    return {
      date: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      revenue: Math.round(revenue),
      recoveredCarts: dayRecovered.length,
      abandonedCarts: dayAbandoned.length,
    }
  })

  return {
    overview: {
      cartsAbandoned,
      cartsRecovered,
      recoveryRate: Number(recoveryRate.toFixed(2)),
      revenueRecovered: revenueRecovered._sum.recoveredValue ?? 0,
      netRevenue,
      messagesSent,
      messagesDelivered: totals.messagesDelivered,
      messagesClicked: totals.messagesClicked,
      totalCosts: Number(totalCosts.toFixed(2)),
      roi: Number(roi.toFixed(2)),
      avgOrderValue: cartsRecovered > 0 ? ((revenueRecovered._sum.recoveredValue ?? 0) / cartsRecovered) : 0,
    },
    chartData,
    channelStats: channelBreakdown,
    insights: {
      bestChannel: bestChannel ? {
        channel: bestChannel.channel,
        revenue: bestChannel.revenue,
        conversionRate: bestChannel.sent > 0 ? Number(((bestChannel.converted / bestChannel.sent) * 100).toFixed(1)) : 0,
      } : null,
      avgConversionTime: avgConversionTime !== null ? Number(avgConversionTime.toFixed(1)) : null,
      tips,
    },
  }
}

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

    const now = new Date()
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    const prevEnd = new Date(currentStart.getTime())
    const prevStart = new Date(prevEnd.getTime() - days * 24 * 60 * 60 * 1000)

    const [current, previous] = await Promise.all([
      computePeriodData(resolvedStoreId!, session.user.id, currentStart, now),
      computePeriodData(resolvedStoreId!, session.user.id, prevStart, prevEnd),
    ])

    return NextResponse.json({ current, previous })
  } catch (error) {
    console.error('Analytics overview error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
