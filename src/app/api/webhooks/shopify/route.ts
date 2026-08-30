import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { verifyShopifyWebhook } from '@/lib/shopify'
import { FREE_CARTS_THRESHOLD, PLANS, ATTRIBUTION_WINDOW_HOURS, resolvePlanId } from '@/lib/payment'
import { sendAlertOnError } from '@/lib/alerter'
import { redisSetNX } from '@/lib/redis'

export const dynamic = 'force-dynamic'

const DEDUP_TTL_MS = 60 * 60 * 1000

// Webhooks must be acknowledged with a fast 2xx — Shopify treats slowness and
// non-2xx (including 429) as a delivery failure and retries, which is exactly
// what inflates the failure rate. So this handler:
//   1. verifies the HMAC synchronously (fast, no I/O)
//   2. returns 200 immediately
//   3. does all DB/network work asynchronously, isolated per job
// There is deliberately NO IP-based rate limiting here: Shopify is a trusted
// publisher that already retries+throttles, and 429 would itself be a failure.

async function isDuplicateOrder(orderId: string): Promise<boolean> {
  try {
    const stored = await redisSetNX(`dedup:order:${orderId}`, '1', DEDUP_TTL_MS)
    return !stored
  } catch {
    return false
  }
}

function safeRun(label: string, fn: () => Promise<void>) {
  fn().catch(async (err) => {
    console.error(`Async ${label} error:`, err)
    try {
      await sendAlertOnError(label, err instanceof Error ? err : new Error(String(err)))
    } catch {}
  })
}

export async function POST(request: NextRequest) {
  const shopDomain = request.headers.get('x-shopify-shop-domain') || 'unknown'
  const topic = request.headers.get('x-shopify-topic') || 'unknown'

  let body: string
  try {
    body = await request.text()
  } catch (e) {
    console.error(`Webhook [${topic}] body read failed from ${shopDomain}:`, e)
    return NextResponse.json({ received: false }, { status: 200 })
  }

  // Verify signature FIRST — never process or trust unverified payloads.
  if (!verifyShopifyWebhook(body, request.headers)) {
    console.warn(`Webhook [${topic}] from ${shopDomain} — invalid signature rejected`)
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 })
  }

  let data: any
  try {
    data = JSON.parse(body)
  } catch (e) {
    console.error(`Webhook [${topic}] from ${shopDomain} — unparseable payload, acking to stop retries:`, e)
    return NextResponse.json({ received: true, skipped: 'unparseable' }, { status: 200 })
  }

  // Acknowledge immediately — all processing happens after the response.
  // waitUntil() guarantees Vercel keeps the function alive until the async
  // work finishes (it would otherwise be frozen the moment we return 200).
  console.log(`Webhook [${topic}] from ${shopDomain} — acked (async processing)`)

  waitUntil((async () => {
    const store = await prisma.store.findFirst({ where: { domain: shopDomain } })
    if (!store) {
      console.log(`No store found for domain ${shopDomain} — dropping event`)
      return
    }

    if (topic === 'orders/create') {
      const orderId = data.id
      if (orderId) {
        const dup = await isDuplicateOrder(String(orderId))
        if (dup) {
          console.log(`Duplicate order ${orderId} from ${shopDomain} — skipping`)
          return
        }
      }
    }

    switch (topic) {
      case 'carts/update':
        safeRun('cart update', () => handleCartUpdate(data, store, shopDomain))
        break
      case 'checkouts/create':
      case 'checkouts/update':
        safeRun('checkout', () => handleCheckout(data, store, shopDomain))
        break
      case 'orders/create':
        safeRun('order processing', () => processOrderCreate(data, store, shopDomain))
        break
      default:
        console.log('Unhandled webhook topic:', topic)
    }
  })().catch(async (err) => {
    console.error(`Async webhook processing error [${topic}] from ${shopDomain}:`, err)
    try {
      await sendAlertOnError('Shopify webhook processing', err instanceof Error ? err : new Error(String(err)), { topic, shopDomain })
    } catch {}
  }))

  return NextResponse.json({ received: true })
}

