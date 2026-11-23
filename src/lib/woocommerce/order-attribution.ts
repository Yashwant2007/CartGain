import prisma from '@/lib/db'
import { computeRefundNetting, isMessageAttributable } from '@/lib/attribution'
import { attributeBargainGoal, netBargainGoalRefund } from '@/lib/bargain/goals'
import { recordLearningRefund } from '@/lib/bargain/learning/outcomes'
import {
  attributeBargainPurchase,
  rememberConfirmedOrder,
  netBargainPurchaseRefund,
} from '@/lib/bargain/purchase'
import { findQuoteByDiscountCode, redeemQuote } from '@/lib/bargain/quote'
import { track } from '@/lib/analytics/track'
import { ATTRIBUTION_WINDOW_HOURS, FREE_CARTS_THRESHOLD, getPlan, resolvePlanId } from '@/lib/payment'
import type { PlatformOrderRecord } from '@/lib/platforms/types'

type StoreContext = {
  id: string
  userId: string
  domain: string
  timezone: string | null
}

type OrderItems = Record<string, unknown>[]

function bargainOrderId(order: PlatformOrderRecord): string {
  return `woo:${order.platformOrderId}`
}

function safeAmount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizedLineItems(order: PlatformOrderRecord): OrderItems {
  if (!Array.isArray(order.items)) return []
  return order.items.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    return [{
      product_id: item.productId ?? item.product_id ?? item.id ?? null,
      product: item.product ? item.product : undefined,
      variant_id: item.variationId ?? item.variation_id ?? item.variantId ?? null,
      title: item.name ?? item.title ?? null,
      name: item.name ?? item.title ?? null,
      price: item.price ?? item.lineTotal ?? item.line_total ?? item.total ?? 0,
      quantity: item.quantity ?? 1,
      sku: item.sku ?? null,
    }]
  })
}

function appliedCodes(order: PlatformOrderRecord): string[] {
  if (!Array.isArray(order.couponCodes)) return []
  return order.couponCodes
    .map((code) => (typeof code === 'string' ? code : (code as Record<string, unknown>)?.code))
    .filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
    .map((code) => code.trim())
}

export async function attributeWooBargainOrder(store: StoreContext, order: PlatformOrderRecord): Promise<void> {
  const orderId = bargainOrderId(order)
  const codes = appliedCodes(order)
  const netAmount = safeAmount(order.total)
  const grossAmount = Math.max(netAmount, safeAmount(order.subtotal) || netAmount + safeAmount(order.discountTotal))
  const discountAmount = Math.max(0, grossAmount - netAmount)
  const orderedAt = order.placedAt ?? order.paidAt ?? new Date()

  await rememberConfirmedOrder({
    storeId: store.id,
    shopifyOrderId: orderId,
    email: order.customerEmail,
    phone: order.customerPhone,
    cartToken: order.cartId,
    customerId: order.externalCustomerId,
    purchasedAt: orderedAt,
    currency: order.currency,
    lineItems: normalizedLineItems(order),
    appliedCodes: codes,
  }).catch((err) => console.error('[BARGAIN_PURCHASE_MEMORY]', err))

  await attributeBargainGoal({
    store: { id: store.id, timezone: store.timezone },
    shopifyOrderId: orderId,
    orderAmount: netAmount,
    orderCreatedAt: orderedAt,
    email: order.customerEmail,
    cartToken: order.cartId,
    appliedCodes: codes,
  }).catch((err) => console.error('[BARGAIN_GOAL_ATTRIBUTE]', err))

  await attributeBargainPurchase({
    store: { id: store.id, userId: store.userId, timezone: store.timezone },
    shopifyOrderId: orderId,
    orderAmount: netAmount,
    orderCreatedAt: orderedAt,
    email: order.customerEmail,
    cartToken: order.cartId,
    appliedCodes: codes,
  }).catch((err) => console.error('[BARGAIN_PURCHASE_ATTRIBUTE]', err))

  for (const code of codes) {
    const quote = await findQuoteByDiscountCode(store.id, code).catch(() => null)
    if (quote && quote.status !== 'REDEEMED') {
      await redeemQuote({
        quote: { id: quote.id, status: quote.status, orderId: quote.orderId, storeId: quote.storeId },
        orderId,
      }).catch(() => undefined)
    }
  }
}

