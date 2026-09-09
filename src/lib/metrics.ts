import prisma from '@/lib/db'
import { getPlan, resolvePlanId, PAID_PLAN_IDS } from '@/lib/payment'

// Business metrics snapshot for /api/system/metrics. Cheap reads only — a few
// indexed counts/aggregates — safe to run on every Vercel cron invocation.

function msIn(days: number): number {
  return days * 24 * 60 * 60 * 1000
}

interface MrrSubscription {
  plan: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
}

/** Monthly-equivalent revenue from active paid subscriptions. Yearly plans price /12. */
export function estimateMrr(subscriptions: MrrSubscription[]): number {
  let mrr = 0
  for (const sub of subscriptions) {
    const planConfig = getPlan(sub.plan)
    if (!planConfig || planConfig.price <= 0) continue
    const periodDays = (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) / msIn(1)
    mrr += periodDays >= 360 ? planConfig.price / 12 : planConfig.price
  }
  return mrr
}

export async function getBusinessMetrics() {
  const now = new Date()
  const todayStart = new Date(now.toDateString())
  const last24h = new Date(now.getTime() - msIn(1))
  const last7d = new Date(now.getTime() - msIn(7))

  const [
    stores,
    users,
    activeCampaigns,
    activeSubscriptions,
    cartsRecoveredToday,
    cartsRecovered24h,
    cartsRecovered7d,
    revenueRecoveredToday,
    revenueRecovered24h,
    revenueRecovered7d,
    messagesSentToday,
    messagesSent24h,
    errors24h,
    criticalErrors24h,
  ] = await Promise.all([
    prisma.store.count(),
    prisma.user.count(),
    prisma.campaign.count({ where: { isActive: true } }),
    prisma.subscription.findMany({
      where: { status: 'active' },
      select: { plan: true, currentPeriodStart: true, currentPeriodEnd: true },
    }),
    prisma.recoveredCart.count({ where: { recoveredAt: { gte: todayStart } } }),
    prisma.recoveredCart.count({ where: { recoveredAt: { gte: last24h } } }),
    prisma.recoveredCart.count({ where: { recoveredAt: { gte: last7d } } }),
    prisma.recoveredCart.aggregate({ where: { recoveredAt: { gte: todayStart } }, _sum: { netRevenue: true } }),
    prisma.recoveredCart.aggregate({ where: { recoveredAt: { gte: last24h } }, _sum: { netRevenue: true } }),
    prisma.recoveredCart.aggregate({ where: { recoveredAt: { gte: last7d } }, _sum: { netRevenue: true } }),
    prisma.analytics.aggregate({ where: { date: { gte: todayStart } }, _sum: { messagesSent: true } }),
    prisma.analytics.aggregate({ where: { date: { gte: last24h } }, _sum: { messagesSent: true } }),
    prisma.errorLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.errorLog.count({ where: { level: 'critical', createdAt: { gte: last24h } } }),
  ])

  const paidCount = activeSubscriptions.filter((s) =>
    (PAID_PLAN_IDS as readonly string[]).includes(resolvePlanId(s.plan))
  ).length
  const mrr = estimateMrr(activeSubscriptions)

  const sumOf = (agg: { _sum: { netRevenue?: number | null } | { messagesSent?: number | null } }, key: 'netRevenue' | 'messagesSent') =>
    agg._sum[key] ?? 0

  return {
    generatedAt: now.toISOString(),
    mrr,
    paidSubscriptions: paidCount,
    activeCampaigns,
    stores,
    users,
    carts: {
      recoveredToday: cartsRecoveredToday,
      recovered24h: cartsRecovered24h,
      recovered7d: cartsRecovered7d,
      revenueRecoveredToday: sumOf(revenueRecoveredToday, 'netRevenue'),
      revenueRecovered24h: sumOf(revenueRecovered24h, 'netRevenue'),
      revenueRecovered7d: sumOf(revenueRecovered7d, 'netRevenue'),
    },
    messages: {
      sentToday: sumOf(messagesSentToday, 'messagesSent'),
      sent24h: sumOf(messagesSent24h, 'messagesSent'),
    },
    errors: {
      total24h: errors24h,
      critical24h: criticalErrors24h,
    },
  }
}