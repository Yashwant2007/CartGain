import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { razorpay } from '@/lib/payment'
import { sendEmail } from '@/lib/services/email'
import { buildRevenueShareInvoiceEmail } from '@/lib/jobs/processRevenueShareBilling'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoices = await prisma.invoice.findMany({
      where: { userId: session.user.id },
      include: {
        revenueShareEvents: {
          select: { id: true, netAmount: true, revShareAmount: true, channel: true, recoveredAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('Invoices fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id, status: 'active' },
    })
    if (!subscription) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
    }

    // Source of truth: sum unbilled RevenueShareEvent records — not the denormalised
    // revenueShareAccrued field, which can lag if two requests race.
    const unbilledEvents = await prisma.revenueShareEvent.findMany({
      where: { subscriptionId: subscription.id, invoiceId: null },
    })
    const invoiceAmount = Math.round(
      unbilledEvents.reduce((sum, e) => sum + e.revShareAmount, 0) * 100
    ) / 100

    if (invoiceAmount < 100) {
      return NextResponse.json(
        { error: 'Revenue share below minimum invoice threshold (₹100)' },
        { status: 400 }
      )
    }

    // Idempotency guard: no pending invoice for this period already
    const existingPending = await prisma.invoice.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: 'pending',
        periodEnd: subscription.currentPeriodEnd,
      },
    })
    if (existingPending) {
      return NextResponse.json(
        { error: 'A pending invoice already exists for this period', invoiceId: existingPending.id },
        { status: 409 }
      )
    }

    // Create the invoice record first so we have an ID for the payment link notes
    const invoice = await prisma.invoice.create({
      data: {
        userId: session.user.id,
        subscriptionId: subscription.id,
        amount: invoiceAmount,
        status: 'pending',
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    // Create Razorpay payment link (non-fatal if it fails — invoice is already created)
    let paymentLinkUrl: string | undefined
    let paymentLinkId: string | undefined

    if (razorpay) {
      try {
        const link = await razorpay.paymentLink.create({
          amount: Math.round(invoiceAmount * 100), // paise
          currency: 'INR',
          description: `CartGain Revenue Share — ${subscription.currentPeriodStart.toLocaleDateString('en-IN')} to ${subscription.currentPeriodEnd.toLocaleDateString('en-IN')}`,
          customer: {
            email: session.user.email || '',
            name: session.user.name || '',
          },
          notify: { email: true, sms: false },
          callback_url: `${process.env.NEXTAUTH_URL}/dashboard/billing`,
          callback_method: 'get',
          notes: {
            invoiceId: invoice.id,
            type: 'revenue_share',
            userId: session.user.id,
          },
          expire_by: Math.round((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
        })
        paymentLinkUrl = link.short_url
        paymentLinkId = link.id
      } catch (e) {
        console.error('Razorpay payment link creation failed:', e)
      }
    }

    // Atomically: link events to invoice + decrement accrued counter
    await prisma.$transaction([
      prisma.revenueShareEvent.updateMany({
        where: { subscriptionId: subscription.id, invoiceId: null },
        data: { invoiceId: invoice.id },
      }),
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { revenueShareAccrued: { decrement: invoiceAmount } },
      }),
    ])

    // Persist payment link details after the transaction so partial failures don't
    // leave dangling unlinked events.
    if (paymentLinkId) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          razorpayPaymentLinkId: paymentLinkId,
          paymentLinkUrl: paymentLinkUrl,
        },
      })
    }

    // Fire-and-forget email — invoice is already committed regardless
    if (session.user.email && paymentLinkUrl) {
      sendEmail({
        to: session.user.email,
        subject: `CartGain Revenue Share Invoice — ₹${invoiceAmount.toLocaleString('en-IN')}`,
        html: buildRevenueShareInvoiceEmail({
          userName: session.user.name || 'there',
          invoiceAmount,
          paymentLinkUrl,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          eventCount: unbilledEvents.length,
        }),
      }).catch(e => console.error('Invoice email failed:', e))
    }

    const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    return NextResponse.json({ invoice: finalInvoice, paymentUrl: paymentLinkUrl })
  } catch (error) {
    console.error('Invoice creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
