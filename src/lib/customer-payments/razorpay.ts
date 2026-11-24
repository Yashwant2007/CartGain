import crypto from 'crypto'

export const CUSTOMER_PAYMENT_PROVIDER = 'razorpay_customer_order'
export const CUSTOMER_PAYMENT_LINK_TTL_MS = 15 * 60 * 1000

const REFERENCE_PREFIX = 'cgq_'
const TRUTHY = new Set(['1', 'true', 'on', 'yes', 'enabled'])

export interface CustomerPaymentQuote {
  id: string
  storeId: string
  finalPrice: number
  currency: string
  expiresAt: Date
  sessionId?: string | null
  cartToken?: string | null
}

export interface CustomerPaymentLinkInput {
  quote: CustomerPaymentQuote
  platform: string
  customerEmail?: string | null
  customerPhone?: string | null
  now?: Date
}

export type CustomerPaymentLinkResult =
  | { ok: true; payload: Record<string, unknown>; expiresAt: Date; amountMinor: number }
  | { ok: false; reason: 'PLATFORM_DISABLED' | 'INVALID_AMOUNT' | 'EXPIRED' | 'INVALID_CURRENCY' }

export interface CustomerPaymentEvent {
  event: string
  entityId: string | null
  referenceId: string | null
  quoteId: string | null
  status: string | null
  amountMinor: number | null
  currency: string | null
  captured: boolean
  failed: boolean
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function enabledCustomerPaymentPlatforms(): string[] {
  const raw = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS ?? ''
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => normalizeToken(value))
        .filter(Boolean),
    ),
  )
}

export function isCustomerPaymentPlatformEnabled(platform: string): boolean {
  const normalized = normalizeToken(platform)
  return normalized.length > 0 && enabledCustomerPaymentPlatforms().includes(normalized)
}

export function isCustomerPaymentFlagEnabled(): boolean {
  const raw = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK ?? ''
  return TRUTHY.has(raw.trim().toLowerCase())
}

export function customerPaymentReference(quoteId: string): string {
  return `${REFERENCE_PREFIX}${quoteId}`
}

export function quoteIdFromCustomerPaymentReference(reference: string | null | undefined): string | null {
  const normalized = (reference ?? '').trim()
  return normalized.startsWith(REFERENCE_PREFIX) ? normalized.slice(REFERENCE_PREFIX.length) || null : null
}

export function buildCustomerPaymentLinkPayload(input: CustomerPaymentLinkInput): CustomerPaymentLinkResult {
  if (!isCustomerPaymentPlatformEnabled(input.platform)) return { ok: false, reason: 'PLATFORM_DISABLED' }
  const currency = (input.quote.currency ?? '').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: 'INVALID_CURRENCY' }
  const amountMinor = Math.round(input.quote.finalPrice * 100)
  if (!Number.isFinite(input.quote.finalPrice) || amountMinor <= 0) return { ok: false, reason: 'INVALID_AMOUNT' }
  const now = input.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : new Date()
  const maxExpiry = Math.min(now.getTime() + CUSTOMER_PAYMENT_LINK_TTL_MS, input.quote.expiresAt.getTime())
  if (maxExpiry <= now.getTime()) return { ok: false, reason: 'EXPIRED' }

  const notes: Record<string, string> = {
    source: 'cartgain_bargain_quote',
    quote_id: input.quote.id,
    store_id: input.quote.storeId,
  }
  if (input.quote.sessionId) notes.session_id = input.quote.sessionId

  const payload: Record<string, unknown> = {
    amount: amountMinor,
    currency,
    reference_id: customerPaymentReference(input.quote.id),
    expiry_at: Math.floor(maxExpiry / 1000),
    notes,
    reminder_enable: false,
  }
  if (input.customerEmail?.trim()) payload.customer_email = input.customerEmail.trim().slice(0, 254)
  if (input.customerPhone?.trim()) payload.customer_phone = input.customerPhone.trim().slice(0, 32)
  return { ok: true, payload, expiresAt: new Date(maxExpiry), amountMinor }
}

export function verifyCustomerPaymentWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const actual = signature.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(actual) || actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))
}

export function normalizeCustomerPaymentEvent(payload: unknown): CustomerPaymentEvent {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, any>) : {}
  const body = root.payload && typeof root.payload === 'object' ? root.payload : {}
  const paymentWrapper = body.payment && typeof body.payment === 'object' ? body.payment : {}
  const linkWrapper = body.payment_link && typeof body.payment_link === 'object' ? body.payment_link : {}
  const payment = paymentWrapper.entity && typeof paymentWrapper.entity === 'object' ? paymentWrapper.entity : {}
  const link = linkWrapper.entity && typeof linkWrapper.entity === 'object' ? linkWrapper.entity : {}
  const entity = Object.keys(payment).length > 0 ? payment : link
  const event = typeof root.event === 'string' ? root.event : ''
  const status = typeof entity.status === 'string' ? entity.status : null
  const referenceId =
    typeof entity.reference_id === 'string'
      ? entity.reference_id
      : typeof link.reference_id === 'string'
        ? link.reference_id
        : null
  const amountMinor = typeof entity.amount === 'number' && Number.isFinite(entity.amount) ? entity.amount : null
  const currency = typeof entity.currency === 'string' ? entity.currency.toUpperCase() : null
  return {
    event,
    entityId: typeof entity.id === 'string' ? entity.id : null,
    referenceId,
    quoteId: quoteIdFromCustomerPaymentReference(referenceId),
    status,
    amountMinor,
    currency,
    captured: event === 'payment.captured' && status === 'captured',
    failed:
      event === 'payment.failed' ||
      status === 'failed' ||
      (event === 'payment_link.expired' && status === 'expired'),
  }
}

export function customerPaymentIdempotencyKey(event: CustomerPaymentEvent, headerEventId?: string | null): string {
  const header = (headerEventId ?? '').trim()
  if (header) return header
  return `${event.event}:${event.entityId ?? event.referenceId ?? 'unknown'}`
}
