import { getPlan, PAID_PLAN_IDS } from '@/lib/payment'
import { getRazorpayPlanId, RAZORPAY_CURRENCY } from './config'

export type RazorpayBillingPeriod = 'monthly' | 'yearly'

export interface ExpectedRazorpayPlan {
  planId: string
  period: RazorpayBillingPeriod
  amount: number
  amountPaise: number
  currency: string
  razorpayPlanId: string
}

export interface RazorpayOveragePrices {
  message: number
  deal: number
  cart: number
}

export class RazorpayPlanMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RazorpayPlanMismatchError'
  }
}

export function toPaise(amount: number): number {
  return Math.round((Number(amount) + Number.EPSILON) * 100)
}

export function billableRazorpayPlan(planId: string): boolean {
  return (PAID_PLAN_IDS as readonly string[]).includes(planId)
}

export function resolveRazorpayOveragePrices(planId: string): RazorpayOveragePrices {
  const plan = getPlan(planId)
  if (!billableRazorpayPlan(plan.id)) {
    return { message: 0, deal: 0, cart: 0 }
  }
  return {
    message: 1,
    deal: plan.bargainOverageDealPrice,
    cart: plan.bargainOverageCartPrice,
  }
}

export function expectedRazorpayPlan(planId: string, period: RazorpayBillingPeriod): ExpectedRazorpayPlan {
  const plan = getPlan(planId)
  if (!billableRazorpayPlan(plan.id)) {
    throw new RazorpayPlanMismatchError(`Plan ${planId} is not a paid Razorpay plan`)
  }
  const amount = period === 'yearly' ? plan.yearlyPrice : plan.price
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RazorpayPlanMismatchError(`Plan ${plan.id} has no configured ${period} price`)
  }
  return {
    planId: plan.id,
    period,
    amount,
    amountPaise: toPaise(amount),
    currency: RAZORPAY_CURRENCY,
    razorpayPlanId: getRazorpayPlanId(plan.id, period),
  }
}

interface FetchedRazorpayPlan {
  id?: string
  amount?: number | string
  currency?: string
  period?: string
  interval?: number | string
  status?: string
}

export function assertRazorpayPlanMatchesConfig(fetched: FetchedRazorpayPlan, expected: ExpectedRazorpayPlan): void {
  const amountPaise = Number(fetched.amount)
  const currency = (fetched.currency || '').toUpperCase()
  const interval = Number(fetched.interval)
  const mismatches: string[] = []
  if (fetched.id && fetched.id !== expected.razorpayPlanId) mismatches.push('plan id')
  if (!Number.isFinite(amountPaise) || amountPaise !== expected.amountPaise) mismatches.push('amount')
  if (currency !== expected.currency) mismatches.push('currency')
  if (fetched.period !== expected.period) mismatches.push('period')
  if (fetched.interval !== undefined && interval !== 1) mismatches.push('interval')
  if (fetched.status && fetched.status !== 'active') mismatches.push('status')
  if (mismatches.length) {
    throw new RazorpayPlanMismatchError(
      `Razorpay plan ${expected.razorpayPlanId} does not match CartGain pricing (${mismatches.join(', ')}). ` +
        `Expected ${expected.amountPaise} ${expected.currency}/${expected.period}.`
    )
  }
}
