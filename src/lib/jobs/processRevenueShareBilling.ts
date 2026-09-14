import prisma from '@/lib/db'
import { razorpay, OVERAGE_RATE_PER_MESSAGE, getPlan } from '@/lib/payment'
import { sendEmail } from '@/lib/services/email'
import { resolveShopifyStoreForUser, reconcileShopifySubscription } from '@/lib/shopify-billing/service'
import { recordShopifyUsage } from '@/lib/shopify-billing/subscriptions'
import { resolveUsageCap, normalizeCurrency } from '@/lib/shopify-billing/plans'

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

      // Source of truth: sum unbilled RevenueShareEvent + BargainRevenueShareEvent rows
      const [unbilledCartEvents, unbilledBargainEvents] = await Promise.all([
        prisma.revenueShareEvent.findMany({
          where: { subscriptionId: subscription.id, invoiceId: null },
        }),
        prisma.bargainRevenueShareEvent.findMany({
          where: { subscriptionId: subscription.id, invoiceId: null },
        }),
      ])
      const revShareTotal =
        Math.round(
          (unbilledCartEvents.reduce((sum, e) => sum + e.revShareAmount, 0)
            + unbilledBargainEvents.reduce((sum, e) => sum + e.revShareAmount, 0)) * 100
        ) / 100

      const planConfig = getPlan(subscription.plan)
      const revShareCap = planConfig.revShareCap > 0 ? planConfig.revShareCap : Infinity
      // "Capped at ₹5,000/mo" — anything accrued beyond the cap is written off
      const revShareAmount = Math.min(revShareTotal, revShareCap)

      const overageMessagesCount = subscription.overageMessages
      const overageMessagesAmount = overageMessagesCount * OVERAGE_RATE_PER_MESSAGE
      const bargainOverageDeals = subscription.bargainOverageDeals
      const bargainOverageAmount = bargainOverageDeals * planConfig.bargainOverageDealPrice
      const cartOverageCount = subscription.cartOverage
      const cartOverageAmount = cartOverageCount * planConfig.bargainOverageCartPrice
      const overageAmount = Math.round((overageMessagesAmount + bargainOverageAmount + cartOverageAmount) * 100) / 100
      const invoiceAmount = Math.round((revShareAmount + overageAmount) * 100) / 100

      if (invoiceAmount < 100) {
        result.skipped++
        continue
      }

      const parts: string[] = []
      if (revShareAmount > 0) parts.push(`Revenue Share: ₹${revShareAmount.toLocaleString('en-IN')}`)
      if (overageMessagesAmount > 0) parts.push(`Message Overage: ₹${overageMessagesAmount.toLocaleString('en-IN')} (${overageMessagesCount} msgs × ₹${OVERAGE_RATE_PER_MESSAGE})`)
      if (bargainOverageAmount > 0) parts.push(`Bargain Overage: ₹${bargainOverageAmount.toLocaleString('en-IN')} (${bargainOverageDeals} deals × ₹${planConfig.bargainOverageDealPrice})`)
      if (cartOverageAmount > 0) parts.push(`Cart Overage: ₹${cartOverageAmount.toLocaleString('en-IN')} (${cartOverageCount} carts × ₹${planConfig.bargainOverageCartPrice})`)
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

      // Settle the invoice at the provider.
      //  - Shopify track: record a capped usage charge on the subscription. The
      //    merchant pre-approved the cap, so we can never overcharge; any amount
      //    beyond the cap is written off (logged) rather than silently billed.
      //  - Razorpay track: create a payment link for the merchant to pay.
      let paymentLinkUrl: string | undefined
      let paymentLinkId: string | undefined
      let usageRecordId: string | undefined
      let settledViaShopify = false

      if (subscription.provider === 'shopify') {
        const shopifyStore = await resolveShopifyStoreForUser(subscription.userId)
        const currency = normalizeCurrency(shopifyStore?.currency)

        if (!shopifyStore || !currency) {
          console.error(`Shopify billing unavailable for sub ${subscription.id} (currency ${shopifyStore?.currency}) — invoice left pending`)
        } else {
          let lineItemId = subscription.shopifyLineItemId
          if (!lineItemId) {
            await reconcileShopifySubscription(shopifyStore).catch(() => {})
            const refreshed = await prisma.subscription.findUnique({
              where: { id: subscription.id },
              select: { shopifyLineItemId: true },
            })
            lineItemId = refreshed?.shopifyLineItemId ?? null
          }

          const cap = resolveUsageCap(subscription.plan, currency)
          const chargeAmount = cap && cap > 0 ? Math.min(invoiceAmount, cap) : invoiceAmount
          if (cap && cap > 0 && invoiceAmount > cap) {
            console.warn(`Shopify usage cap ${cap} < invoice ${invoiceAmount} for sub ${subscription.id} — billing capped, remainder written off`)
          }

          if (!lineItemId) {
            console.error(`No Shopify usage line item for sub ${subscription.id} — invoice left pending`)
          } else {
            const usage = await recordShopifyUsage({
              store: shopifyStore,
              lineItemId,
              amount: chargeAmount,
              currency,
              description,
              idempotencyKey: `cartgain-invoice-${invoice.id}`,
            })
            if (usage.ok) {
              usageRecordId = usage.usageRecordId
              settledViaShopify = true
            } else {
              console.error(`Shopify usage charge failed for invoice ${invoice.id}: ${usage.error}`)
            }
          }
        }
      } else if (razorpay) {
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
              overageCount: String(overageMessagesCount + bargainOverageDeals + cartOverageCount),
            },
            expire_by: Math.round((now.getTime() + 30 * 24 * 60 * 60 * 1000) / 1000),
          })
          paymentLinkUrl = link.short_url
          paymentLinkId = link.id
        } catch (e) {
          console.error(`Razorpay payment link failed for sub ${subscription.id}:`, e)
        }
      }

      // Atomically link events to the invoice and reset the period's meters.
      // If this transaction succeeds, the events are locked to this invoice and will
      // never be double-billed even if the job retries.
      const subscriptionUpdate: any = {
        revenueShareAccrued: 0,
        revenueSharePaid: { increment: revShareAmount },
        bargainAccrued: 0,
        bargainAccruedValue: 0,
        bargainSessionsUsed: 0,
        bargainDealsUsed: 0,
        bargainOverageDeals: 0,
        cartOverage: 0,
        overageMessages: 0,
      }
      await prisma.$transaction([
        prisma.revenueShareEvent.updateMany({
          where: { subscriptionId: subscription.id, invoiceId: null },
          data: { invoiceId: invoice.id },
        }),
        prisma.bargainRevenueShareEvent.updateMany({
          where: { subscriptionId: subscription.id, invoiceId: null },
          data: { invoiceId: invoice.id },
        }),
        prisma.subscription.update({
          where: { id: subscription.id },
          data: subscriptionUpdate,
        }),
      ])

      // Advance the billing period so limit meters (carts, bargain sessions,
      // deals) apply to a FRESH window. Without this the local currentPeriodEnd
      // stays in the past, getCartsUsedForStore's `sentAt <= currentPeriodEnd`
      // filter starts excluding new sends, and maxCarts silently stops being
      // enforced — the plan limit would lapse for paid merchants.
      // The next advance is derived from the period that was just billed
      // (30 vs 365 days) and clamps to "now" so an overdue sweep starts the new
      // window today rather than in the past.
      if (subscription.currentPeriodStart) {
        const periodDays = Math.min(
          366,
          Math.max(28, Math.round((subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) / 86400000)),
        )
        const nextStart = new Date(Math.max(subscription.currentPeriodEnd.getTime(), Date.now()))
        const nextEnd = new Date(nextStart.getTime() + periodDays * 86400000)
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { currentPeriodStart: nextStart, currentPeriodEnd: nextEnd },
        })
      }

      if (paymentLinkId) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            razorpayPaymentLinkId: paymentLinkId,
            paymentLinkUrl,
          },
        })
      }

      // Shopify already collected this charge via the usage record — mark the
      // ledger invoice paid so merchants see a settled record, not a phantom due.
      if (settledViaShopify) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'paid',
            paidAt: new Date(),
            paidVia: 'shopify',
            paymentRef: usageRecordId || null,
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
            eventCount: unbilledCartEvents.length,
            bargainEventCount: unbilledBargainEvents.length,
            overageCount: overageMessagesCount + bargainOverageDeals + cartOverageCount,
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
  bargainEventCount?: number
  overageCount?: number
  overageAmount?: number
}

