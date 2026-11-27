import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { redeemQuote, transitionQuote } from '@/lib/bargain/quote'
import {
  CUSTOMER_PAYMENT_PROVIDER,
  customerPaymentIdempotencyKey,
  normalizeCustomerPaymentEvent,
  verifyCustomerPaymentWebhook,
} from '@/lib/customer-payments/razorpay'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('CUSTOMER_RAZORPAY_PAYMENT_LINK')) {
    return NextResponse.json({ message: 'Not available' }, { status: 404 })
  }

  const rawBody = await request.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ message: 'Invalid webhook body' }, { status: 400 })
  }

  const event = normalizeCustomerPaymentEvent(parsed)
  const signature = request.headers.get('x-razorpay-signature')
  const connections = await prisma.platformConnection.findMany({
    where: { platform: CUSTOMER_PAYMENT_PROVIDER, webhookSecret: { not: null } },
    select: { storeId: true, webhookSecret: true },
  })
  const verifiedStoreIds: string[] = []
  for (const connection of connections) {
    let webhookSecret: string
    try {
      webhookSecret = decrypt(connection.webhookSecret as string)
    } catch {
      continue
    }
    if (verifyCustomerPaymentWebhook(rawBody, signature, webhookSecret)) {
      verifiedStoreIds.push(connection.storeId)
    }
  }
  if (verifiedStoreIds.length === 0) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 })
  }

  if (!event.quoteId) {
    return NextResponse.json({ received: true, ignored: true, reason: 'no_quote_reference' })
  }

  const quote = await prisma.bargainQuote.findFirst({
    where: { id: event.quoteId, storeId: { in: verifiedStoreIds } },
    select: {
      id: true,
      storeId: true,
      status: true,
      finalPrice: true,
      currency: true,
      conditions: true,
    },
  })
  if (!quote) {
    return NextResponse.json({ received: true, ignored: true, reason: 'quote_not_found' })
  }

  const entityId = customerPaymentIdempotencyKey(event, request.headers.get('x-razorpay-event-id'))
  try {
    await prisma.webhookEvent.create({
      data: { namespace: CUSTOMER_PAYMENT_PROVIDER, entityId },
    })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    throw error
  }

  const conditions = quote.conditions && typeof quote.conditions === 'object'
    ? (quote.conditions as Record<string, any>)
    : {}
  const payment = conditions.customerPayment
  if (!payment || payment.referenceId !== event.referenceId) {
    return NextResponse.json({ received: true, ignored: true, reason: 'reference_mismatch' })
  }

  const expectedAmount = Math.round(quote.finalPrice * 100)
  if (event.amountMinor !== expectedAmount || (event.currency && event.currency !== quote.currency.toUpperCase())) {
    return NextResponse.json({ received: true, ignored: true, reason: 'amount_mismatch' })
  }

  if (event.captured) {
    const redeemed = await redeemQuote({ quote, orderId: `razorpay:${event.entityId ?? 'unknown'}` })
    if (!redeemed.ok) {
      return NextResponse.json({ received: true, ignored: true, reason: redeemed.reason })
    }
    return NextResponse.json({
      received: true,
      quoteId: quote.id,
      paymentId: event.entityId,
      quoteStatus: 'REDEEMED',
      orderCreated: false,
      note: 'Payment captured. Shopify/WooCommerce order reconciliation remains a separate verified-order flow.',
    })
  }

  if (event.failed) {
    const cancelled = await transitionQuote({
      quoteId: quote.id,
      to: 'CANCELLED',
      storeId: quote.storeId,
      detail: { reason: 'customer_payment_failed', event: event.event, paymentId: event.entityId },
    })
    return NextResponse.json({
      received: true,
      quoteId: quote.id,
      quoteStatus: cancelled?.status ?? quote.status,
      orderCreated: false,
    })
  }

  return NextResponse.json({ received: true, ignored: true, reason: 'unhandled_event', event: event.event })
}

export async function GET() {
  return NextResponse.json({ status: 'ok', provider: 'razorpay', scope: 'customer_order' })
}
