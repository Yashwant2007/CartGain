// ── Post-bargain purchase window + purchase attribution ──────────────────────
// Turns a negotiation into a trackable purchase:
//   - A retention code when a negotiation ends WITHOUT an accept (the customer
//     still walks away with the last price we offered).
//   - A checkout link that APPLIES the issued code (the "purchase window").
//   - Purchase attribution from orders/create: marks the session bought and
//     books the rev-share event exactly once (idempotent per order).
// Server-only (imports Prisma). Kept out of the pure engine so the storefront
// bundle never pulls in the DB client.
import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { computeMinPrice } from '@/lib/services/bargain'
import { getBargainGate } from '@/lib/bargain/gate'
import { track } from '@/lib/analytics/track'

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://cart-gain.com').replace(/\/$/, '')
}

/** Opaque, unguessable handle for a buyer's post-bargain purchase-window link. */
export function generateClaimToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

/** Random, non-guessable, per-deal discount code (never derived from the id). */
export function generateBargainCode(): string {
  return `BARGAIN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

/**
 * A checkout link that APPLIES the discount and drops the buyer straight into
 * their purchase window. `/discount/<code>` applies the code, then `redirect`
 * lands them on the variant's cart (already discounted) → checkout.
 */
export function buildBargainCheckoutUrl(opts: {
  domain: string
  code: string
  variantId?: string | null
  quantity?: number | null
}): string {
  const domain = opts.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const qty = Math.max(1, Math.floor(Number(opts.quantity) || 1))
  const discountPath = `/discount/${encodeURIComponent(opts.code)}`
  if (opts.variantId) {
    const numericVariant = String(opts.variantId).replace(/^gid:\/\/shopify\/ProductVariant\//, '')
    const redirect = encodeURIComponent(`/cart/${numericVariant}:${qty}`)
    return `https://${domain}${discountPath}?redirect=${redirect}`
  }
  return `https://${domain}${discountPath}`
}

export function buildBargainClaimUrl(token: string): string {
  return `${appBaseUrl()}/bargain/claim/${token}`
}

const round2 = (n: number) => Math.round(n * 100) / 100

export type IssuedBargainCode = {
  code: string
  finalPrice: number
  purchaseUrl: string
}

/**
 * Issue (or resurface) a discount code for a bargain session that did NOT reach
 * an explicit accept — a rejected/expired/abandoned negotiation still ends with
 * the customer holding the LAST price we offered, so the deal isn't lost.
 *
 * Idempotent: a session that already carries a code just returns it (and heals
 * a missing purchaseUrl). Returns null when there is nothing meaningful to give
 * (no offer at/above floor, or Shopify rejected the code).
 */
