import prisma from '@/lib/db'
import { razorpay, OVERAGE_RATE_PER_MESSAGE } from '@/lib/payment'
import { sendEmail } from '@/lib/services/email'

export interface BillingResult {
  processed: number
  skipped: number
  errors: Array<{ subscriptionId: string; error: string }>
}

/**
 * Monthly revenue-share billing sweep.
 *
 * Runs daily at 2am. For each active subscription whose billing period has ended
 * and that has unbilled rev-share events totalling >= ₹100:
 *   1. Creates an Invoice record
 *   2. Creates a Razorpay Payment Link
 *   3. Links RevenueShareEvent rows to the invoice (atomically)
 *   4. Decrements revenueShareAccrued
 *   5. Emails the merchant with the payment link
 *
 * Fully idempotent: safe to call multiple times for the same subscription.
 */
export async function processRevenueShareBilling(): Promise<BillingResult> {
  const result: BillingResult = { processed: 0, skipped: 0, errors: [] }
  const now = new Date()

  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: 'active',
      currentPeriodEnd: { lte: now },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  })

  for (const subscription of dueSubscriptions) {
    try {
      // Idempotency guard: skip if a pending invoice already covers this period
      const existingPending = await prisma.invoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: 'pending',
          periodEnd: subscription.currentPeriodEnd,
        },
      })
      if (existingPending) {
        result.skipped++
        continue
      }

      // Source of truth: sum unbilled RevenueShareEvent rows
      const unbilledEvents = await prisma.revenueShareEvent.findMany({
        where: { subscriptionId: subscription.id, invoiceId: null },
      })
      const revShareAmount = Math.round(
        unbilledEvents.reduce((sum, e) => sum + e.revShareAmount, 0) * 100
      ) / 100

      const overageCount = subscription.overageEnabled ? subscription.overageMessages : 0
      const overageAmount = overageCount * OVERAGE_RATE_PER_MESSAGE
      const invoiceAmount = revShareAmount + overageAmount

      if (invoiceAmount < 100) {
        result.skipped++
        continue
      }

      const parts: string[] = []
      if (revShareAmount > 0) parts.push(`Revenue Share: ₹${revShareAmount.toLocaleString('en-IN')}`)
      if (overageAmount > 0) parts.push(`Overage: ₹${overageAmount.toLocaleString('en-IN')} (${overageCount} msgs × ₹${OVERAGE_RATE_PER_MESSAGE})`)
      const description = parts.length > 0
        ? `${parts.join(' + ')} — ${subscription.currentPeriodStart.toLocaleDateString('en-IN')} to ${subscription.currentPeriodEnd.toLocaleDateString('en-IN')}`
        : `CartGain Billing — ${subscription.currentPeriodStart.toLocaleDateString('en-IN')} to ${subscription.currentPeriodEnd.toLocaleDateString('en-IN')}`

      // Create the invoice record first so we have its ID for the payment link notes
      const invoice = await prisma.invoice.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          amount: invoiceAmount,
          status: 'pending',
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      // Create Razorpay payment link (non-fatal — invoice exists regardless)
      let paymentLinkUrl: string | undefined
      let paymentLinkId: string | undefined

      if (razorpay) {
        try {
          const link = await razorpay.paymentLink.create({
            amount: Math.round(invoiceAmount * 100), // paise
            currency: 'INR',
            description,
            customer: {
              email: subscription.user.email,
              name: subscription.user.name || '',
            },
            notify: { email: true, sms: false },
            callback_url: `${process.env.NEXTAUTH_URL}/dashboard/billing`,
            callback_method: 'get',
            notes: {
              invoiceId: invoice.id,
              type: 'revenue_share',
              userId: subscription.userId,
              revShareAmount: String(revShareAmount),
              overageAmount: String(overageAmount),
              overageCount: String(overageCount),
            },
            expire_by: Math.round((now.getTime() + 30 * 24 * 60 * 60 * 1000) / 1000),
          })
          paymentLinkUrl = link.short_url
          paymentLinkId = link.id
        } catch (e) {
          console.error(`Razorpay payment link failed for sub ${subscription.id}:`, e)
        }
      }

      // Atomically link events to the invoice and reset counters.
      // If this transaction succeeds, the events are locked to this invoice and will
      // never be double-billed even if the job retries.
      const subscriptionUpdate: any = { revenueShareAccrued: { decrement: revShareAmount } }
      if (overageCount > 0) {
        subscriptionUpdate.overageMessages = { decrement: overageCount }
      }
      await prisma.$transaction([
        prisma.revenueShareEvent.updateMany({
          where: { subscriptionId: subscription.id, invoiceId: null },
          data: { invoiceId: invoice.id },
        }),
        prisma.subscription.update({
          where: { id: subscription.id },
          data: subscriptionUpdate,
        }),
      ])

      if (paymentLinkId) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            razorpayPaymentLinkId: paymentLinkId,
            paymentLinkUrl,
          },
        })
      }

      // Fire-and-forget email — invoice is committed regardless of email success
      if (subscription.user.email && paymentLinkUrl) {
        sendEmail({
          to: subscription.user.email,
          subject: `CartGain ${parts.length > 1 ? 'Billing' : revShareAmount > 0 ? 'Revenue Share' : 'Overage'} Invoice — ₹${invoiceAmount.toLocaleString('en-IN')}`,
          html: buildRevenueShareInvoiceEmail({
            userName: subscription.user.name || 'there',
            invoiceAmount,
            paymentLinkUrl,
            periodStart: subscription.currentPeriodStart,
            periodEnd: subscription.currentPeriodEnd,
            dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            eventCount: unbilledEvents.length,
            overageCount,
            overageAmount,
          }),
        }).catch(e => console.error(`Invoice email failed for sub ${subscription.id}:`, e))
      }

      console.log(`✅ Invoice ${invoice.id}: ₹${invoiceAmount} (revShare: ₹${revShareAmount} + overage: ₹${overageAmount}) for sub ${subscription.id}`)
      result.processed++
    } catch (error: any) {
      console.error(`Billing failed for sub ${subscription.id}:`, error)
      result.errors.push({ subscriptionId: subscription.id, error: error.message })
    }
  }

  return result
}

