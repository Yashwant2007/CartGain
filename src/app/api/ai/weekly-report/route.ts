import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateWeeklyReport } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')

    if (!storeId) {
      return NextResponse.json({ message: 'storeId required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const existingReport = await prisma.aiReport.findFirst({
      where: { storeId, type: 'weekly' },
      orderBy: { createdAt: 'desc' },
    })

    if (existingReport) {
      const weekOld = Date.now() - existingReport.createdAt.getTime() > 7 * 86400000
      if (!weekOld) {
        return NextResponse.json({
          report: { title: existingReport.title, summary: existingReport.summary, insights: existingReport.insights, recommendations: existingReport.recommendations, metrics: existingReport.metrics, createdAt: existingReport.createdAt },
          cached: true,
        }, { status: 200 })
      }
    }

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)

    const cartsAbandoned = await prisma.cart.count({
      where: { storeId, abandonedAt: { gte: weekAgo } }
    })
    const cartsRecovered = await prisma.recoveredCart.count({
      where: { storeId, recoveredAt: { gte: weekAgo } }
    })
    const revenue = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: weekAgo } },
      _sum: { netRevenue: true }
    })
    const messagesSent = await prisma.message.count({
      where: { cart: { storeId }, sentAt: { gte: weekAgo } }
    })

    const prevAbandoned = await prisma.cart.count({
      where: { storeId, abandonedAt: { gte: twoWeeksAgo, lt: weekAgo } }
    })
    const prevRecovered = await prisma.recoveredCart.count({
      where: { storeId, recoveredAt: { gte: twoWeeksAgo, lt: weekAgo } }
    })
    const prevRevenue = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: twoWeeksAgo, lt: weekAgo } },
      _sum: { netRevenue: true }
    })

    const channelBreakdown = await Promise.all(
      ['email', 'sms', 'whatsapp'].map(async (channel) => {
        const sent = await prisma.message.count({
          where: { cart: { storeId }, channel, sentAt: { gte: weekAgo } }
        })
        const recovered = await prisma.recoveredCart.count({
          where: { storeId, channel, recoveredAt: { gte: weekAgo } }
        })
        const chRevenue = await prisma.recoveredCart.aggregate({
          where: { storeId, channel, recoveredAt: { gte: weekAgo } },
          _sum: { netRevenue: true }
        })
        return { channel, sent, recovered, revenue: chRevenue._sum.netRevenue || 0 }
      })
    )

    const bestChannel = channelBreakdown.reduce((best, curr) =>
      curr.revenue > best.revenue ? curr : best, channelBreakdown[0] || { channel: 'email', revenue: 0 }
    )

    const metrics = {
      storeName: store.name,
      periodStart: weekAgo.toISOString(),
      periodEnd: now.toISOString(),
      cartsAbandoned,
      cartsRecovered,
      recoveryRate: cartsAbandoned > 0 ? (cartsRecovered / cartsAbandoned) * 100 : 0,
      revenueRecovered: revenue._sum.netRevenue || 0,
      messagesSent,
      channelBreakdown,
      prevRecoveryRate: prevAbandoned > 0 ? (prevRecovered / prevAbandoned) * 100 : 0,
      prevRevenueRecovered: prevRevenue._sum.netRevenue || 0,
      bestChannel: bestChannel.channel,
    }

    const report = await generateWeeklyReport(metrics)

    if (report) {
      try {
        await prisma.aiReport.upsert({
          where: { id: existingReport?.id || 'nonexistent' },
          update: { title: report.title, summary: report.summary, insights: report.insights, recommendations: report.recommendations, metrics: metrics as any },
          create: { storeId, userId: session.user.id, type: 'weekly', periodStart: weekAgo, periodEnd: now, title: report.title, summary: report.summary, metrics: metrics as any, insights: report.insights, recommendations: report.recommendations },
        })
      } catch (e) {
        // non-critical
      }
    }

    return NextResponse.json({
      report: report || { title: 'Weekly Report', summary: 'Unable to generate AI report. Using heuristic analysis.', insights: [], recommendations: [] },
      cached: false,
    }, { status: 200 })
  } catch (error) {
    console.error('Weekly report error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}