async function accrueRevenueShare(params: {
  store: StoreContext
  cartId: string
  orderId: string
  grossAmount: number
  discountAmount: number
  netAmount: number
  channel: string
  attributedMessageId: string
  recoveredAt: Date
}): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: { userId: params.store.userId, status: 'active' },
  })
  if (!subscription) return

  const plan = getPlan(subscription.plan)
  if (!plan || plan.revSharePercent <= 0) return

  const totalRecovered = await prisma.recoveredCart.count({ where: { store: { userId: params.store.userId } } })
  if (resolvePlanId(subscription.plan) === 'free' && totalRecovered <= FREE_CARTS_THRESHOLD) return

  const revShareAmount = params.netAmount * (plan.revSharePercent / 100)
  await prisma.$transaction([
    prisma.revenueShareEvent.create({
      data: {
        subscriptionId: subscription.id,
        cartId: params.cartId,
        storeId: params.store.id,
        shopifyOrderId: params.orderId,
        grossAmount: params.grossAmount,
        discountAmount: params.discountAmount,
        netAmount: params.netAmount,
        revSharePercent: plan.revSharePercent,
        revShareAmount,
        channel: params.channel,
        attributedMessageId: params.attributedMessageId,
        recoveredAt: params.recoveredAt,
      },
    }),
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { revenueShareAccrued: { increment: revShareAmount } },
    }),
  ])
}

export async function attributeWooRecoveryOrder(
  store: StoreContext,
  order: PlatformOrderRecord,
  cartId: string,
): Promise<boolean> {
  const orderId = bargainOrderId(order)
  const orderedAt = order.placedAt ?? order.paidAt ?? new Date()
  const windowStart = new Date(orderedAt.getTime() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000)
  const message = await prisma.message.findFirst({
    where: {
      cartId,
      status: { in: ['sent', 'delivered'] as const },
      sentAt: { lte: orderedAt, gte: windowStart },
    },
    orderBy: { sentAt: 'desc' },
  })
  if (!message || !isMessageAttributable({
    messageStatus: message.status,
    sentAt: message.sentAt,
    orderCreatedAt: orderedAt,
  })) return false

  const netAmount = safeAmount(order.total)
  const grossAmount = Math.max(netAmount, safeAmount(order.subtotal) || netAmount + safeAmount(order.discountTotal))
  const discountAmount = Math.max(0, grossAmount - netAmount)
  const channel = message.channel

  try {
    await prisma.recoveredCart.create({
      data: {
        storeId: store.id,
        cartId,
        recoveredValue: grossAmount,
        channel,
        discountUsed: discountAmount > 0,
        discountAmount,
        netRevenue: netAmount,
        shopifyOrderId: orderId,
      },
    })
  } catch (err: any) {
    if (err?.code === 'P2002') return false
    throw err
  }

  await prisma.cart.update({
    where: { id: cartId },
    data: { isRecovered: true, recoveredAt: new Date(), recoveredVia: channel },
  })
  await prisma.message.update({ where: { id: message.id }, data: { convertedAt: new Date() } }).catch(() => undefined)

  const today = new Date(new Date().toDateString())
  await prisma.analytics.upsert({
    where: { userId_date: { userId: store.userId, date: today } },
    update: { cartsRecovered: { increment: 1 }, revenueRecovered: { increment: netAmount } },
    create: { userId: store.userId, date: today, cartsRecovered: 1, revenueRecovered: netAmount },
  })
  await track({
    name: 'cartgain_cart_recovered',
    userId: store.userId,
    storeId: store.id,
    properties: { channel, grossAmount, netAmount, discountUsed: discountAmount > 0, platform: 'woocommerce' },
  })
  await accrueRevenueShare({
    store,
    cartId,
    orderId,
    grossAmount,
    discountAmount,
    netAmount,
    channel,
    attributedMessageId: message.id,
    recoveredAt: orderedAt,
  }).catch((err) => console.error('[WOO_REVENUE_SHARE]', err))

  return true
}

