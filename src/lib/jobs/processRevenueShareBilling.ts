import prisma from '@/lib/db'
import { sendEmail } from '@/lib/services/email'
import { resolveShopifyStoreForUser, reconcileShopifySubscription } from '@/lib/shopify-billing/service'
import { recordShopifyUsage } from '@/lib/shopify-billing/subscriptions'
import {
  resolveUsageCap,
  normalizeCurrency,
  resolveOveragePrices,
  resolveInvoiceFloor,
} from '@/lib/shopify-billing/plans'

export interface BillingResult {
  processed: number
  skipped: number
  errors: Array<{ subscriptionId: string; error: string }>
}

/**
 * Whether a subscription's accrued amount should be invoiced this sweep.
 * Overage (messages/deals/carts consumed beyond the plan) is always billed —
 * the merchant already used the capacity. Pure revenue share waits for the
 * per-currency invoice floor so tiny accruals don't generate noise invoices.
 */
export function shouldInvoice(invoiceAmount: number, overageAmount: number, floor = 100): boolean {
  if (invoiceAmount <= 0) return false
  if (overageAmount > 0) return true
  return invoiceAmount >= floor
}

/**
 * Monthly revenue-share billing sweep.
 *
 * Runs daily at 2am. For each active Shopify subscription whose billing period
 * has ended and that has unbilled rev-share events totalling >= the invoice
 * floor, it records a capped usage charge through Shopify Billing, links the
 * source events to a paid ledger invoice, resets the period meters, and advances
 * the period.
 *
 * Only Shopify subscriptions are eligible. Legacy pre-migration subscriptions
 * are skipped rather than creating any off-platform charge.
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
      if (subscription.provider !== 'shopify') {
        console.warn(`Skipping legacy non-Shopify subscription ${subscription.id}; app charges must use Shopify Billing`)
        result.skipped++
        continue
      }

      // A pending invoice for this period means a previous sweep created the
      // ledger row but settlement did not finish. Resume it with the SAME
      // invoice id: the Shopify usage idempotency key is derived from it, so a
      // retry can never record a second charge.
      const existingPending = await prisma.invoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: 'pending',
          periodEnd: subscription.currentPeriodEnd,
        },
      })
      if (existingPending) {
        console.warn(`Resuming pending invoice ${existingPending.id} for sub ${subscription.id}`)
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
      const shopifyStore = await resolveShopifyStoreForUser(subscription.userId)
      const currency = normalizeCurrency(shopifyStore?.currency)
      const overagePrices = resolveOveragePrices(subscription.plan, currency)

      if (!shopifyStore || !currency || !overagePrices) {
        console.error(`Shopify billing unavailable for sub ${subscription.id} (currency ${shopifyStore?.currency}); skipping this sweep`)
        result.skipped++
        continue
      }

      const revShareTotal =
        Math.round(
          (unbilledCartEvents.reduce((sum, e) => sum + e.revShareAmount, 0)
            + unbilledBargainEvents.reduce((sum, e) => sum + e.revShareAmount, 0)) * 100
        ) / 100

      const revShareCap = resolveUsageCap(subscription.plan, currency) ?? Infinity
      const revShareAmount = Math.min(revShareTotal, revShareCap)

      const overageMessagesCount = subscription.overageMessages
      const overageMessagesAmount = overageMessagesCount * overagePrices.message
      const bargainOverageDeals = subscription.bargainOverageDeals
      const bargainOverageAmount = bargainOverageDeals * overagePrices.deal
      const cartOverageCount = subscription.cartOverage
      const cartOverageAmount = cartOverageCount * overagePrices.cart
      const overageAmount = Math.round((overageMessagesAmount + bargainOverageAmount + cartOverageAmount) * 100) / 100
      const invoiceAmount = Math.round((revShareAmount + overageAmount) * 100) / 100

      // Any overage (messages / deals / carts consumed beyond the plan) is
      // billed immediately — capacity was already used. Pure revenue share under
      // the currency floor waits for the next sweep so tiny accruals never
      // generate invoices.
      const floor = resolveInvoiceFloor(currency)
      if (!existingPending && !shouldInvoice(invoiceAmount, overageAmount, floor)) {
        result.skipped++
        continue
      }

      const fmt = (amount: number) => `${currency} ${amount.toLocaleString('en-IN')}`
      const parts: string[] = []
      if (revShareAmount > 0) parts.push(`Revenue Share: ${fmt(revShareAmount)}`)
      if (overageMessagesAmount > 0) parts.push(`Message Overage: ${fmt(overageMessagesAmount)} (${overageMessagesCount} msgs × ${fmt(overagePrices.message)})`)
      if (bargainOverageAmount > 0) parts.push(`Bargain Overage: ${fmt(bargainOverageAmount)} (${bargainOverageDeals} deals × ${fmt(overagePrices.deal)})`)
      if (cartOverageAmount > 0) parts.push(`Cart Overage: ${fmt(cartOverageAmount)} (${cartOverageCount} carts × ${fmt(overagePrices.cart)})`)
      const description = parts.length > 0
        ? `${parts.join(' + ')} — ${subscription.currentPeriodStart.toLocaleDateString('en-IN')} to ${subscription.currentPeriodEnd.toLocaleDateString('en-IN')}`
        : `CartGain Billing — ${subscription.currentPeriodStart.toLocaleDateString('en-IN')} to ${subscription.currentPeriodEnd.toLocaleDateString('en-IN')}`

      // Create the invoice record first so we have its ID for the idempotency key
      const invoice = existingPending ?? await prisma.invoice.create({
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
      const settledAmount = invoice.amount

      // Settle through Shopify Billing only. The merchant pre-approved the
      // usage cap, so we can never overcharge; any amount beyond the cap is
      // written off (logged) rather than silently billed.
      let lineItemId = subscription.shopifyLineItemId
      if (!lineItemId) {
        await reconcileShopifySubscription(shopifyStore).catch(() => {})
        const refreshed = await prisma.subscription.findUnique({
          where: { id: subscription.id },
          select: { shopifyLineItemId: true },
        })
        lineItemId = refreshed?.shopifyLineItemId ?? null
      }

      const cap = resolveUsageCap(subscription.plan, currency) ?? revShareCap
      const chargeAmount = Number.isFinite(cap) && cap > 0 ? Math.min(settledAmount, cap) : settledAmount
      if (Number.isFinite(cap) && cap > 0 && settledAmount > cap) {
        console.warn(`Shopify usage cap ${cap} < invoice ${settledAmount} for sub ${subscription.id} — billing capped, remainder written off`)
      }

      let usageRecordId: string | undefined
      if (!lineItemId) {
        console.error(`No Shopify usage line item for sub ${subscription.id} — invoice cancelled for retry`)
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
        } else {
          console.error(`Shopify usage charge failed for invoice ${invoice.id}: ${usage.error}`)
        }
      }

      if (!usageRecordId) {
        // Keep the ledger row pending on purpose. A retry reuses this invoice
        // id (and therefore the same Shopify idempotency key), so an ambiguous
        // network failure cannot be recorded twice. Events stay unbilled.
        result.errors.push({
          subscriptionId: subscription.id,
          error: 'Shopify usage charge failed; pending invoice kept for retry',
        })
        continue
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

      // Shopify already collected this charge via the usage record — mark the
      // ledger invoice paid so merchants see a settled record, not a phantom due.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          paidVia: 'shopify',
          paymentRef: usageRecordId,
        },
      })

      // Fire-and-forget receipt — invoice is committed regardless of email success
      if (subscription.user.email) {
        sendEmail({
          to: subscription.user.email,
          subject: `CartGain ${parts.length > 1 ? 'Billing' : revShareAmount > 0 ? 'Revenue Share' : 'Overage'} Receipt — ${fmt(settledAmount)}`,
          html: buildRevenueShareInvoiceEmail({
            userName: subscription.user.name || 'there',
            invoiceAmount: settledAmount,
            currency,
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

      console.log(`✅ Invoice ${invoice.id}: ${fmt(settledAmount)} (revShare: ${fmt(revShareAmount)} + overage: ${fmt(overageAmount)}) for sub ${subscription.id}`)
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
  currency: 'INR' | 'USD'
  periodStart: Date
  periodEnd: Date
  dueDate: Date
  eventCount: number
  bargainEventCount?: number
  overageCount?: number
  overageAmount?: number
}

export function buildRevenueShareInvoiceEmail(params: InvoiceEmailParams): string {
  const { userName, invoiceAmount, currency, periodStart, periodEnd, dueDate, eventCount, bargainEventCount, overageCount, overageAmount } = params
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const fmtMoney = (amount: number) => {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US'
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  }
  const hasRevShare = eventCount > 0 || (bargainEventCount ?? 0) > 0
  const hasOverage = (overageCount ?? 0) > 0

  const title = hasRevShare && hasOverage ? 'CartGain Receipt' : hasRevShare ? 'Revenue Share Receipt' : 'Overage Receipt'

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
      <td style="padding:14px 16px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0;">${fmtMoney(overageAmount ?? 0)}</td>
    </tr>`
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CartGain Receipt</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a2e;margin:0;padding:0;background:#f8fafc;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:22px;margin:0;">${title}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">CartGain &mdash; ${fmtDate(periodStart)} to ${fmtDate(periodEnd)}</p>
    </div>
    <div style="padding:32px 24px;">
      <p>Hi ${userName},</p>
      <p>Your CartGain usage for <strong>${fmtDate(periodStart)} &ndash; ${fmtDate(periodEnd)}</strong> has been charged to your Shopify billing account.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;border-radius:8px;overflow:hidden;">
        ${lineItemsHtml}
        <tr>
          <td style="padding:14px 16px;font-size:14px;color:#64748b;border-bottom:1px solid #e2e8f0;font-weight:700;">Total Charged</td>
          <td style="padding:14px 16px;text-align:right;font-weight:700;font-size:20px;color:#667eea;border-bottom:1px solid #e2e8f0;">${fmtMoney(invoiceAmount)}</td>
        </tr>
        <tr style="background:#f8fafc;">
          <td style="padding:14px 16px;font-size:14px;color:#64748b;">Charged On</td>
          <td style="padding:14px 16px;text-align:right;font-weight:600;">${fmtDate(dueDate)}</td>
        </tr>
      </table>
      <p style="font-size:13px;color:#64748b;text-align:center;margin-top:24px;">
        This amount appears on your next Shopify invoice. No separate payment is needed.<br>
        Questions? Reply to this email and we'll sort it out. Full details are in the CartGain dashboard.
      </p>
    </div>
  </div>
</body>
</html>`
}