export async function issueRetentionDiscount(sessionId: string): Promise<IssuedBargainCode | null> {
  const session = await prisma.bargainSession.findUnique({
    where: { id: sessionId },
    include: { store: true },
  })
  if (!session || !session.store) return null

  // Already minted at accept time — resurface (and repair the link).
  if (session.discountCode && session.finalPrice != null) {
    const purchaseUrl =
      session.purchaseUrl ??
      buildBargainCheckoutUrl({
        domain: session.store.domain,
        code: session.discountCode,
        variantId: session.variantId,
        quantity: session.bulkQuantity,
      })
    if (!session.purchaseUrl) {
      await prisma.bargainSession.update({ where: { id: session.id }, data: { purchaseUrl } }).catch(() => {})
    }
    return { code: session.discountCode, finalPrice: session.finalPrice, purchaseUrl }
  }

  // The last price WE offered — the most recent AI counteroffer.
  const lastAi = await prisma.bargainMessage.findFirst({
    where: { sessionId: session.id, role: 'ai', offeredPrice: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { offeredPrice: true },
  })
  const offered = lastAi?.offeredPrice ?? session.currentOffer ?? null
  if (offered == null) return null

  const { minPrice } = await computeMinPrice({
    storeId: session.storeId,
    shopifyProductId: session.shopifyProductId,
    originalPrice: session.originalPrice,
    bulkQuantity: session.bulkQuantity ?? undefined,
  })

  // Give the offered price, never below floor or above list — and only if it is
  // actually a discount (otherwise there is nothing to hand out).
  const price = round2(Math.min(session.originalPrice, Math.max(minPrice, offered)))
  if (price >= session.originalPrice) return null

  const code = generateBargainCode()
  const result = await generateBargainDiscountCode({
    store: session.store,
    shopifyProductId: session.shopifyProductId,
    variantId: session.variantId ?? null,
    originalPrice: session.originalPrice,
    finalPrice: price,
    discountPercent: 0,
    code,
    customerEmail: session.customerEmail,
    cartToken: session.cartToken,
    bulkQuantity: session.bulkQuantity ?? 1,
    floorPrice: minPrice,
  })
  if (result.status === 'failed') return null

  const purchaseUrl = buildBargainCheckoutUrl({
    domain: session.store.domain,
    code: result.code,
    variantId: session.variantId,
    quantity: session.bulkQuantity,
  })

  await prisma.bargainSession.update({
    where: { id: session.id },
    data: {
      discountCode: result.code,
      discountCodeCustomerEmail: session.customerEmail,
      discountCodeCartToken: session.cartToken,
      finalPrice: price,
      bargainFloor: minPrice,
      purchaseUrl,
    },
  })

  await track({
    name: 'cartgain_bargain_retention_issued',
    storeId: session.storeId,
    properties: { price, originalPrice: session.originalPrice },
  })

  return { code: result.code, finalPrice: price, purchaseUrl }
}

export type PurchaseAttribution = {
  store: { id: string; userId: string; timezone: string | null }
  shopifyOrderId: string
  orderAmount: number
  orderCreatedAt: Date
  email?: string | null
  cartToken?: string | null
  checkoutToken?: string | null
  appliedCodes?: string[]
}

/**
 * Attribute a confirmed order back to the bargain session whose code it used.
 * On success the session becomes `purchased`, the merchant's bargain analytics
 * (count + value) advance, and a rev-share event is booked exactly once.
 *
 * Idempotent: `purchasedOrderId` is unique and the transaction re-checks it, so
 * duplicate/retried webhooks can never double-count or double-charge.
 */
export async function attributeBargainPurchase(params: PurchaseAttribution): Promise<boolean> {
  const { store, shopifyOrderId, email, cartToken, checkoutToken, appliedCodes, orderAmount } = params
  if (!shopifyOrderId) return false

  const ors: any[] = []
  if (email) ors.push({ discountCodeCustomerEmail: email })
  if (cartToken) ors.push({ discountCodeCartToken: cartToken })
  if (checkoutToken) ors.push({ discountCodeCartToken: checkoutToken })
  for (const c of appliedCodes ?? []) if (c) ors.push({ discountCode: c })
  if (ors.length === 0) return false

  const session = await prisma.bargainSession.findFirst({
    where: { storeId: store.id, discountCode: { not: null }, OR: ors },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, finalPrice: true, originalPrice: true, shopifyProductId: true },
  })
  if (!session) return false

  const net = round2(Math.max(0, orderAmount))
  const base = round2(session.finalPrice ?? session.originalPrice)

  let credited = false
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.bargainSession.updateMany({
        where: { id: session.id, purchasedOrderId: null },
        data: {
          status: 'purchased',
          purchasedAt: new Date(),
          purchasedOrderId: shopifyOrderId,
          purchaseValue: base,
        },
      })
      if (claim.count === 0) return
      credited = true

      const today = new Date(new Date().toDateString())
      await tx.analytics.upsert({
        where: { userId_date: { userId: store.userId, date: today } },
        update: { bargainPurchases: { increment: 1 }, bargainRevenue: { increment: net } },
        create: { userId: store.userId, date: today, bargainPurchases: 1, bargainRevenue: net },
      })

      const existing = await tx.bargainRevenueShareEvent.findUnique({ where: { sessionId: session.id } })
      if (existing) {
        await tx.bargainRevenueShareEvent.update({
          where: { sessionId: session.id },
          data: { shopifyOrderId, purchasedAt: new Date() },
        })
      } else {
        const gate = await getBargainGate(store.id)
        const rate = gate.plan.revSharePercent
        if (rate > 0) {
          const revShareAmount = round2((base * rate) / 100)
          await tx.bargainRevenueShareEvent.create({
            data: {
              subscriptionId: gate.subscriptionId,
              sessionId: session.id,
              storeId: store.id,
              shopifyProductId: session.shopifyProductId ?? null,
              grossAmount: round2(session.originalPrice),
              discountAmount: round2(Math.max(0, session.originalPrice - base)),
              netAmount: base,
              revSharePercent: rate,
              revShareAmount,
              shopifyOrderId,
              purchasedAt: new Date(),
            },
          })
          await tx.subscription.update({
            where: { id: gate.subscriptionId },
            data: { bargainAccrued: { increment: revShareAmount }, bargainAccruedValue: { increment: base } },
          })
        }
      }
    })
  } catch (e: any) {
    if (e?.code === 'P2002') return false
    throw e
  }

  if (credited) {
    await track({
      name: 'cartgain_bargain_purchase_attributed',
      storeId: store.id,
      properties: { orderAmount: Math.round(Math.max(0, orderAmount) * 100) / 100, sessionId: session.id },
    })
  }
  return credited
}
