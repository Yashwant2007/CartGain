import prisma from '@/lib/db'
import { PLANS, PAID_PLAN_IDS, FREE_CARTS_THRESHOLD } from '@/lib/payment'

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
  planLimits: {
    maxCarts: number
    revSharePercent: number
  }
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus | null> {
  const [subscription, store] = await Promise.all([
    prisma.subscription.findFirst({ where: { userId } }),
    prisma.store.findFirst({ where: { userId } }),
  ])

  if (!subscription) return null

  const plan = subscription.plan || 'free'
  const planConfig = Object.values(PLANS).find(p => p.id === plan) || PLANS.FREE
  const isPaid = (PAID_PLAN_IDS as readonly string[]).includes(plan)
  const isActive = subscription.status === 'active'
  const isFree = !isPaid

  const recoveredCarts = store
    ? await prisma.recoveredCart.count({ where: { storeId: store.id } })
    : 0

  const cartsUsed = recoveredCarts
  const maxCarts = isFree ? FREE_CARTS_THRESHOLD : planConfig.maxCarts
  const cartsRemaining = Math.max(0, maxCarts - cartsUsed)
  const isExhausted = isFree && cartsUsed >= FREE_CARTS_THRESHOLD

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
    planLimits: {
      maxCarts,
      revSharePercent: planConfig.revSharePercent,
    },
  }
}

export async function getSubscription(userId: string) {
  return prisma.subscription.findFirst({ where: { userId } })
}

export async function createFreeSubscription(userId: string) {
  const existing = await getSubscription(userId)
  if (existing) return existing

  return prisma.subscription.create({
    data: {
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