export async function netWooOrderRefund(
  store: StoreContext,
  order: PlatformOrderRecord,
  reason: 'refund' | 'cancelled',
): Promise<void> {
  const orderId = bargainOrderId(order)
  const refundAmount = reason === 'cancelled' ? 0 : safeAmount(order.refundedTotal)

  const recovered = await prisma.recoveredCart.findFirst({
    where: { storeId: store.id, shopifyOrderId: orderId },
    include: { revenueShareEvent: true },
  })
  if (recovered) {
    const netting = computeRefundNetting({
      recoveredValue: recovered.recoveredValue || 0,
      netRevenue: recovered.netRevenue || 0,
      prevTotalRefunded: recovered.totalRefunded || 0,
      refundAmount,
      reason,
    })
    if (netting.deltaRefunded > 0) {
      const event = recovered.revenueShareEvent
      let revShareDelta = 0
      if (event && !event.invoiceId) {
        revShareDelta = Math.max(0, (event.revShareAmount || 0) - (netting.recognizedNet * (event.revSharePercent || 0)) / 100)
      } else if (event?.invoiceId) {
        console.error(`[WOO_REFUND_INVOICED] order ${orderId} revenue share already invoiced: ${event.invoiceId}`)
      }

      await prisma.$transaction(async (tx) => {
        await tx.recoveredCart.update({
          where: { id: recovered.id },
          data: {
            netRevenue: netting.recognizedNet,
            totalRefunded: netting.newTotalRefunded,
            refundStatus: netting.fullyRefunded ? 'fully_refunded' : 'partially_refunded',
          },
        })
        if (event && revShareDelta > 0) {
          await tx.revenueShareEvent.update({
            where: { id: event.id },
            data: {
              netAmount: netting.recognizedNet,
              revShareAmount: (netting.recognizedNet * (event.revSharePercent || 0)) / 100,
            },
          })
          await tx.subscription.update({
            where: { id: event.subscriptionId },
            data: { revenueShareAccrued: { decrement: revShareDelta } },
          })
        }
        if (netting.analyticsRevenueDelta > 0) {
          const today = new Date(new Date().toDateString())
          const row = await tx.analytics.findUnique({
            where: { userId_date: { userId: store.userId, date: today } },
          })
          if (row) {
            await tx.analytics.update({
              where: { userId_date: { userId: store.userId, date: today } },
              data: {
                revenueRecovered: Math.max(0, (row.revenueRecovered || 0) - netting.analyticsRevenueDelta),
                cartsRecovered: netting.fullyRefunded
                  ? Math.max(0, (row.cartsRecovered || 0) + netting.analyticsCartsDelta)
                  : row.cartsRecovered,
              },
            })
          }
        }
      })
    }
  }

  await netBargainGoalRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount,
    fullyRefunded: reason === 'cancelled',
  }).catch((err) => console.error('[BARGAIN_GOAL_REFUND]', err))
  await netBargainPurchaseRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount,
    fullyRefunded: reason === 'cancelled',
    refundId: reason === 'cancelled' ? 'cancelled' : `woo-refund:${order.platformOrderId}:${order.refundedAt?.toISOString() ?? ''}`,
  }).catch((err) => console.error('[BARGAIN_PURCHASE_REFUND]', err))
  await recordLearningRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount,
    fullyRefunded: reason === 'cancelled',
    refundId: `woo-${reason}:${order.platformOrderId}`,
  }).catch((err) => console.error('[LEARNING_REFUND]', err))
}