function extractPhone(cart: any): string | null {
  return (
    cart.phone ||
    cart.billing_address?.phone ||
    cart.shipping_address?.phone ||
    cart.customer?.phone ||
    cart.customer?.default_address?.phone ||
    null
  ) || null
}

function extractName(cart: any): string | null {
  const firstName =
    cart.billing_address?.first_name ||
    cart.shipping_address?.first_name ||
    cart.customer?.first_name ||
    ''
  const lastName =
    cart.billing_address?.last_name ||
    cart.shipping_address?.last_name ||
    cart.customer?.last_name ||
    ''
  const full = `${firstName} ${lastName}`.trim()
  return full || cart.customer?.name || null
}

async function handleCartUpdate(data: any, store: any, domain: string) {
  if (!data.id || !data.token) return

  const cart = data
  const customerPhone = extractPhone(cart)
  const customerName = extractName(cart)
  const customerEmail = cart.email || null

  await logDataAccess({
    actorType: 'system',
    action: 'read',
    resourceType: 'cart',
    resourceId: String(cart.id || cart.token),
    purpose: 'shopify webhook cart sync',
    actorId: store.userId,
    metadata: {
      shopDomain: domain,
      hasCustomerEmail: Boolean(customerEmail),
      hasCustomerPhone: Boolean(customerPhone),
    },
  })

  await prisma.cart.upsert({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cart.token,
      },
    },
    update: {
      items: normalizeShopifyItems(cart),
      totalValue: cart.total_price ? parseFloat(cart.total_price) : 0,
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerPhone ? { customerPhone } : {}),
      ...(customerName ? { customerName } : {}),
      updatedAt: new Date(),
    },
    create: {
      storeId: store.id,
      cartId: cart.token,
      items: normalizeShopifyItems(cart),
      totalValue: cart.total_price ? parseFloat(cart.total_price) : 0,
      customerEmail,
      customerPhone,
      customerName,
      currency: cart.currency || 'USD',
    },
  })
}

function normalizeShopifyItems(cart: any): any[] {
  const raw = cart.line_items || cart.items || []
  if (!Array.isArray(raw)) return []
  return raw.map((item: any) => ({
    name: item.title || item.name || 'Item',
    description: item.variant_title || undefined,
    price: item.price != null ? parseFloat(item.price) : 0,
    quantity: item.quantity || 1,
    image: item.image?.src || item.image || undefined,
  }))
}

async function handleCheckout(data: any, store: any, domain: string) {
  await handleCartUpdate(data, store, domain)
}

