import prisma from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { Plan } from '@/lib/payment'
import { PLANS, PAID_PLAN_IDS, resolvePlanId, getPlan } from '@/lib/payment'

export const BARGAIN_SESSIONS_EXHAUSTED = 'bargain_sessions_exhausted'
export const BARGAIN_DEALS_EXHAUSTED = 'bargain_deals_exhausted'

export type BargainDealMode = 'included' | 'overage'

export interface BargainGate {
  storeId: string
  userId: string
  subscriptionId: string
  planId: string
  plan: Plan
  isPaid: boolean
  overageEnabled: boolean
  sessionsUsed: number
  sessionsLimit: number
  sessionsRemaining: number
  dealsUsed: number
  dealsLimit: number
  dealsRemaining: number
  sessionsExhausted: boolean
  dealsExhausted: boolean
}

/**
 * Resolve the plan gate for a store's bargain usage. Free-path stores that have
 * no subscription row yet get a free subscription self-created so meters always
 * have a home.
 */
export async function getBargainGate(storeId: string): Promise<BargainGate> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { userId: true } })
  if (!store) {
    throw new Error('store_not_found')
  }

  let subscription = await prisma.subscription.findFirst({ where: { userId: store.userId } })
  if (!subscription) {
    const now = new Date()
    subscription = await prisma.subscription.create({
      data: {
        userId: store.userId,
        customerId: `bargain_${store.userId}_${Date.now()}`,
        plan: 'free',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const planId = resolvePlanId(subscription.plan)
  const plan = getPlan(subscription.plan) || PLANS.FREE
  const isPaid = (PAID_PLAN_IDS as readonly string[]).includes(planId)

  // Overage is the plan's default behaviour for paid tiers ("40 deals included,
  // then ₹25/deal"). The DB flag still disables it for merchants who opted out
  // under the legacy model.
  const overageEnabled = isPaid && plan.bargainOverageDealPrice > 0 && subscription.overageEnabled

  const sessionsRemaining = Math.max(0, plan.bargainSessions - subscription.bargainSessionsUsed)
  const dealsRemaining = Math.max(0, plan.bargainDeals - subscription.bargainDealsUsed)

  return {
    storeId,
    userId: store.userId,
    subscriptionId: subscription.id,
    planId,
    plan,
    isPaid,
    overageEnabled,
    sessionsUsed: subscription.bargainSessionsUsed,
    sessionsLimit: plan.bargainSessions,
    sessionsRemaining: sessionsRemaining <= 0 ? 0 : sessionsRemaining,
    dealsUsed: subscription.bargainDealsUsed,
    dealsLimit: plan.bargainDeals,
    dealsRemaining: dealsRemaining <= 0 ? 0 : dealsRemaining,
    sessionsExhausted: subscription.bargainSessionsUsed >= plan.bargainSessions,
    dealsExhausted: subscription.bargainDealsUsed >= plan.bargainDeals,
  }
}

/** How an accept should be recorded. Free plans hard-stop; paid plans fall back to overage when enabled. */
export function decideDealMode(gate: BargainGate): BargainDealMode | 'blocked_free' | 'blocked_no_overage' {
  if (!gate.dealsExhausted) return 'included'
  if (gate.isPaid && gate.overageEnabled) return 'overage'
  return gate.isPaid ? 'blocked_no_overage' : 'blocked_free'
}

/**
 * Prisma operations to record an accepted deal: bump the included/overage meter,
 * accrue recovered value + rev share, and create the (idempotent, session-scoped)
 * revenue share event. Pass these into the caller's $transaction so the deal and
 * its meter stay atomic.
 */
export function recordBargainDealOps(gate: BargainGate, sessionId: string, originalPrice: number, finalPrice: number, mode: BargainDealMode) {
  const ops: Prisma.PrismaPromise<unknown>[] = [prisma.subscription.update({ where: { id: gate.subscriptionId }, data: { bargainDealsUsed: { increment: 1 } } })]

  if (mode === 'overage') {
    ops.push(prisma.subscription.update({
      where: { id: gate.subscriptionId },
      data: { bargainOverageDeals: { increment: 1 } },
    }))
  }

  const revSharePercent = gate.plan.revSharePercent
  const revShareAmount = Math.round((finalPrice * revSharePercent) / 100 * 100) / 100

  ops.push(prisma.subscription.update({
    where: { id: gate.subscriptionId },
    data: {
      bargainAccruedValue: { increment: finalPrice },
      bargainAccrued: { increment: revSharePercent > 0 ? revShareAmount : 0 },
    },
  }))

  if (revSharePercent > 0) {
    ops.push(prisma.bargainRevenueShareEvent.create({
      data: {
        subscriptionId: gate.subscriptionId,
        sessionId,
        storeId: gate.storeId,
        shopifyProductId: null,
        grossAmount: originalPrice,
        discountAmount: Math.round((originalPrice - finalPrice) * 100) / 100,
        netAmount: Math.round(finalPrice * 100) / 100,
        revSharePercent,
        revShareAmount,
      },
    }))
  }

  return ops
}

/** Prisma operation that bumps the session meter (called on session creation). */
export function recordBargainSessionOp(subscriptionId: string) {
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: { bargainSessionsUsed: { increment: 1 } },
  })
}