import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const SMS_RATE = 0.85
const WHATSAPP_RATE = 0.86
const EMAIL_RATE = 0
const BATCH_SIZE = 500

async function computeChartData(storeId: string, startDate: Date, endDate: Date) {
  const rows = await prisma.$queryRawUnsafe<Array<{
    date: Date
    abandoned: bigint
    recovered: bigint
    revenue: number
  }>>(
    `SELECT
      DATE("abandonedAt") as date,
      COUNT(*) FILTER (WHERE "abandonedAt" >= $2 AND "abandonedAt" < $3) as abandoned,
      COUNT(*) FILTER (WHERE "isRecovered" = true AND "recoveredAt" >= $2 AND "recoveredAt" < $3) as recovered,
      COALESCE(SUM("totalValue") FILTER (WHERE "isRecovered" = true AND "recoveredAt" >= $2 AND "recoveredAt" < $3), 0) as revenue
    FROM "Cart"
    WHERE "storeId" = $1
      AND "abandonedAt" >= $2
      AND "abandonedAt" < $3
    GROUP BY DATE("abandonedAt")
    ORDER BY DATE("abandonedAt") ASC`,
    storeId,
    startDate,
    endDate
  )

  return rows.map((r: any) => ({
    date: new Date(r.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    revenue: Number(r.revenue),
    recoveredCarts: Number(r.recovered),
    abandonedCarts: Number(r.abandoned),
  }))
}

async function computeChannelStats(storeId: string, startDate: Date, endDate: Date) {
  const channelSent = await prisma.$queryRawUnsafe<Array<{
    channel: string
    sent: bigint
    delivered: bigint
    clicked: bigint
    converted: bigint
  }>>(
    `SELECT
      channel,
      COUNT(*) as sent,
      COUNT(*) FILTER (WHERE status IN ('delivered', 'sent')) as delivered,
      COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL) as clicked,
      COUNT(*) FILTER (WHERE "convertedAt" IS NOT NULL) as converted
    FROM "Message"
    WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "storeId" = $1)
      AND "createdAt" >= $2
      AND "createdAt" < $3
    GROUP BY channel
    ORDER BY channel ASC`,
    storeId,
    startDate,
    endDate
  )

  const channelRevenue = await prisma.$queryRawUnsafe<Array<{
    channel: string
    revenue: number
  }>>(
    `SELECT
      rc.channel,
      COALESCE(SUM(rc."netRevenue"), 0) as revenue
    FROM "RecoveredCart" rc
    WHERE rc."storeId" = $1
      AND rc."recoveredAt" >= $2
      AND rc."recoveredAt" < $3
    GROUP BY rc.channel
    ORDER BY rc.channel ASC`,
    storeId,
    startDate,
    endDate
  )

  const revMap = new Map<string, number>()
  for (const r of channelRevenue) {
    revMap.set(r.channel.toLowerCase(), Number(r.revenue))
  }

  return ['sms', 'whatsapp', 'email'].map(channel => {
    const sentRow = channelSent.find((r: any) => r.channel === channel)
    return {
      channel: channel.charAt(0).toUpperCase() + channel.slice(1),
      sent: Number(sentRow?.sent || 0),
      delivered: Number(sentRow?.delivered || 0),
      clicked: Number(sentRow?.clicked || 0),
      converted: Number(sentRow?.converted || 0),
      revenue: revMap.get(channel) || 0,
    }
  })
}

async function computePeriodData(storeId: string, userId: string, startDate: Date, endDate: Date) {
  const [cartCounts, revenue, messagesSent, analyticsRows, chartData, channelBreakdown] = await Promise.all([
    prisma.$transaction([
      prisma.cart.count({
        where: { storeId, abandonedAt: { gte: startDate, lt: endDate } },
      }),
      prisma.cart.count({
        where: { storeId, isRecovered: true, recoveredAt: { gte: startDate, lt: endDate } },
      }),
    ]),
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
    prisma.analytics.findMany({ where: { userId }, select: { messagesDelivered: true, messagesClicked: true } }),
    computeChartData(storeId, startDate, endDate),
    computeChannelStats(storeId, startDate, endDate),
  ])

  const [cartsAbandoned, cartsRecovered] = cartCounts

  const totals = analyticsRows.reduce(
    (acc: any, row: any) => {
      acc.messagesDelivered += row.messagesDelivered
      acc.messagesClicked += row.messagesClicked
      return acc
    },
    { messagesDelivered: 0, messagesClicked: 0 }
  )

  const recoveryRate = cartsAbandoned > 0 ? (cartsRecovered / cartsAbandoned) * 100 : 0

  const costs = {
    sms: (channelBreakdown.find((c: any) => c.channel === 'Sms')?.sent ?? 0) * SMS_RATE,
    whatsapp: (channelBreakdown.find((c: any) => c.channel === 'Whatsapp')?.sent ?? 0) * WHATSAPP_RATE,
    email: (channelBreakdown.find((c: any) => c.channel === 'Email')?.sent ?? 0) * EMAIL_RATE,
  }
  const totalCosts = costs.sms + costs.whatsapp + costs.email
  const netRevenue = (revenue._sum.netRevenue ?? 0)
  const roi = totalCosts > 0 ? ((netRevenue - totalCosts) / totalCosts) * 100 : 0

  const bestChannel = channelBreakdown
    .filter((c: any) => c.sent > 0)
    .sort((a: any, b: any) => b.revenue - a.revenue)[0] || null

  const conversionTimes = await prisma.$queryRawUnsafe<Array<{ hours: number }>>(
    `SELECT
      EXTRACT(EPOCH FROM (rc."recoveredAt" - m."sentAt")) / 3600 as hours
    FROM "RecoveredCart" rc
    JOIN "Message" m ON m."cartId" = rc."cartId" AND m.status = 'sent'
    WHERE rc."storeId" = $1
      AND rc."recoveredAt" >= $2
      AND rc."recoveredAt" < $3
      AND m."sentAt" < rc."recoveredAt"
    ORDER BY m."sentAt" DESC
    LIMIT 1`,
    storeId,
    startDate,
    endDate
  )

  const validTimes = conversionTimes.filter((t: any) => t.hours >= 0).map((t: any) => t.hours)
  const avgConversionTime = validTimes.length > 0
    ? validTimes.reduce((a: any, b: any) => a + b, 0) / validTimes.length
    : null

  const tips: string[] = []
  if (bestChannel && bestChannel.revenue > 0) {
    tips.push(`${bestChannel.channel} is your top-performing channel with ₹${bestChannel.revenue.toLocaleString('en-IN')} in recovered revenue.`)
  }
  if (recoveryRate < 5) {
    tips.push('Your recovery rate is below 5%. Try shortening the send delay or adding more follow-up messages.')
  } else if (recoveryRate > 20) {
    tips.push('Great recovery rate! Consider increasing send limits to capture even more revenue.')
  }
  if (channelBreakdown.filter((c: any) => c.sent > 0).length === 1) {
    tips.push('You\'re only using one channel. Adding SMS or WhatsApp can increase recovery by up to 40%.')
  }
  if (avgConversionTime !== null && avgConversionTime > 48) {
    tips.push(`Average conversion takes ${avgConversionTime.toFixed(1)} hours. Consider reducing follow-up delays for faster recovery.`)
  }

  return {
    overview: {
      cartsAbandoned,
      cartsRecovered,
      recoveryRate: Number(recoveryRate.toFixed(2)),
      revenueRecovered: revenue._sum.recoveredValue ?? 0,
      netRevenue,
      messagesSent,
      messagesDelivered: totals.messagesDelivered,
      messagesClicked: totals.messagesClicked,
      totalCosts: Number(totalCosts.toFixed(2)),
      roi: Number(roi.toFixed(2)),
      avgOrderValue: cartsRecovered > 0 ? ((revenue._sum.recoveredValue ?? 0) / cartsRecovered) : 0,
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