async function processOrderCreate(data: any, store: any, domain: string) {
  const cartToken = data.token || data.cart_token
  if (!cartToken) return

  await logDataAccess({
    actorType: 'system',
    action: 'read',
    resourceType: 'order',
    resourceId: String(data.id || cartToken),
    purpose: 'shopify webhook order attribution',
    actorId: store.userId,
    metadata: {
      shopDomain: domain,
      cartToken: Boolean(cartToken),
      totalPrice: data.total_price,
    },
  })

  const cart = await prisma.cart.findUnique({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cartToken,
      },
    },
  })

  if (!cart) return

  const grossAmount = parseFloat(data.total_price || '0')
  const orderCreatedAt = data.created_at ? new Date(data.created_at) : new Date()
  const shopifyOrderId = data.id ? String(data.id) : undefined

  const discountAmount = parseFloat(data.total_discounts || '0')
  const netAmount = Math.max(0, grossAmount - discountAmount)
  const discountUsed = discountAmount > 0

  if (!cart.convertedAt) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { convertedAt: new Date() },
    })
  }

  const windowStart = new Date(orderCreatedAt.getTime() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000)
  const attributingMessage = await prisma.message.findFirst({
    where: {
      cartId: cart.id,
      status: 'sent',
      sentAt: { lte: orderCreatedAt, gte: windowStart },
    },
    orderBy: { sentAt: 'desc' },
  })

  if (!attributingMessage) {
    console.log(`Order for cart ${cart.id}: no recovery message in ${ATTRIBUTION_WINDOW_HOURS}h window — converted but NOT credited`)
    return
  }

  const channel = attributingMessage.channel

  try {
    await prisma.recoveredCart.create({
      data: {
        storeId: store.id,
        cartId: cart.id,
        recoveredValue: grossAmount,
        channel,
        discountUsed,
        discountAmount,
        netRevenue: netAmount,
        shopifyOrderId,
      },
    })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      console.log(`Order for cart ${cart.id}: already credited — skipping duplicate`)
      return
    }
    throw e
  }

  await prisma.cart.update({
    where: { id: cart.id },
    data: { isRecovered: true, recoveredAt: new Date(), recoveredVia: channel },
  })

  await prisma.message
    .update({ where: { id: attributingMessage.id }, data: { convertedAt: new Date() } })
    .catch(() => {})

  const today = new Date(new Date().toDateString())
  await prisma.analytics.upsert({
    where: { userId_date: { userId: store.userId, date: today } },
    update: {
      cartsRecovered: { increment: 1 },
      revenueRecovered: { increment: grossAmount },
    },
    create: {
      userId: store.userId,
      date: today,
      cartsRecovered: 1,
      revenueRecovered: grossAmount,
    },
  })

  await accrueRevenueShare({
    userId: store.userId,
    cartId: cart.id,
    storeId: store.id,
    shopifyOrderId,
    grossAmount,
    discountAmount,
    netAmount,
    channel,
    attributedMessageId: attributingMessage.id,
    recoveredAt: orderCreatedAt,
  })
}

interface AccrueParams {
  userId: string
  cartId: string
  storeId: string
  shopifyOrderId: string | undefined
  grossAmount: number
  discountAmount: number
  netAmount: number
  channel: string
  attributedMessageId: string
  recoveredAt: Date
}

async function accrueRevenueShare(params: AccrueParams) {
  const { userId, cartId, storeId, shopifyOrderId, grossAmount, discountAmount, netAmount, channel, attributedMessageId, recoveredAt } = params

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'active' },
  })
  if (!subscription) return

  const planConfig = PLANS[resolvePlanId(subscription.plan)]
  if (!planConfig || planConfig.revSharePercent <= 0) return

  const totalRecovered = await prisma.recoveredCart.count({
    where: { store: { userId } },
  })

  // Free tier: the first FREE_CARTS_THRESHOLD recovered carts are free,
  // no rev share accrues until they're exhausted. Paid tiers accrue from cart 1.
  if (resolvePlanId(subscription.plan) === 'free' && totalRecovered <= FREE_CARTS_THRESHOLD) return

  const revSharePercent = planConfig.revSharePercent
  const revShareAmount = netAmount * (revSharePercent / 100)

  try {
    await prisma.$transaction([
      prisma.revenueShareEvent.create({
        data: {
          subscriptionId: subscription.id,
          cartId,
          storeId,
          shopifyOrderId,
          grossAmount,
          discountAmount,
          netAmount,
          revSharePercent,
          revShareAmount,
          channel,
          attributedMessageId,
          recoveredAt,
        },
      }),
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { revenueShareAccrued: { increment: revShareAmount } },
      }),
    ])
  } catch (e: any) {
    if (e?.code === 'P2002') {
      console.log(`Revenue share event for cart ${cartId} already exists — skipping duplicate`)
      return
    }
    throw e
  }

  console.log(`RevShare accrued: cart ${cartId}, net ₹${netAmount}, ${revSharePercent}% = ₹${revShareAmount.toFixed(2)}`)
}
