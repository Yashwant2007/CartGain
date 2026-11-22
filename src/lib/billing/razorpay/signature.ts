import { createHmac, timingSafeEqual } from 'crypto'

function normalizeSignature(signature: string | null | undefined): string {
  return (signature || '').trim().toLowerCase()
}

function safeHexEqual(expectedHex: string, actualHex: string): boolean {
  const expected = normalizeSignature(expectedHex)
  const actual = normalizeSignature(actualHex)
  if (!expected || !actual || !/^[0-9a-f]+$/.test(expected) || !/^[0-9a-f]+$/.test(actual)) {
    return false
  }
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(actual, 'hex')
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}

export function computeRazorpayHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifyRazorpayHmac(payload: string, signature: string | null | undefined, secret: string): boolean {
  return safeHexEqual(computeRazorpayHmac(payload, secret), signature || '')
}

export function verifyRazorpayPaymentSignature(params: {
  subscriptionId?: string | null
  orderId?: string | null
  paymentId: string
  signature: string | null | undefined
  keySecret: string
}): boolean {
  const { subscriptionId, orderId, paymentId, signature, keySecret } = params
  if (!paymentId || !signature || !keySecret) return false
  const prefix = subscriptionId || orderId
  if (!prefix) return false
  return verifyRazorpayHmac(`${prefix}|${paymentId}`, signature, keySecret)
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null | undefined, webhookSecret: string): boolean {
  if (!rawBody || !signature || !webhookSecret) return false
  return verifyRazorpayHmac(rawBody, signature, webhookSecret)
}
