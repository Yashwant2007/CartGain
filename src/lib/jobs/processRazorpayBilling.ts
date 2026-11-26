import prisma from '@/lib/db'
import { getRazorpayConfig } from '@/lib/billing/razorpay/config'
import { razorpayCreatePaymentLink } from '@/lib/billing/razorpay/client'
import { toPaise } from '@/lib/billing/razorpay/plans'
import { shouldInvoice } from '@/lib/jobs/processRevenueShareBilling'
import { sendEmail } from '@/lib/services/email'
import { getAppBaseUrl } from '@/lib/app-base-url'
import { getPlan } from '@/lib/payment'
import { isWooCommercePlatform } from '@/lib/billing/store-subscription'
import { redisSetNXOrNull } from '@/lib/redis'

export interface RazorpayBillingResult {
  processed: number
  skipped: number
  errors: Array<{ subscriptionId: string; error: string }>
}

const RAZORPAY_INVOICE_FLOOR_INR = 100
const RAZORPAY_CURRENCY = 'INR'
const SWEEP_LOCK_KEY = 'cartgain:razorpay-billing:sweep'
const SWEEP_LOCK_TTL_MS = 10 * 60 * 1000

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

function nextPeriod(start: Date, end: Date, now: Date, period: string): { start: Date; end: Date } {
  const base = new Date(Math.max(end.getTime(), now.getTime()))
  const days = period === 'yearly' ? 365 : 30
  return {
    start: base,
    end: new Date(base.getTime() + days * 24 * 60 * 60 * 1000),
  }
}

function advancePeriodUpdate(subscription: any, now: Date): Record<string, unknown> {
  if (subscription.cancelAtPeriodEnd) {
    return {
      status: 'cancelled',
      cancelledAt: now,
      nextBillingAt: null,
      cancelAtPeriodEnd: false,
    }
  }

  const period = nextPeriod(subscription.currentPeriodStart, subscription.currentPeriodEnd, now, subscription.billingPeriod)
  const update: Record<string, unknown> = {
    cartsUsedInPeriod: 0,
    overageMessages: 0,
    cartOverage: 0,
    bargainSessionsUsed: 0,
    bargainDealsUsed: 0,
    bargainOverageDeals: 0,
    revenueShareAccrued: 0,
    bargainAccrued: 0,
    currentPeriodStart: period.start,
    currentPeriodEnd: subscription.pendingPlanId && subscription.pendingStartAt
      ? subscription.pendingStartAt
      : period.start,
    nextBillingAt: subscription.pendingPlanId && subscription.pendingStartAt
      ? subscription.pendingStartAt
      : period.end,
  }
  if (subscription.pendingPlanId && subscription.pendingStartAt) {
    update.currentPeriodEnd = period.end
  }
  return update
}

