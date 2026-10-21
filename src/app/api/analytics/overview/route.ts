import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const WHATSAPP_RATE = 0.86
const EMAIL_RATE = 0
const BATCH_SIZE = 500

// The chart mixes two clocks by design — an abandonment happens on the day the
// cart was left, a recovery is booked on the day the order came in — so the
// two series are aggregated separately and merged by day.
//
// Revenue comes from RecoveredCart.netRevenue (the canonical, refund-netted
// figure used everywhere else in the product). The previous version summed
// Cart.totalValue, i.e. the GROSS value of the abandoned cart, which meant
// the chart could not agree with overview.revenueRecovered / netRevenue.
async function computeChartData(storeId: string, startDate: Date, endDate: Date) {
  const [abandonedRows, recoveredRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ date: Date; abandoned: bigint }>>(
      `SELECT
        DATE("abandonedAt") as date,
        COUNT(*) as abandoned
      FROM "Cart"
      WHERE "storeId" = $1
        AND "abandonedAt" >= $2
        AND "abandonedAt" < $3
      GROUP BY DATE("abandonedAt")
      ORDER BY DATE("abandonedAt") ASC`,
      storeId,
      startDate,
      endDate
    ),
    prisma.$queryRawUnsafe<Array<{ date: Date; recovered: bigint; revenue: number }>>(
      `SELECT
        DATE("recoveredAt") as date,
        COUNT(*) as recovered,
        COALESCE(SUM("netRevenue"), 0) as revenue
      FROM "RecoveredCart"
      WHERE "storeId" = $1
        AND "recoveredAt" >= $2
        AND "recoveredAt" < $3
      GROUP BY DATE("recoveredAt")
      ORDER BY DATE("recoveredAt") ASC`,
      storeId,
      startDate,
      endDate
    ),
  ])

  const byDay = new Map<string, { revenue: number; recoveredCarts: number; abandonedCarts: number }>()
  const ensure = (date: Date) => {
    const key = date.toISOString().slice(0, 10)
    if (!byDay.has(key)) {
      byDay.set(key, { revenue: 0, recoveredCarts: 0, abandonedCarts: 0 })
    }
    return byDay.get(key)!
  }

  for (const row of abandonedRows) ensure(new Date(row.date)).abandonedCarts = Number(row.abandoned)
  for (const row of recoveredRows) {
    const entry = ensure(new Date(row.date))
    entry.recoveredCarts = Number(row.recovered)
    entry.revenue = Number(row.revenue)
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => ({
      date: new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      revenue: value.revenue,
      recoveredCarts: value.recoveredCarts,
      abandonedCarts: value.abandonedCarts,
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
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
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

  return ['whatsapp', 'email'].map(channel => {
    const sentRow = channelSent.find((r: any) => r.channel === channel)
    const sent = Number(sentRow?.sent || 0)
    const delivered = Number(sentRow?.delivered || 0)
    const clicked = Number(sentRow?.clicked || 0)
    const converted = Number(sentRow?.converted || 0)
    const revenue = revMap.get(channel) || 0
    return {
      channel: channel.charAt(0).toUpperCase() + channel.slice(1),
      sent,
      delivered,
      clicked,
      converted,
      revenue,
      deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0,
      clickRate: sent > 0 ? Number(((clicked / sent) * 100).toFixed(1)) : 0,
      conversionRate: sent > 0 ? Number(((converted / sent) * 100).toFixed(1)) : 0,
    }
  })
}

async function computePeriodData(storeId: string, userId: string, startDate: Date, endDate: Date) {
  const [cartCounts, revenue, messagesSent, messageTotals, chartData, channelBreakdown] = await Promise.all([
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
    prisma.$queryRawUnsafe<Array<{
      delivered: bigint
      clicked: bigint
    }>>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL) as clicked
      FROM "Message"
      WHERE "campaignId" IN (SELECT id FROM "Campaign" WHERE "storeId" = $1)
        AND "createdAt" >= $2
        AND "createdAt" < $3`,
      storeId,
      startDate,
      endDate
    ),
    computeChartData(storeId, startDate, endDate),
    computeChannelStats(storeId, startDate, endDate),
  ])

  const [cartsAbandoned, cartsRecovered] = cartCounts

  const totals = messageTotals[0] || { delivered: BigInt(0), clicked: BigInt(0) }
  const totalDelivered = Number(totals.delivered)
  const totalClicked = Number(totals.clicked)

  const recoveryRate = cartsAbandoned > 0 ? (cartsRecovered / cartsAbandoned) * 100 : 0

  const costs = {
    whatsapp: (channelBreakdown.find((c: any) => c.channel === 'Whatsapp')?.sent ?? 0) * WHATSAPP_RATE,
    email: (channelBreakdown.find((c: any) => c.channel === 'Email')?.sent ?? 0) * EMAIL_RATE,
  }
  const totalCosts = costs.whatsapp + costs.email
  const netRevenue = (revenue._sum.netRevenue ?? 0)
  const roi = totalCosts > 0 ? ((netRevenue - totalCosts) / totalCosts) * 100 : 0

  const bestChannel = channelBreakdown
    .filter((c: any) => c.sent > 0)
    .sort((a: any, b: any) => b.revenue - a.revenue)[0] || null

  // One row per recovered cart: the message that drove the recovery is the
  // most recent message sent before the recovery (the same rule the
  // attribution gate uses). The previous query had `LIMIT 1`, so it averaged a
  // SINGLE row — the metric was effectively "the last recovery's delay".
  const conversionTimes = await prisma.$queryRawUnsafe<Array<{ hours: number | null }>>(
    `SELECT AVG(hours) as hours
    FROM (
      SELECT DISTINCT ON (rc."cartId")
        EXTRACT(EPOCH FROM (rc."recoveredAt" - m."sentAt")) / 3600 as hours
      FROM "RecoveredCart" rc
      JOIN "Message" m ON m."cartId" = rc."cartId" AND m.status IN ('sent', 'delivered')
      WHERE rc."storeId" = $1
        AND rc."recoveredAt" >= $2
        AND rc."recoveredAt" < $3
        AND m."sentAt" <= rc."recoveredAt"
      ORDER BY rc."cartId", m."sentAt" DESC
    ) t`,
    storeId,
    startDate,
    endDate
  )

  const avgHours = conversionTimes[0]?.hours
  const validTimes = avgHours === null || avgHours === undefined ? [] : [Number(avgHours)]
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
    tips.push('You\'re only using one channel. Adding WhatsApp can increase recovery by up to 40%.')
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
      messagesDelivered: totalDelivered,
      messagesClicked: totalClicked,
      totalCosts: Number(totalCosts.toFixed(2)),
      roi: Number(roi.toFixed(2)),
      // Net basis, consistent with `netRevenue` on the same card (the old
      // value divided GROSS recovered value by the order count).
      avgOrderValue: cartsRecovered > 0 ? (netRevenue / cartsRecovered) : 0,
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
    const daysParam = request.nextUrl.searchParams.get('days') || '30'
    const days = parseInt(daysParam, 10)
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json({ message: 'days must be between 1 and 365' }, { status: 400 })
    }
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
