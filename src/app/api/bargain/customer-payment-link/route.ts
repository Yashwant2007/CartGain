import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { assertSessionOwnership, verifySessionToken } from '@/lib/bargain/session-bind'
import { loadQuoteByToken, markQuoteCheckoutPending } from '@/lib/bargain/quote'
import {
  CUSTOMER_PAYMENT_PROVIDER,
  buildCustomerPaymentLinkPayload,
  customerPaymentReference,
  isCustomerPaymentPlatformEnabled,
} from '@/lib/customer-payments/razorpay'

export const dynamic = 'force-dynamic'

const CREDENTIAL_KIND = 'customer_order_key_secret'
const RAZORPAY_API = 'https://api.razorpay.com/v1/payment_links'
const PENDING_TTL_MS = 2 * 60 * 1000
const ACCEPTABLE_STATUSES = ['ACCEPTED', 'CHECKOUT_PENDING']

type Conditions = Record<string, any>

function unavailable() {
  return NextResponse.json({ message: 'Not available' }, { status: 404 })
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

function asConditions(value: unknown): Conditions {
  return value && typeof value === 'object' ? (value as Conditions) : {}
}

function validCustomerPayment(conditions: Conditions, now: number): Conditions | null {
  const payment = conditions.customerPayment
  if (!payment || typeof payment !== 'object') return null
  if (typeof payment.url !== 'string' || !payment.url.startsWith('https://')) return null
  if (typeof payment.expiresAt !== 'string' || !(Date.parse(payment.expiresAt) > now)) return null
  return payment
}

function pendingRequestId(conditions: Conditions): string | null {
  const pending = conditions.customerPaymentPending
  return pending && typeof pending === 'object' && typeof pending.requestId === 'string'
    ? pending.requestId
    : null
}

function claimGuards(now: number, nowIso: string) {
  return [
    {
      NOT: {
        AND: [
          { conditions: { path: ['customerPayment', 'url'], string_starts_with: 'https://' } },
          {
            OR: [
              { conditions: { path: ['customerPayment', 'expiresAtMs'], gt: now } },
              { conditions: { path: ['customerPayment', 'expiresAt'], gt: nowIso } },
            ],
          },
        ],
      },
    },
    {
      NOT: {
        OR: [
          { conditions: { path: ['customerPaymentPending', 'expiresAtMs'], gt: now } },
          { conditions: { path: ['customerPaymentPending', 'expiresAt'], gt: nowIso } },
        ],
      },
    },
  ]
}

async function clearPendingMarker(quoteId: string, requestId: string) {
  try {
    const current = await prisma.bargainQuote.findUnique({
      where: { id: quoteId },
      select: { conditions: true, updatedAt: true },
    })
    if (!current || pendingRequestId(asConditions(current.conditions)) !== requestId) return
    const next = asConditions(current.conditions)
    delete next.customerPaymentPending
    await prisma.bargainQuote.updateMany({
      where: {
        id: quoteId,
        updatedAt: current.updatedAt,
        conditions: { path: ['customerPaymentPending', 'requestId'], equals: requestId },
      },
      data: { conditions: next as any },
    })
  } catch {}
}

async function cancelProviderLink(id: string, keyId: string, keySecret: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(`${RAZORPAY_API}/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {} finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('CUSTOMER_RAZORPAY_PAYMENT_LINK') || !isFeatureEnabled('BARGAIN_QUOTE')) {
    return unavailable()
  }

  const rate = await checkSimpleRateLimit(`customer_payment_link_${clientIp(request.headers)}`)
  if (!rate.allowed) {
    return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfter) },
    })
  }

  const body = await request.json().catch(() => ({}))
  const quoteToken = bounded(body?.quoteToken, 512)
  if (!quoteToken) return NextResponse.json({ message: 'quoteToken is required' }, { status: 400 })

  const quote = await loadQuoteByToken(quoteToken)
  if (!quote) return NextResponse.json({ message: 'Quote not found' }, { status: 404 })
  if (!ACCEPTABLE_STATUSES.includes(quote.status)) {
    return NextResponse.json({ message: `Cannot create a payment link for a ${quote.status} quote`, status: quote.status }, { status: 409 })
  }

  const caller = {
    customerFingerprint: bounded(body?.customerFingerprint, 256),
    cartToken: bounded(body?.cartToken, 256),
    tokenOk: Boolean(quote.sessionId && verifySessionToken(quote.sessionId, bounded(body?.sessionToken, 512))),
  }
  let ownership: { ok: boolean; reason?: string } = { ok: true }
  if (quote.sessionId) {
    const session = await prisma.bargainSession.findUnique({
      where: { id: quote.sessionId },
      select: { customerFingerprint: true, cartToken: true },
    })
    if (session) ownership = assertSessionOwnership(session, caller)
  } else if (quote.customerFingerprint || quote.cartToken) {
    ownership = assertSessionOwnership(
      { customerFingerprint: quote.customerFingerprint, cartToken: quote.cartToken },
      caller,
    )
  }
  if (!ownership.ok) {
    return NextResponse.json({ message: ownership.reason ?? 'Not authorized for this offer' }, { status: 403 })
  }

  const conditions = asConditions(quote.conditions)
  const existing = validCustomerPayment(conditions, Date.now())
  if (existing) {
    return NextResponse.json({
      paymentLink: existing,
      quoteStatus: quote.status,
      idempotent: true,
    })
  }

  const store = await prisma.store.findUnique({
    where: { id: quote.storeId },
    select: { id: true, platform: true },
  })
  const platform = (store?.platform ?? '').trim().toLowerCase()
  if (!store || !isCustomerPaymentPlatformEnabled(platform)) {
    return NextResponse.json({ message: 'Customer payment links are not enabled for this store platform', platform }, { status: 409 })
  }

  const connection = await prisma.platformConnection.findUnique({
    where: { storeId_platform: { storeId: store.id, platform: CUSTOMER_PAYMENT_PROVIDER } },
    select: {
      id: true,
      status: true,
      credentials: {
        where: { kind: CREDENTIAL_KIND, status: 'active' },
        select: { keyEncrypted: true, secretEncrypted: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
  const credential = connection?.credentials[0]
  if (!connection || connection.status !== 'active' || !credential) {
    return NextResponse.json({ message: 'Merchant payment credentials are not configured' }, { status: 409 })
  }

  let keyId: string
  let keySecret: string
  try {
    keyId = decrypt(credential.keyEncrypted)
    keySecret = decrypt(credential.secretEncrypted)
  } catch {
    return NextResponse.json({ message: 'Merchant payment credentials cannot be decrypted' }, { status: 409 })
  }
  if (!keyId || !keySecret) {
    return NextResponse.json({ message: 'Merchant payment credentials are incomplete' }, { status: 409 })
  }

  const built = buildCustomerPaymentLinkPayload({
    quote: {
      id: quote.id,
      storeId: quote.storeId,
      finalPrice: quote.finalPrice,
      currency: quote.currency,
      expiresAt: quote.expiresAt,
      sessionId: quote.sessionId,
      cartToken: quote.cartToken,
    },
    platform,
    customerEmail: quote.customerEmail ?? bounded(body?.customerEmail, 254),
    customerPhone: bounded(body?.customerPhone, 32),
  })
  if (!built.ok) {
    const status = built.reason === 'EXPIRED' ? 410 : 409
    return NextResponse.json({ message: `Offer is not eligible for a payment link: ${built.reason}`, reason: built.reason }, { status })
  }

  const requestId = crypto.randomUUID()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const fresh = await loadQuoteByToken(quoteToken)
  if (!fresh || fresh.id !== quote.id || !ACCEPTABLE_STATUSES.includes(fresh.status)) {
    return NextResponse.json({ message: 'Payment link creation conflict' }, { status: 409 })
  }
  const freshConditions = asConditions(fresh.conditions)
  if (validCustomerPayment(freshConditions, Date.now())) {
    return NextResponse.json({
      paymentLink: freshConditions.customerPayment,
      quoteStatus: fresh.status,
      idempotent: true,
    })
  }

  const pendingExpiresAt = new Date(now + PENDING_TTL_MS)
  const claimedConditions = {
    ...freshConditions,
    customerPaymentPending: {
      requestId,
      createdAt: nowIso,
      expiresAt: pendingExpiresAt.toISOString(),
      expiresAtMs: pendingExpiresAt.getTime(),
    },
  }
  let claim: { count: number }
  try {
    claim = await prisma.bargainQuote.updateMany({
      where: {
        id: fresh.id,
        updatedAt: fresh.updatedAt,
        status: { in: ACCEPTABLE_STATUSES },
        AND: claimGuards(now, nowIso),
      },
      data: { conditions: claimedConditions as any },
    })
  } catch {
    return NextResponse.json({ message: 'Payment link creation conflict' }, { status: 409 })
  }
  if (claim.count !== 1) {
    const raced = await prisma.bargainQuote.findUnique({
      where: { id: fresh.id },
      select: { status: true, conditions: true },
    })
    const racedPayment = raced ? validCustomerPayment(asConditions(raced.conditions), Date.now()) : null
    if (racedPayment) {
      return NextResponse.json({
        paymentLink: racedPayment,
        quoteStatus: raced?.status ?? fresh.status,
        idempotent: true,
      })
    }
    return NextResponse.json({ message: 'Payment link creation is already in progress' }, { status: 409 })
  }

  const claimed = await prisma.bargainQuote.findUnique({
    where: { id: fresh.id },
    select: { status: true, conditions: true, updatedAt: true },
  })
  const claimedPaymentConditions = claimed ? asConditions(claimed.conditions) : {}
  if (!claimed || pendingRequestId(claimedPaymentConditions) !== requestId || !ACCEPTABLE_STATUSES.includes(claimed.status)) {
    await clearPendingMarker(fresh.id, requestId)
    return NextResponse.json({ message: 'Payment link creation conflict' }, { status: 409 })
  }
  const claimVersion = claimed.updatedAt

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  let providerResponse: Response
  try {
    providerResponse = await fetch(RAZORPAY_API, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(built.payload),
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    await clearPendingMarker(fresh.id, requestId)
    return NextResponse.json({ message: 'Payment provider is unavailable' }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }

  let provider: any = null
  try {
    provider = await providerResponse.json()
  } catch {
    provider = null
  }
  if (!providerResponse.ok || typeof provider?.id !== 'string' || typeof provider?.url !== 'string' || !provider.url.startsWith('https://')) {
    await clearPendingMarker(fresh.id, requestId)
    return NextResponse.json(
      { message: 'Payment provider rejected the request', providerStatus: providerResponse.status },
      { status: 502 },
    )
  }

  const referenceId = customerPaymentReference(quote.id)
  const paymentLink = {
    provider: 'razorpay',
    id: provider.id,
    url: provider.url,
    referenceId,
    amountMinor: built.amountMinor,
    currency: quote.currency.toUpperCase(),
    expiresAt: built.expiresAt.toISOString(),
    status: 'active',
    createdAt: new Date().toISOString(),
  }
  const nextConditions = { ...claimedPaymentConditions }
  delete nextConditions.customerPaymentPending
  nextConditions.customerPayment = paymentLink

  let finalized = false
  try {
    finalized = await prisma.$transaction(async (tx) => {
      const updated = await tx.bargainQuote.updateMany({
        where: {
          id: fresh.id,
          updatedAt: claimVersion,
          status: { in: ACCEPTABLE_STATUSES },
          conditions: { path: ['customerPaymentPending', 'requestId'], equals: requestId },
        },
        data: { conditions: nextConditions as any },
      })
      if (updated.count !== 1) return false
      await tx.bargainQuoteEvent.create({
        data: {
          quoteId: quote.id,
          storeId: quote.storeId,
          type: 'customer_payment_link_created',
          detail: { provider: 'razorpay', id: provider.id, referenceId, amountMinor: built.amountMinor } as any,
        },
      })
      return true
    })
  } catch {
    finalized = false
  }
  if (!finalized) {
    await cancelProviderLink(provider.id, keyId, keySecret)
    await clearPendingMarker(fresh.id, requestId)
    return NextResponse.json({ message: 'Payment link creation conflict' }, { status: 409 })
  }

  const transition = await markQuoteCheckoutPending({ id: quote.id, status: claimed.status })

  return NextResponse.json({
    paymentLink,
    quoteStatus: transition?.status ?? claimed.status,
    idempotent: false,
  })
}