export interface InvoiceEmailParams {
  userName: string
  invoiceAmount: number
  paymentLinkUrl: string
  periodStart: Date
  periodEnd: Date
  dueDate: Date
  eventCount: number
  overageCount?: number
  overageAmount?: number
}

export function buildRevenueShareInvoiceEmail(params: InvoiceEmailParams): string {
  const { userName, invoiceAmount, paymentLinkUrl, periodStart, periodEnd, dueDate, eventCount, overageCount, overageAmount } = params
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const hasRevShare = eventCount > 0
  const hasOverage = (overageCount ?? 0) > 0

  const title = hasRevShare && hasOverage ? 'CartGain Invoice' : hasRevShare ? 'Revenue Share Invoice' : 'Overage Invoice'

  let lineItemsHtml = ''
  if (hasRevShare) {
    lineItemsHtml += `<tr style="background:#f8fafc;">
      <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;">Carts Recovered (revenue share)</td>
      <td style="padding:14px 16px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;">${eventCount}</td>
    </tr>`
  }
  if (hasOverage) {
    lineItemsHtml += `<tr style="${hasRevShare ? '' : 'background:#f8fafc;'}">
      <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;">Overage Messages (${overageCount} × ₹${OVERAGE_RATE_PER_MESSAGE})</td>
      <td style="padding:14px 16px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;">&#8377;${(overageAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CartGain Invoice</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a2e;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;">${title}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">CartGain &mdash; ${fmt(periodStart)} to ${fmt(periodEnd)}</p>
    </div>
    <div style="padding:32px 24px;">
      <p>Hi ${userName},</p>
      <p>Your CartGain billing for the period <strong>${fmt(periodStart)} &ndash; ${fmt(periodEnd)}</strong> is ready to pay.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;border-radius:8px;overflow:hidden;">
        ${lineItemsHtml}
        <tr>
          <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;font-weight:700;">Total Amount Due</td>
          <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:20px;color:#667eea;border-bottom:1px solid #e2e8f0;">&#8377;${invoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:14px 16px;font-size:14px;color:#64748b;">Due Date</td>
          <td style="padding:14px 16px;text-align:right;font-weight:600;">${fmt(dueDate)}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:32px 0;">
        <a href="${paymentLinkUrl}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:16px 48px;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 4px 16px rgba(102,126,234,0.4);">
          Pay Now &rarr;
        </a>
      </div>
      <p style="font-size:13px;color:#64748b;text-align:center;margin-top:24px;">
        Questions? Reply to this email and we'll sort it out.<br>
        You can also view your full recovery ledger in the CartGain dashboard.
      </p>
    </div>
  </div>
</body>
</html>`
}
