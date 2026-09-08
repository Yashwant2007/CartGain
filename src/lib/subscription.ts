import prisma from '@/lib/db'
import { PAID_PLAN_IDS, FREE_CARTS_THRESHOLD, resolvePlanId, getPlan } from '@/lib/payment'

export type SubscriptionStatus = {
  hasSubscription: boolean
  plan: string
  isActive: boolean
  isFree: boolean
  isPaid: boolean
  isTrialing: boolean
  isExhausted: boolean
  cartsUsed: number
  cartsRemaining: number
  bargainSessionsUsed: number
  bargainSessionsRemaining: number
  bargainDealsUsed: number
  bargainDealsRemaining: number
  storesUsed: number
  planLimits: {
    maxCarts: number
    revSharePercent: number
    revShareCap: number
    bargainSessions: number
    bargainDeals: number
    bargainOverageDealPrice: number
    bargainOverageCartPrice: number
    storesLimit: number
  }
}

export function planConfigFor(planId: string) {
  return getPlan(planId)
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  const [subscription, store] = await Promise.all([
    prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.store.findFirst({ where: { userId } }),
  ])

  if (!subscription) return null

  const plan = subscription.plan || 'free'
  const planConfig = planConfigFor(plan)
  const isPaid = (PAID_PLAN_IDS as readonly string[]).includes(plan)
  const isActive = subscription.status === 'active'
  const isFree = !isPaid

  // Count distinct carts that have been sent messages (carts processed, not recovered)
  const sentCartsCount = await prisma.message.groupBy({
    by: ['cartId'],
    where: {
      campaign: { userId },
      status: 'sent',
    },
  })
  const cartsUsed = sentCartsCount.length
  const maxCarts = isFree ? FREE_CARTS_THRESHOLD : planConfig.maxCarts
  const cartsRemaining = Math.max(0, maxCarts - cartsUsed)
  const isExhausted = isFree && cartsUsed >= FREE_CARTS_THRESHOLD

  const bargainSessionsRemaining = Math.max(0, planConfig.bargainSessions - subscription.bargainSessionsUsed)
  const bargainDealsRemaining = Math.max(0, planConfig.bargainDeals - subscription.bargainDealsUsed)

  const storesCount = await prisma.store.count({ where: { userId } })

  return {
    hasSubscription: true,
    plan,
    isActive,
    isFree,
    isPaid,
    isTrialing: isFree && cartsUsed < FREE_CARTS_THRESHOLD,
    isExhausted,
    cartsUsed,
    cartsRemaining,
    bargainSessionsUsed: subscription.bargainSessionsUsed,
    bargainSessionsRemaining,
    bargainDealsUsed: subscription.bargainDealsUsed,
    bargainDealsRemaining,
    planLimits: {
      maxCarts,
      revSharePercent: planConfig.revSharePercent,
      revShareCap: planConfig.revShareCap,
      bargainSessions: planConfig.bargainSessions,
      bargainDeals: planConfig.bargainDeals,
      bargainOverageDealPrice: planConfig.bargainOverageDealPrice,
      bargainOverageCartPrice: planConfig.bargainOverageCartPrice,
      storesLimit: planConfig.storesLimit,
    },
    storesUsed: storesCount,
  }
}

export async function getSubscription(userId: string) {
  return prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
}

export async function createFreeSubscription(userId: string) {
  // Idempotent upsert on the unique userId — a check-then-create race here
  // could previously mint duplicate free-subscription rows for one user.
  return prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      customerId: `free_${userId}`,
      plan: 'free',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      smsCredits: 0,
      smsCreditsUsed: 0,
      revenueShareAccrued: 0,
      revenueSharePaid: 0,
    },
  })
}
