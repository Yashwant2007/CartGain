import { NextRequest, NextResponse } from 'next/server'
import { requireJobAuth } from '@/lib/job-auth'
import prisma from '@/lib/db'
import { generateWeeklyReport } from '@/lib/services/ai'
import { acquireLock, releaseLock } from '@/lib/job-lock'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  const lockKey = 'weekly-report-generation'
  if (!(await acquireLock(lockKey))) {
    return NextResponse.json({ message: 'Job already running' }, { status: 409 })
  }

  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      include: { user: { select: { id: true } } },
      take: 50,
    })

    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000)

    let generated = 0
    let skipped = 0

    for (const store of stores) {
      try {
        const existingReport = await prisma.aiReport.findFirst({
          where: { storeId: store.id, type: 'weekly', createdAt: { gte: weekAgo } },
        })
        if (existingReport) { skipped++; continue }

        const cartsAbandoned = await prisma.cart.count({ where: { storeId: store.id, abandonedAt: { gte: weekAgo } } })
        const cartsRecovered = await prisma.recoveredCart.count({ where: { storeId: store.id, recoveredAt: { gte: weekAgo } } })
        const revenue = await prisma.recoveredCart.aggregate({ where: { storeId: store.id, recoveredAt: { gte: weekAgo } }, _sum: { netRevenue: true } })
        const messagesSent = await prisma.message.count({ where: { cart: { storeId: store.id }, sentAt: { gte: weekAgo } } })

        const prevAbandoned = await prisma.cart.count({ where: { storeId: store.id, abandonedAt: { gte: twoWeeksAgo, lt: weekAgo } } })
        const prevRecovered = await prisma.recoveredCart.count({ where: { storeId: store.id, recoveredAt: { gte: twoWeeksAgo, lt: weekAgo } } })
        const prevRevenue = await prisma.recoveredCart.aggregate({ where: { storeId: store.id, recoveredAt: { gte: twoWeeksAgo, lt: weekAgo } }, _sum: { netRevenue: true } })

        const channelBreakdown = await Promise.all(
          ['email', 'sms', 'whatsapp'].map(async (channel) => {
            const sent = await prisma.message.count({ where: { cart: { storeId: store.id }, channel, sentAt: { gte: weekAgo } } })
            const rec = await prisma.recoveredCart.count({ where: { storeId: store.id, channel, recoveredAt: { gte: weekAgo } } })
            const chRevenue = await prisma.recoveredCart.aggregate({ where: { storeId: store.id, channel, recoveredAt: { gte: weekAgo } }, _sum: { netRevenue: true } })
            return { channel, sent, recovered: rec, revenue: chRevenue._sum.netRevenue || 0 }
          })
        )
        const bestChannel = channelBreakdown.reduce((best, curr) => curr.revenue > best.revenue ? curr : best, channelBreakdown[0])

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
          topProduct: undefined,
          bestChannel: bestChannel?.channel || 'email',
        }

        const report = await generateWeeklyReport(metrics)
        if (report) {
          await prisma.aiReport.create({
            data: {
              storeId: store.id,
              userId: store.user.id,
              type: 'weekly',
              periodStart: weekAgo,
              periodEnd: now,
              title: report.title,
              summary: report.summary,
              metrics: metrics as any,
              insights: report.insights,
              recommendations: report.recommendations,
            },
          })
          generated++
        }
      } catch (storeError) {
        console.error(`Weekly report error for store ${store.id}:`, storeError)
      }
    }

    return NextResponse.json({ generated, skipped, total: stores.length }, { status: 200 })
  } catch (error) {
    console.error('Weekly report job error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  } finally {
    await releaseLock(lockKey)
  }
}
