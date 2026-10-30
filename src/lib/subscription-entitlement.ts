import { PAID_PLAN_IDS, resolvePlanId, getPlan } from '@/lib/payment'

export const RENEWAL_WARNING_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface SubscriptionEntitlementInput {
  plan?: string | null
  status?: string | null
  currentPeriodEnd?: Date | string | null
}

export interface SubscriptionEntitlement {
  rawPlanId: string
  effectivePlanId: string
  isPaidPlan: boolean
  isPaid: boolean
  isEntitled: boolean
  isExpired: boolean
  daysRemaining: number | null
  renewalDueSoon: boolean
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function evaluateSubscriptionEntitlement(
  subscription: SubscriptionEntitlementInput | null | undefined,
  now: Date = new Date(),
): SubscriptionEntitlement {
  const rawPlanId = resolvePlanId(subscription?.plan || 'free')
  const isPaidPlan = (PAID_PLAN_IDS as readonly string[]).includes(rawPlanId)
  const statusActive = subscription?.status === 'active'
  const periodEnd = toDate(subscription?.currentPeriodEnd)

  const isExpired =
    isPaidPlan &&
    statusActive &&
    periodEnd !== null &&
    periodEnd.getTime() <= now.getTime()

  const isPaid = isPaidPlan && statusActive && !isExpired
  const isEntitled = isPaidPlan ? isPaid : true
  const daysRemaining = periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS))
    : null

  return {
    rawPlanId,
    effectivePlanId: isPaid ? rawPlanId : 'free',
    isPaidPlan,
    isPaid,
    isEntitled,
    isExpired,
    daysRemaining,
    renewalDueSoon: isPaid && daysRemaining !== null && daysRemaining <= RENEWAL_WARNING_DAYS,
  }
}

export function effectivePlanConfig(subscription: SubscriptionEntitlementInput | null | undefined, now?: Date) {
  return getPlan(evaluateSubscriptionEntitlement(subscription, now).effectivePlanId)
}