export function buildRevenueShareInvoiceEmail(params: InvoiceEmailParams): string {
  const { userName, invoiceAmount, paymentLinkUrl, periodStart, periodEnd, dueDate, eventCount, bargainEventCount, overageCount, overageAmount } = params
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const hasRevShare = eventCount > 0 || (bargainEventCount ?? 0) > 0
  const hasOverage = (overageCount ?? 0) > 0

  const title = hasRevShare && hasOverage ? 'CartGain Invoice' : hasRevShare ? 'Revenue Share Invoice' : 'Overage Invoice'

  let lineItemsHtml = ''
  if (eventCount > 0) {
    lineItemsHtml += `<tr style="background:#f8fafc;">
      <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;">Carts Recovered (revenue share)</td>
      <td style="padding:14px 16px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;">${eventCount}</td>
    </tr>`
  }
  if ((bargainEventCount ?? 0) > 0) {
    lineItemsHtml += `<tr style="${eventCount > 0 ? '' : 'background:#f8fafc;'}">
      <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;">Bargain Deals (revenue share)</td>
      <td style="padding:14px 16px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;">${bargainEventCount}</td>
    </tr>`
  }
  if (hasOverage) {
    lineItemsHtml += `<tr style="${hasRevShare ? '' : 'background:#f8fafc;'}">
      <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;">Overage (${overageCount} units)</td>
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
