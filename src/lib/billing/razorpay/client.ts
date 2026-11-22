import { getRazorpayConfig } from './config'

type RazorpayClient = any

let cachedClient: RazorpayClient | null = null
let cachedKeyId: string | null = null

export function getRazorpayClient(): RazorpayClient {
  const config = getRazorpayConfig()
  if (cachedClient && cachedKeyId === config.keyId) return cachedClient
  const Razorpay = require('razorpay')
  cachedClient = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret })
  cachedKeyId = config.keyId
  return cachedClient
}

export async function razorpayFetchPlan(planId: string) {
  return getRazorpayClient().plans.fetch(planId)
}

export async function razorpayCreateCustomer(params: {
  name?: string | null
  email?: string | null
  contact?: string | null
  storeId: string
  userId: string
}) {
  return getRazorpayClient().customers.create({
    name: params.name || 'CartGain Merchant',
    email: params.email || undefined,
    contact: params.contact || undefined,
    notes: {
      cartgain_store_id: params.storeId,
      cartgain_user_id: params.userId,
    },
  })
}

export async function razorpayFetchCustomer(customerId: string) {
  return getRazorpayClient().customers.fetch(customerId)
}

export async function razorpayCreateSubscription(params: {
  planId: string
  customerId: string
  notes: Record<string, string>
  startAt?: number
}) {
  const payload: Record<string, unknown> = {
    plan_id: params.planId,
    customer_id: params.customerId,
    customer_notify: 1,
    quantity: 1,
    notes: params.notes,
  }
  if (params.startAt && Number.isFinite(params.startAt)) {
    payload.start_at = Math.floor(params.startAt)
  }
  return getRazorpayClient().subscriptions.create(payload)
}

export async function razorpayFetchSubscription(subscriptionId: string) {
  return getRazorpayClient().subscriptions.fetch(subscriptionId)
}

export async function razorpayCancelSubscription(subscriptionId: string, cancelAtCycleEnd = true) {
  return getRazorpayClient().subscriptions.cancel(subscriptionId, {
    cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
  })
}

export async function razorpayCreateOrder(params: {
  amountPaise: number
  currency: string
  receipt: string
  notes: Record<string, string>
}) {
  return getRazorpayClient().orders.create({
    amount: params.amountPaise,
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes,
  })
}

export async function razorpayFetchPayment(paymentId: string) {
  return getRazorpayClient().payments.fetch(paymentId)
}

export async function razorpayCreatePaymentLink(params: {
  amountPaise: number
  currency: string
  description: string
  referenceId: string
  callbackUrl: string
  notes: Record<string, string>
  email?: string | null
  name?: string | null
}) {
  return getRazorpayClient().paymentLink.create({
    amount: params.amountPaise,
    currency: params.currency,
    description: params.description,
    reference_id: params.referenceId,
    callback_url: params.callbackUrl,
    customer: {
      ...(params.email ? { email: params.email } : {}),
      ...(params.name ? { name: params.name } : {}),
    },
    notes: params.notes,
  })
}
