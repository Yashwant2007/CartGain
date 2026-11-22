export const RAZORPAY_CURRENCY = 'INR'

export class RazorpayConfigError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(
      `Razorpay billing is not configured. Missing: ${missing.join(', ')}. ` +
        `Add these to the Vercel project settings and redeploy.`
    )
    this.name = 'RazorpayConfigError'
    this.missing = missing
  }
}

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  webhookSecret: string
}

function clean(name: string): string {
  return (process.env[name] || '').trim().replace(/^Bearer\s+/i, '')
}

export function getRazorpayConfig(): RazorpayConfig {
  const keyId = clean('RAZORPAY_KEY_ID')
  const keySecret = clean('RAZORPAY_KEY_SECRET')
  const webhookSecret = clean('RAZORPAY_WEBHOOK_SECRET')
  const missing: string[] = []
  if (!keyId) missing.push('RAZORPAY_KEY_ID')
  if (!keySecret) missing.push('RAZORPAY_KEY_SECRET')
  if (!webhookSecret) missing.push('RAZORPAY_WEBHOOK_SECRET')
  if (missing.length) throw new RazorpayConfigError(missing)
  return { keyId, keySecret, webhookSecret }
}

export function isRazorpayConfigured(): boolean {
  try {
    getRazorpayConfig()
    return true
  } catch {
    return false
  }
}

const PLAN_ENV_KEYS: Record<string, { monthly: string; yearly: string }> = {
  growth: {
    monthly: 'RAZORPAY_PLAN_ID_GROWTH_MONTHLY',
    yearly: 'RAZORPAY_PLAN_ID_GROWTH_YEARLY',
  },
  pro: {
    monthly: 'RAZORPAY_PLAN_ID_PRO_MONTHLY',
    yearly: 'RAZORPAY_PLAN_ID_PRO_YEARLY',
  },
}

export function razorpayPlanEnvKey(planId: string, period: 'monthly' | 'yearly'): string | null {
  return PLAN_ENV_KEYS[planId]?.[period] ?? null
}

export function getRazorpayPlanId(planId: string, period: 'monthly' | 'yearly'): string {
  const envKey = razorpayPlanEnvKey(planId, period)
  if (!envKey) {
    throw new RazorpayConfigError([`no Razorpay plan mapping for ${planId}/${period}`])
  }
  const value = clean(envKey)
  if (!value) throw new RazorpayConfigError([envKey])
  return value
}

export function missingRazorpayBaseEnv(): string[] {
  const missing: string[] = []
  if (!clean('RAZORPAY_KEY_ID')) missing.push('RAZORPAY_KEY_ID')
  if (!clean('RAZORPAY_KEY_SECRET')) missing.push('RAZORPAY_KEY_SECRET')
  if (!clean('RAZORPAY_WEBHOOK_SECRET')) missing.push('RAZORPAY_WEBHOOK_SECRET')
  return missing
}

export function missingRazorpayPlanEnv(): string[] {
  const missing: string[] = []
  for (const mapping of Object.values(PLAN_ENV_KEYS)) {
    for (const envKey of Object.values(mapping)) {
      if (!clean(envKey)) missing.push(envKey)
    }
  }
  return missing
}
