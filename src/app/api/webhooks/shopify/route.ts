import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { verifyShopifyWebhook } from '@/lib/shopify'
import { checkRateLimit } from '@/lib/rate-limiter'
import { FREE_CARTS_THRESHOLD, PLANS, ATTRIBUTION_WINDOW_HOURS } from '@/lib/payment'

export const dynamic = 'force-dynamic'

// Track processed order IDs to handle Shopify retries
const processedOrders = new Set<string>()
setInterval(() => processedOrders.clear(), 60 * 60 * 1000)

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const shopDomain = request.headers.get('x-shopify-shop-domain') || 'unknown'
  const topic = request.headers.get('x-shopify-topic') || 'unknown'

  try {
    // Rate limit per shop
    const { allowed, retryAfter } = await checkRateLimit(shopDomain)
    if (!allowed) {
      console.warn(`Rate limited webhook from ${shopDomain} (${topic})`)
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } })
    }

    const body = await request.text()
    const headers = request.headers

    // Verify webhook signature
    const verified = verifyShopifyWebhook(body, headers)
    if (!verified) {
      return NextResponse.json({ message: 'Invalid signature' }, { status: 401 })
    }

    const data = JSON.parse(body)

    console.log(`Webhook [${topic}] from ${shopDomain} — processing`)

    // Deduplicate order webhooks (Shopify retries up to 19 times)
    if (topic === 'orders/create') {
      const orderId = data.id
      if (orderId && processedOrders.has(String(orderId))) {
        console.log(`Duplicate order ${orderId} from ${shopDomain} — skipping`)
        return NextResponse.json({ received: true, deduplicated: true })
      }
      if (orderId) processedOrders.add(String(orderId))
    }

    switch (topic) {
      case 'carts/update':
        await handleCartUpdate(data, headers)
        break
      case 'checkouts/create':
      case 'checkouts/update':
        await handleCheckout(data, headers)
        break
      case 'orders/create':
        await handleOrderCreate(data, headers)
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
    return NextResponse.json({ message: 'Webhook processed', elapsed })
  }
}

function getStoreDomain(headers: Headers): string | null {
  // Shopify sends x-shopify-shop-domain, e.g. "mystore.myshopify.com"
  const domain = headers.get('x-shopify-shop-domain')
  if (domain) return domain
  // Fallback: try to parse from other headers
  return null
}

async function findStoreByDomain(domain: string | null) {
  if (domain) {
    const store = await prisma.store.findFirst({
      where: { domain },
    })
    if (store) return store
  }

  // Fallback: first Shopify store (legacy)
  const store = await prisma.store.findFirst({
    where: { platform: 'shopify' },
  })
  return store
}

async function handleCartUpdate(data: any, headers: Headers) {
  if (!data.id || !data.token) return

  const cart = data
  const domain = getStoreDomain(headers)
  const store = await findStoreByDomain(domain)

  if (!store) return

  // Upsert cart
  await prisma.cart.upsert({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cart.token,
      },
    },
    update: {
      // Store as a JSON array (the `items` column is a Prisma Json field).
      // Do NOT JSON.stringify — the processor reads Array.isArray(cart.items).
      items: normalizeShopifyItems(cart),
      totalValue: cart.total_price ? parseFloat(cart.total_price) / 100 : 0,
      customerEmail: cart.email,
      customerPhone: cart.phone,
      customerName: cart.customer?.name,
      updatedAt: new Date(),
    },
    create: {
      storeId: store.id,
      cartId: cart.token,
      items: normalizeShopifyItems(cart),
      totalValue: cart.total_price ? parseFloat(cart.total_price) / 100 : 0,
      customerEmail: cart.email,
      customerPhone: cart.phone,
      customerName: cart.customer?.name,
      currency: cart.currency || 'USD',
    },
  })
}

// Map Shopify line items to the shape the recovery processor / email templates
// expect: { name, description?, price, quantity, image? }. Shopify uses
// `line_items` with `title`/`price`; prices are major units (not cents) here.
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

async function handleCheckout(data: any, headers: Headers) {
  await handleCartUpdate(data, headers)
}

async function handleOrderCreate(data: any, headers: Headers) {
  const cartToken = data.token || data.cart_token

  if (!cartToken) return

  const domain = getStoreDomain(headers)
  const store = await findStoreByDomain(domain)

  if (!store) return

  // Find the cart
  const cart = await prisma.cart.findUnique({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cartToken,
      },
    },
  })

  if (!cart) return

  const orderTotal = parseFloat(data.total_price || '0')
  const orderCreatedAt = data.created_at ? new Date(data.created_at) : new Date()

  // 1) ALWAYS mark the cart as converted so the processor stops messaging it.
  //    This applies to every order (ours or organic) — we never message a buyer.
  if (!cart.convertedAt) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { convertedAt: new Date() },
    })
  }

  // 2) ATTRIBUTION: only count/bill this as a recovery if WE sent a recovery
  //    message that was followed by this order within the attribution window.
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
    // Organic sale — customer bought without any influence from us. Not credited, not billed.
    console.log(`Order for cart ${cart.id}: no recovery message in ${ATTRIBUTION_WINDOW_HOURS}h window — converted but NOT credited`)
    return
  }

  const channel = attributingMessage.channel

  // 3) Record the recovery EXACTLY ONCE. The unique cartId on RecoveredCart makes
  //    this idempotent against Shopify's webhook retries (up to 19x) and races.
  try {
    await prisma.recoveredCart.create({
      data: {
        storeId: store.id,
        cartId: cart.id,
        recoveredValue: orderTotal,
        channel,
        netRevenue: orderTotal,
      },
    })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      // Already credited (duplicate webhook) — do NOT double-count revenue or rev-share.
      console.log(`Order for cart ${cart.id}: already credited — skipping duplicate`)
      return
    }
    throw e
  }

  // 4) First-time credit only: flip recovered flag, attribute the channel, count it.
  await prisma.cart.update({
    where: { id: cart.id },
    data: { isRecovered: true, recoveredAt: new Date(), recoveredVia: channel },
  })

  // Mark the attributing message as converted (powers per-channel conversion stats)
  await prisma.message
    .update({ where: { id: attributingMessage.id }, data: { convertedAt: new Date() } })
    .catch(() => {})

  const today = new Date(new Date().toDateString())
  await prisma.analytics.upsert({
    where: { userId_date: { userId: store.userId, date: today } },
    update: {
      cartsRecovered: { increment: 1 },
      revenueRecovered: { increment: orderTotal },
    },
    create: {
      userId: store.userId,
      date: today,
      cartsRecovered: 1,
      revenueRecovered: orderTotal,
    },
  })

  // Track revenue share (only on attributed recoveries, past the free threshold)
  await accrueRevenueShare(store.userId, orderTotal)
}

async function accrueRevenueShare(userId: string, orderTotal: number) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'active' },
  })
  if (!subscription) return

  const planConfig = Object.values(PLANS).find(p => p.id === subscription.plan)
  if (!planConfig || planConfig.revSharePercent <= 0) return

  const totalRecovered = await prisma.recoveredCart.count({
    where: {
      store: { userId },
    },
  })

  // Only apply revenue share after FREE_CARTS_THRESHOLD
  if (totalRecovered <= FREE_CARTS_THRESHOLD) return

  const revShareAmount = orderTotal * (planConfig.revSharePercent / 100)

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      revenueShareAccrued: { increment: revShareAmount },
    },
  })
}