export async function processRazorpayBilling(): Promise<RazorpayBillingResult> {
  const result: RazorpayBillingResult = { processed: 0, skipped: 0, errors: [] }
  const claimed = await redisSetNXOrNull(SWEEP_LOCK_KEY, '1', SWEEP_LOCK_TTL_MS)
  if (claimed === false) return result

  getRazorpayConfig()
  const now = new Date()
  const appUrl = getAppBaseUrl()

  const subscriptions = await prisma.razorpaySubscription.findMany({
    where: {
      status: { in: ['active', 'past_due'] },
      currentPeriodEnd: { lte: now },
    },
  })

  for (const subscription of subscriptions) {
    try {
      if (subscription.provider !== 'razorpay') {
        result.skipped++
        continue
      }
      const store = await prisma.store.findUnique({
        where: { id: subscription.storeId },
        select: { id: true, platform: true },
      })
      if (!store || !isWooCommercePlatform(store.platform)) {
        result.skipped++
        continue
      }

      const user = await prisma.user.findUnique({
        where: { id: subscription.userId },
        select: { id: true, email: true, name: true },
      })
      const events = await prisma.razorpayUsageEvent.findMany({
        where: { subscriptionId: subscription.id, invoiceId: null },
      })

      const plan = getPlan(subscription.plan)
      const revShareCap = plan.revShareCap > 0 ? plan.revShareCap : Infinity
      const revShareTotal = round2(
        events
          .filter(event => event.kind === 'revenue_share')
          .reduce((sum, event) => sum + event.chargeAmount, 0),
      )
      const overageAmount = round2(
        events
          .filter(event => event.kind !== 'revenue_share')
          .reduce((sum, event) => sum + event.chargeAmount, 0),
      )
      const revShareAmount = round2(Math.min(revShareTotal, revShareCap))
      const invoiceAmount = round2(revShareAmount + overageAmount)
      if (revShareTotal > revShareAmount) {
        console.warn(`Razorpay revenue share cap ${revShareCap} < accrued ${revShareTotal} for sub ${subscription.id} — remainder written off`)
      }

      const existingPending = await prisma.razorpayInvoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          kind: 'usage',
          periodEnd: subscription.currentPeriodEnd,
          status: 'pending',
        },
      })
      if (!existingPending && !shouldInvoice(invoiceAmount, overageAmount, RAZORPAY_INVOICE_FLOOR_INR)) {
        await prisma.razorpayUsageEvent.updateMany({
          where: { subscriptionId: subscription.id, invoiceId: null },
          data: {
            invoiceId: `waived:${subscription.id}:${subscription.currentPeriodEnd.toISOString()}`,
            invoicedAt: now,
          },
        })
        await prisma.razorpaySubscription.update({
          where: { id: subscription.id },
          data: advancePeriodUpdate(subscription, now),
        })
        result.skipped++
        continue
      }

      let invoice = existingPending
      if (!invoice) {
        try {
          invoice = await prisma.razorpayInvoice.create({
            data: {
              userId: subscription.userId,
              storeId: subscription.storeId,
              subscriptionId: subscription.id,
              kind: 'usage',
              amount: invoiceAmount,
              currency: RAZORPAY_CURRENCY,
              status: 'pending',
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd,
              dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
              description: `CartGain usage — ${subscription.currentPeriodStart.toLocaleDateString('en-IN')} to ${subscription.currentPeriodEnd.toLocaleDateString('en-IN')}`,
            },
          })
        } catch (error: any) {
          if (error?.code !== 'P2002') throw error
          invoice = await prisma.razorpayInvoice.findFirst({
            where: {
              subscriptionId: subscription.id,
              kind: 'usage',
              periodEnd: subscription.currentPeriodEnd,
            },
          })
          if (!invoice) throw error
        }
      } else if (invoice.amount !== invoiceAmount) {
        invoice = await prisma.razorpayInvoice.update({
          where: { id: invoice.id },
          data: { amount: invoiceAmount },
        })
      }

      if (!invoice.paymentLinkUrl && !invoice.razorpayPaymentLinkId) {
        const link: any = await razorpayCreatePaymentLink({
          amountPaise: toPaise(invoice.amount),
          currency: RAZORPAY_CURRENCY,
          description: `CartGain usage invoice ${invoice.id}`,
          referenceId: invoice.id,
          callbackUrl: `${appUrl}/dashboard/subscription?billing=success&invoice=${invoice.id}`,
          notes: {
            cartgain_invoice_id: invoice.id,
            cartgain_store_id: subscription.storeId,
            cartgain_subscription_id: subscription.id,
          },
          email: user?.email,
          name: user?.name,
        })
        const paymentLinkUrl = link.short_url || link.url || null
        invoice = await prisma.razorpayInvoice.update({
          where: { id: invoice.id },
          data: {
            paymentLinkUrl,
            razorpayPaymentLinkId: link.id ? String(link.id) : null,
          },
        })
      }

      await prisma.razorpayUsageEvent.updateMany({
        where: { subscriptionId: subscription.id, invoiceId: null },
        data: { invoiceId: invoice.id, invoicedAt: now },
      })

      await prisma.razorpaySubscription.update({
        where: { id: subscription.id },
        data: advancePeriodUpdate(subscription, now),
      })

      if (user?.email && invoice.paymentLinkUrl) {
        await sendEmail({
          to: user.email,
          subject: 'Your CartGain usage invoice is ready',
          html: `<p>Hi ${escapeHtml(user.name || 'there')},</p><p>Your CartGain usage invoice for ${escapeHtml(RAZORPAY_CURRENCY)} ${invoiceAmount.toFixed(2)} is ready.</p><p><a href="${escapeHtml(invoice.paymentLinkUrl)}">Pay invoice</a></p>`,
          text: `Your CartGain usage invoice for ${escapeHtml(RAZORPAY_CURRENCY)} ${invoiceAmount.toFixed(2)} is ready: ${invoice.paymentLinkUrl}`,
        }).catch(() => null)
      }

      result.processed++
    } catch (error: any) {
      result.errors.push({ subscriptionId: subscription.id, error: error?.message || String(error) })
    }
  }

  return result
}
