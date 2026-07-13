import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { verifyShopifyWebhook } from '@/lib/shopify'
import { checkSimpleRateLimit as checkRateLimit } from '@/lib/rate-limit'
import { FREE_CARTS_THRESHOLD, PLANS, ATTRIBUTION_WINDOW_HOURS } from '@/lib/payment'
import { sendAlertOnError } from '@/lib/alerter'
import { getRedis, redisSetNX } from '@/lib/redis'

export const dynamic = 'force-dynamic'

const DEDUP_TTL_MS = 60 * 60 * 1000

async function isDuplicateOrder(orderId: string): Promise<boolean> {
  const redis = getRedis()
  if (redis) {
    const key = `dedup:order:${orderId}`
    const stored = await redisSetNX(key, '1', DEDUP_TTL_MS)
    return !stored
  }
  return false
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const shopDomain = request.headers.get('x-shopify-shop-domain') || 'unknown'
  const topic = request.headers.get('x-shopify-topic') || 'unknown'

  try {
    const { allowed, retryAfter } = await checkRateLimit(shopDomain)
    if (!allowed) {
      console.warn(`Rate limited webhook from ${shopDomain} (${topic})`)
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const body = await request.text()
    const headers = request.headers

    const verified = verifyShopifyWebhook(body, headers)
    if (!verified) {
      return NextResponse.json({ message: 'Invalid signature' }, { status: 401 })
    }

    const data = JSON.parse(body)

    console.log(`Webhook [${topic}] from ${shopDomain} — processing`)

    const store = await findStoreByDomain(shopDomain)
    if (!store) {
      console.log(`No store found for domain ${shopDomain} — returning 200 to stop retries`)
      return NextResponse.json({ received: true })
    }

    if (topic === 'orders/create') {
      const orderId = data.id
      if (orderId) {
        const dup = await isDuplicateOrder(String(orderId))
        if (dup) {
          console.log(`Duplicate order ${orderId} from ${shopDomain} — skipping`)
          return NextResponse.json({ received: true, deduplicated: true })
        }
      }
    }

    switch (topic) {
      case 'carts/update':
        handleCartUpdate(data, store, shopDomain).catch(err => {
          console.error(`Async cart update error for ${shopDomain}:`, err)
        })
        break
      case 'checkouts/create':
      case 'checkouts/update':
        handleCheckout(data, store, shopDomain).catch(err => {
          console.error(`Async checkout error for ${shopDomain}:`, err)
        })
        break
      case 'orders/create':
        processOrderCreate(data, store, shopDomain).catch(err => {
          console.error(`Async order processing error for ${shopDomain}:`, err)
          sendAlertOnError('Async order processing', err, { shopDomain, orderId: data.id }).catch(() => {})
        })
        break
      default:
        console.log('Unhandled webhook topic:', topic)
    }

    const elapsed = Date.now() - startTime
    console.log(`Webhook [${topic}] from ${shopDomain} — done in ${elapsed}ms`)

    return NextResponse.json({ received: true, elapsed })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`Webhook [${topic}] from ${shopDomain} — failed after ${elapsed}ms:`, error)
    sendAlertOnError('Shopify webhook', error, { topic, shopDomain, elapsed }).catch(() => {})
    return NextResponse.json({ message: 'Webhook processed', elapsed })
  }
}

async function findStoreByDomain(domain: string | null) {
  if (!domain) return null
  return prisma.store.findFirst({
    where: { domain },
  })
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
      totalValue: cart.total_price ? parseFloat(cart.total_price) / 100 : 0,
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerPhone ? { customerPhone } : {}),
      ...(customerName ? { customerName } : {}),
      updatedAt: new Date(),
    },
    create: {
      storeId: store.id,
      cartId: cart.token,
      items: normalizeShopifyItems(cart),
      totalValue: cart.total_price ? parseFloat(cart.total_price) / 100 : 0,
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

  const planConfig = Object.values(PLANS).find(p => p.id === subscription.plan)
  if (!planConfig || planConfig.revSharePercent <= 0) return

  const totalRecovered = await prisma.recoveredCart.count({
    where: { store: { userId } },
  })

  if (totalRecovered <= FREE_CARTS_THRESHOLD) return

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
