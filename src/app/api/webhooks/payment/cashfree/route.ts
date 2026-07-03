import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { cashfreeAdapter } from '@/lib/payments/cashfree-adapter'
import { handlePaymentFailure } from '@/lib/payments/recovery'
import { sendAlert } from '@/lib/alerter'

export const dynamic = 'force-dynamic'

async function resolveCustomerContact(merchantId: string, orderRef: string): Promise<{ email?: string; phone?: string } | undefined> {
  try {
    const cart = await prisma.cart.findFirst({
      where: { storeId: merchantId, cartId: orderRef },
      select: { customerEmail: true, customerPhone: true },
    })
    if (cart?.customerEmail || cart?.customerPhone) {
      return { email: cart.customerEmail ?? undefined, phone: cart.customerPhone ?? undefined }
    }

    const customer = await prisma.customer.findFirst({
      where: { storeId: merchantId },
      select: { email: true, phone: true },
    })
    if (customer?.email || customer?.phone) {
      return { email: customer.email ?? undefined, phone: customer.phone ?? undefined }
    }

    return undefined
  } catch {
    return undefined
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const headers = new Headers(req.headers)

    if (!cashfreeAdapter.verifyWebhookSignature(body, headers)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = cashfreeAdapter.parseEvent(body, headers)
    if (!event) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const merchantConfig = await prisma.merchantConfig.findFirst({
      where: { storeId: event.merchantId },
    })
    if (!merchantConfig?.paymentRecoveryEnabled) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const customerContact = await resolveCustomerContact(event.merchantId, event.orderRef)

    await handlePaymentFailure(event, customerContact)

    if (!customerContact) {
      sendAlert(
        'Payment failure — no customer contact',
        `Could not resolve customer contact for merchant ${event.merchantId}, order ${event.orderRef}`,
        { gateway: event.gateway, amount: event.amount }
      ).catch(() => {})
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error('Cashfree payment webhook error:', error)
    return NextResponse.json({ received: true }, { status: 200 })
  }
}
