import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { verifyShopifyWebhook } from '@/lib/shopify'
import { checkSimpleRateLimit as checkRateLimit } from '@/lib/rate-limit'
import { FREE_CARTS_THRESHOLD, PLANS, ATTRIBUTION_WINDOW_HOURS } from '@/lib/payment'
import { sendAlertOnError } from '@/lib/alerter'
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
    sendAlertOnError('Shopify webhook', error, { topic, shopDomain, elapsed }).catch(() => {})
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

// Extract phone from all the places Shopify puts it across cart/checkout payloads:
//   checkouts/create|update → billing_address.phone, shipping_address.phone, phone (top-level)
//   carts/update            → phone (top-level, rarely set)
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

// Extract customer name from all the places Shopify puts it:
//   checkouts → billing_address.first_name + last_name, customer.first_name + last_name
//   carts     → customer.first_name + last_name
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

async function handleCartUpdate(data: any, headers: Headers) {
  if (!data.id || !data.token) return

  const cart = data
  const domain = getStoreDomain(headers)
  const store = await findStoreByDomain(domain)

  if (!store) return

  const customerPhone = extractPhone(cart)
  const customerName = extractName(cart)
  // email lives at top-level for both carts and checkouts
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

  // Upsert cart — only overwrite non-null fields so a later webhook with less
  // data doesn't wipe out phone/email we already captured from an earlier one.
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

  const grossAmount = parseFloat(data.total_price || '0')
  const orderCreatedAt = data.created_at ? new Date(data.created_at) : new Date()
  const shopifyOrderId = data.id ? String(data.id) : undefined

  // Discount applied by CartGain (e.g. from a campaign discount code)
  const discountAmount = parseFloat(data.total_discounts || '0')
  const netAmount = Math.max(0, grossAmount - discountAmount)
  const discountUsed = discountAmount > 0

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
      revenueRecovered: { increment: grossAmount },
    },
    create: {
      userId: store.userId,
      date: today,
      cartsRecovered: 1,
      revenueRecovered: grossAmount,
    },
  })

  // Track revenue share as an immutable ledger event (attributed recoveries only, past the free threshold)
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

  // Count ALL recovered carts for this user across all stores (all-time)
  const totalRecovered = await prisma.recoveredCart.count({
    where: { store: { userId } },
  })

  // First FREE_CARTS_THRESHOLD recoveries are always at 0% — proving period
  if (totalRecovered <= FREE_CARTS_THRESHOLD) return

  const revSharePercent = planConfig.revSharePercent
  const revShareAmount = netAmount * (revSharePercent / 100)

  // Create immutable audit ledger entry. cartId is unique so duplicate webhooks
  // are silently caught by P2002 and never double-accrue.
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
