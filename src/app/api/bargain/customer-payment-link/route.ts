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

function unavailable() {
  return NextResponse.json({ message: 'Not available' }, { status: 404 })
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
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
  if (quote.status !== 'ACCEPTED' && quote.status !== 'CHECKOUT_PENDING') {
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

  const conditions = quote.conditions && typeof quote.conditions === 'object'
    ? (quote.conditions as Record<string, any>)
    : {}
  const existing = conditions.customerPayment
  if (
    existing &&
    typeof existing.url === 'string' &&
    existing.url.startsWith('https://') &&
    typeof existing.expiresAt === 'string' &&
    Date.parse(existing.expiresAt) > Date.now()
  ) {
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
  const nextConditions = { ...conditions, customerPayment: paymentLink }

  await prisma.$transaction([
    prisma.bargainQuote.update({
      where: { id: quote.id },
      data: { conditions: nextConditions as any },
    }),
    prisma.bargainQuoteEvent.create({
      data: {
        quoteId: quote.id,
        storeId: quote.storeId,
        type: 'customer_payment_link_created',
        detail: { provider: 'razorpay', id: provider.id, referenceId, amountMinor: built.amountMinor } as any,
      },
    }),
  ])
  const transition = await markQuoteCheckoutPending({ id: quote.id, status: quote.status })

  return NextResponse.json({
    paymentLink,
    quoteStatus: transition?.status ?? quote.status,
    idempotent: false,
  })
}
