import { getRazorpayConfig, missingRazorpayBaseEnv, missingRazorpayPlanEnv } from '../config'
import { assertRazorpayPlanMatchesConfig, expectedRazorpayPlan, RazorpayPlanMismatchError, resolveRazorpayOveragePrices } from '../plans'

const KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_PLAN_ID_GROWTH_MONTHLY',
  'RAZORPAY_PLAN_ID_GROWTH_YEARLY',
  'RAZORPAY_PLAN_ID_PRO_MONTHLY',
  'RAZORPAY_PLAN_ID_PRO_YEARLY',
] as const

const original = { ...process.env }

beforeEach(() => {
  for (const key of KEYS) delete process.env[key]
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  process.env.RAZORPAY_KEY_SECRET = 'secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook'
  process.env.RAZORPAY_PLAN_ID_GROWTH_MONTHLY = 'plan_growth_monthly'
  process.env.RAZORPAY_PLAN_ID_GROWTH_YEARLY = 'plan_growth_yearly'
  process.env.RAZORPAY_PLAN_ID_PRO_MONTHLY = 'plan_pro_monthly'
  process.env.RAZORPAY_PLAN_ID_PRO_YEARLY = 'plan_pro_yearly'
})

afterAll(() => {
  process.env = original
})

describe('Razorpay config', () => {
  it('reports every missing required variable', () => {
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_PLAN_ID_PRO_YEARLY
    expect(missingRazorpayBaseEnv()).toEqual(['RAZORPAY_KEY_ID'])
    expect(missingRazorpayPlanEnv()).toEqual(['RAZORPAY_PLAN_ID_PRO_YEARLY'])
    expect(() => getRazorpayConfig()).toThrow('RAZORPAY_KEY_ID')
  })

  it('derives canonical plan amounts and ids from PLANS', () => {
    expect(expectedRazorpayPlan('growth', 'monthly')).toMatchObject({
      planId: 'growth',
      amount: 1499,
      amountPaise: 149900,
      currency: 'INR',
      razorpayPlanId: 'plan_growth_monthly',
    })
    expect(expectedRazorpayPlan('pro', 'yearly')).toMatchObject({
      amount: 39990,
      amountPaise: 3999000,
      razorpayPlanId: 'plan_pro_yearly',
    })
    expect(() => expectedRazorpayPlan('free', 'monthly')).toThrow(RazorpayPlanMismatchError)
  })

  it('rejects a misconfigured Razorpay plan even when the id exists', () => {
    const expected = expectedRazorpayPlan('growth', 'monthly')
    expect(() => assertRazorpayPlanMatchesConfig({
      id: 'plan_growth_monthly',
      amount: 149900,
      currency: 'INR',
      period: 'monthly',
      interval: 1,
      status: 'active',
    }, expected)).not.toThrow()
    expect(() => assertRazorpayPlanMatchesConfig({
      id: 'plan_growth_monthly',
      amount: 99900,
      currency: 'INR',
      period: 'monthly',
    }, expected)).toThrow('amount')
  })

  it('uses canonical overage prices only for paid plans', () => {
    expect(resolveRazorpayOveragePrices('growth')).toEqual({ message: 1, deal: 25, cart: 3 })
    expect(resolveRazorpayOveragePrices('pro')).toEqual({ message: 1, deal: 15, cart: 3 })
    expect(resolveRazorpayOveragePrices('free')).toEqual({ message: 0, deal: 0, cart: 0 })
  })
})
