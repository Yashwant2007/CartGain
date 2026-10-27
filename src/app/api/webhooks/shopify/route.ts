import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import prisma from '@/lib/db'
import { logDataAccess } from '@/lib/data-protection'
import { verifyShopifyWebhook } from '@/lib/shopify'
import { normalizeShopifyLineItems } from '@/lib/shopify-line-items'
import { purgeStoreData, redactCustomer } from '@/lib/data-deletion'
import {
  collectCustomerData,
  createCustomerDataExport,
  deliverCustomerDataExportToMerchant,
  normalizeCustomerId,
} from '@/lib/data-export'
import { computeRefundNetting, isMessageAttributable } from '@/lib/attribution'
import { attributeBargainGoal, netBargainGoalRefund } from '@/lib/bargain/goals'
import { recordLearningRefund } from '@/lib/bargain/learning/outcomes'
import { attributeBargainPurchase, netBargainPurchaseRefund } from '@/lib/bargain/purchase'
import { reconcileShopifySubscription, downgradeSubscriptionToFree } from '@/lib/shopify-billing/service'
import { mapShopifyStatus } from '@/lib/shopify-billing/subscriptions'
import { FREE_CARTS_THRESHOLD, PLANS, ATTRIBUTION_WINDOW_HOURS, resolvePlanId, getPlan } from '@/lib/payment'
import { sendAlertOnError } from '@/lib/alerter'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import { isDuplicateOrder } from '@/lib/order-dedup'
import { shopDomainCandidates } from '@/lib/stores/resolve-by-domain'
import {
  cancelPendingRecoveryForCart,
  ensureRecipientForCart,
  upsertRecipient,
} from '@/lib/recovery/recipients'

export const dynamic = 'force-dynamic'

// Webhooks must be acknowledged with a fast 2xx — Shopify treats slowness and
// non-2xx (including 429) as a delivery failure and retries, which is exactly
// what inflates the failure rate. So this handler:
//   1. verifies the HMAC synchronously (fast, no I/O)
//   2. returns 200 immediately
//   3. does all DB/network work asynchronously, isolated per job
// There is deliberately NO IP-based rate limiting here: Shopify is a trusted
// publisher that already retries+throttles, and 429 would itself be a failure.

// A shop domain is only a lookup key, never proof of ownership. Signup lets a
// visitor park any domain on an inactive row, so webhooks must resolve ONLY a
// store that actually completed Shopify OAuth (platform + stored access token).
// Otherwise a squatted row could receive another merchant's order/customer data.
async function findConnectedStoreByShopDomain(shopDomain: string) {
  for (const domain of shopDomainCandidates(shopDomain)) {
    const store = await prisma.store.findFirst({
      where: {
        domain: { equals: domain, mode: 'insensitive' },
        platform: 'shopify',
        apiKey: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (store) return store
  }
  return null
}

function safeRun(label: string, fn: () => Promise<void>) {
  // MUST return the promise so callers can `await` it. `waitUntil()` only keeps
  // the function alive until the promise it is HANDED resolves — if the handler
  // promise is fired-and-forgotten here, the waitUntil wrapper resolves at once
  // and Vercel freezes the function before the DB write / message send finishes,
  // silently dropping the event (webhook acks 200, nothing is stored).
  return fn().catch(async (err) => {
    console.error(`Async ${label} error:`, err)
    try {
      await captureError({
        level: 'error',
        component: 'webhook',
        operation: `shopify_${label.replace(/\s+/g, '_')}`,
        error: err,
        persist: true,
        statusCode: 500,
      })
    } catch {}
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

  // Per-store webhook secret binding: when the shop backing this delivery has
  // its own signing secret (custom/self-managed Shopify app), verify against
  // THAT secret instead of the app-wide one. This binds each delivery to the
  // store's own key, so a body signed for one shop can never be accepted for
  // another. Falls back to SHOPIFY_API_SECRET when the store has none — the
  // standard case for a public Shopify app. The header domain is only used as a
  // lookup key here (nothing is trusted until the HMAC check passes).
  let storeWebhookSecret: string | null = null
  if (shopDomain !== 'unknown') {
    try {
      const boundStore = await findConnectedStoreByShopDomain(shopDomain)
      if (boundStore?.webhookSecret) {
        const { decrypt } = await import('@/lib/encryption')
        storeWebhookSecret = decrypt(boundStore.webhookSecret)
      }
    } catch (e) {
      console.error(`Webhook [${topic}] from ${shopDomain} — failed to resolve per-store webhook secret:`, e)
    }
  }

  // Verify signature FIRST — never process or trust unverified payloads.
  if (!verifyShopifyWebhook(body, request.headers, storeWebhookSecret)) {
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

  // The HMAC covers only the body, NOT the x-shopify-shop-domain header. Since
  // every store shares this app's signing secret, a captured+replayed body could
  // otherwise be re-aimed at a different tenant by swapping the header (e.g. an
  // attacker's app/uninstalled replayed with a victim's domain → destructive
  // purge). When the (signed) payload declares its shop, that value is
  // authoritative; a header that disagrees is rejected outright.
  const payloadDomain =
    (typeof data?.shop_domain === 'string' && data.shop_domain.trim()) ||
    (typeof data?.myshopify_domain === 'string' && data.myshopify_domain.trim()) ||
    (typeof data?.domain === 'string' && data.domain.trim()) ||
    null

  if (payloadDomain && shopDomain !== 'unknown' && shopDomain.toLowerCase() !== payloadDomain.toLowerCase()) {
    console.warn(`Webhook [${topic}] rejected — header domain ${shopDomain} does not match signed payload domain ${payloadDomain}`)
    return NextResponse.json({ message: 'Shop domain mismatch' }, { status: 401 })
  }

  const resolvedDomain = payloadDomain || shopDomain

  // Acknowledge immediately — all processing happens after the response.
  // waitUntil() guarantees Vercel keeps the function alive until the async
  // work finishes (it would otherwise be frozen the moment we return 200).
  console.log(`Webhook [${topic}] from ${resolvedDomain} — acked (async processing)`)

  waitUntil((async () => {
    const store = await findConnectedStoreByShopDomain(resolvedDomain)
    if (!store) {
      console.log(`No store found for domain ${resolvedDomain} — dropping event`)
      return
    }

    if (topic === 'orders/create') {
      const orderId = data.id
      if (orderId) {
        // Store-scoped: Shopify order ids are per-shop sequences, so a global
        // marker made another store's identical order id look like a replay.
        const dup = await isDuplicateOrder(String(orderId), store.id)
        if (dup) {
          console.log(`Duplicate order ${orderId} from ${shopDomain} — skipping`)
          return
        }
      }
    }

    switch (topic) {
      case 'carts/update':
        await safeRun('cart update', () => handleCartUpdate(data, store, shopDomain))
        break
      case 'checkouts/create':
      case 'checkouts/update':
        await safeRun('checkout', () => handleCheckout(data, store, shopDomain))
        break
      case 'orders/create':
        await safeRun('order processing', () => processOrderCreate(data, store, shopDomain))
        break
      case 'orders/cancelled':
        await safeRun('order cancelled netting', () => handleOrderCancelled(data, store, shopDomain))
        break
      case 'refunds/create':
        await safeRun('order refund netting', () => handleRefundCreate(data, store, shopDomain))
        break
      case 'app/uninstalled':
        await safeRun('app uninstall purge', () => handleAppUninstalled(store))
        break
      case 'shop/redact':
        await safeRun('shop redact purge', () => handleShopRedact(store))
        break
      case 'customers/redact':
        await safeRun('customer redact', () => handleCustomerRedact(data, store, shopDomain))
        break
      case 'customers/data_request':
        await safeRun('customer data request', () => handleCustomerDataRequest(data, store, shopDomain))
        break
      case 'customers/create':
      case 'customers/update':
        await safeRun('customer sync', () => handleCustomerSync(data, store))
        break
      case 'app_subscriptions/update':
        await safeRun('app subscription update', () => handleAppSubscriptionUpdate(data, store, shopDomain))
        break
      default:
        console.log('Unhandled webhook topic:', topic)
    }
  })().catch(async (err) => {
    console.error(`Async webhook processing error [${topic}] from ${shopDomain}:`, err)
    try {
      await captureError({
        level: 'error',
        component: 'webhook',
        operation: 'shopify_processing',
        error: err,
        persist: true,
        statusCode: 500,
      })
    } catch {}
    try {
      await sendAlertOnError('Shopify webhook processing', err instanceof Error ? err : new Error(String(err)), { topic, shopDomain })
    } catch {}
  }))

  return NextResponse.json({ received: true })
}

// ── Shopify lifecycle / privacy webhooks ──────────────────────────────
// These satisfy Shopify's mandatory privacy & app-uninstall webhooks and drive
// the data deletion obligations described in the Privacy Policy and DPA.

async function handleAppUninstalled(store: any) {
  console.log(`Shopify app uninstalled for store ${store.domain} (${store.id}) — purging data`)
  await purgeStoreData({ id: store.id, domain: store.domain, userId: store.userId })
}

async function handleShopRedact(store: any) {
  console.log(`Shopify shop/redact for store ${store.domain} (${store.id}) — purging data`)
  await purgeStoreData({ id: store.id, domain: store.domain, userId: store.userId })
}

async function handleCustomerRedact(data: any, store: any, shopDomain: string) {
  // Shopify payload: { shop_id, shop_domain, customer: { id } }. The id may be
  // bare ("12345") or a gid ("gid://shopify/Customer/12345") depending on API
  // version — normalize before matching stored rows.
  const customerId = data?.customer?.id ? String(data.customer.id) : null
  if (!customerId) {
    console.log(`customers/redact from ${shopDomain}: no customer id in payload`)
    return
  }
  const customerIdNorm = normalizeCustomerId(customerId)
  const matchId = customerIdNorm || customerId
  const result = await redactCustomer(shopDomain, matchId)
  await logDataAccess({
    actorType: 'system',
    action: 'delete',
    resourceType: 'customer',
    resourceId: customerId,
    purpose: 'shopify customers/redact request',
    actorId: store.userId,
    metadata: { shopDomain, affected: result.affected },
  })
  console.log(`customers/redact for ${shopDomain} customer ${customerId}: ${result.affected} records removed`)
}

// Shopify asks the app to make a customer's data available to the merchant
// (customers/data_request). The payload carries the customer id AND email.
// Full implementation of the CDP obligation:
//   1. collect every record we hold on that customer,
//   2. persist it as a CustomerDataExport row (merchant can download from
//      /dashboard/data),
//   3. best-effort email the store owner a copy,
//   4. audit-log the access.
// We never return the customer data in the webhook response body (Shopify
// ignores it and it would be logged); the request is acknowledged so Shopify
// does not retry.
async function handleCustomerDataRequest(data: any, store: any, shopDomain: string) {
  const customerId = normalizeCustomerId(data?.customer?.id)
  const email = data?.customer?.email || null

  try {
    const payload = await collectCustomerData({
      storeId: store.id,
      shopifyCustomerId: customerId,
      email,
    })

    const exportRow = await createCustomerDataExport({
      storeId: store.id,
      shopifyCustomerId: customerId,
      email,
      payload,
    })

    const owner = store.userId
      ? await prisma.user.findUnique({ where: { id: store.userId }, select: { email: true } })
      : null
    const delivery = await deliverCustomerDataExportToMerchant({
      storeId: store.id,
      storeDomain: shopDomain,
      ownerEmail: owner?.email || null,
      exportId: exportRow.id,
      shopifyCustomerId: customerId,
      email,
    })

    await logDataAccess({
      actorType: 'system',
      action: 'access',
      resourceType: 'customer_data_export',
      resourceId: exportRow.id,
      purpose: 'shopify customers/data_request',
      actorId: store.userId,
      metadata: {
        shopDomain,
        email: email || null,
        recordsIncluded: (payload as any)?.counts || null,
        deliverySent: delivery.sent,
        deliveryMessage: delivery.sent ? undefined : (delivery.message || null),
      },
    })

    console.log(
      `customers/data_request for ${shopDomain} customer ${customerId || 'unknown'}: export ${exportRow.id} ` +
      `(${JSON.stringify((payload as any)?.counts || {})}) ${delivery.sent ? 'emailed to merchant' : `delivery: ${delivery.message}`}`
    )
  } catch (err) {
    console.error(`customers/data_request processing failed for ${shopDomain}:`, err)
    // Still audit that the request was received even if the export failed —
    // Shopify must not retry forever because we had a transient error.
    await logDataAccess({
      actorType: 'system',
      action: 'access',
      resourceType: 'customer',
      resourceId: customerId || 'unknown',
      purpose: 'shopify customers/data_request (export failed)',
      actorId: store.userId,
      metadata: { shopDomain, email: email || null, error: err instanceof Error ? err.message : String(err) },
    })
  }
}

// ── Billing lifecycle ─────────────────────────────────────────────────
// app_subscriptions/update fires when the merchant approves, declines, or
// cancels the app subscription from their Shopify admin. The payload carries
// the AppSubscription gid + a raw status; we normalize it onto the local
// Subscription row so all existing plan gating keeps working unchanged.
// Idempotent: re-applying the same status is a no-op.
async function handleAppSubscriptionUpdate(data: any, store: any, shopDomain: string) {
  const sub = data?.app_subscription || data
  const gid = sub?.admin_graphql_api_id || data?.admin_graphql_api_id || null
  const rawStatus = sub?.status || data?.status || null

  if (!gid) {
    console.log(`app_subscriptions/update from ${shopDomain}: no subscription id in payload`)
    return
  }

  let local = await prisma.subscription.findFirst({ where: { shopifySubscriptionId: gid } })
  if (!local) {
    // Fall back to this shop owner's most recent Shopify-provider subscription
    // (covers a race where the webhook beats the local pending write).
    local = await prisma.subscription.findFirst({
      where: { userId: store.userId, provider: 'shopify' },
      orderBy: { createdAt: 'desc' },
    })
  }
  if (!local) {
    console.log(`app_subscriptions/update: no local subscription for ${gid} / shop ${shopDomain} — skipping`)
    return
  }

  const normalized = mapShopifyStatus(rawStatus)

  // Cancelled / declined / expired: the merchant is no longer paying through
  // Shopify. Downgrade to free at once so paid quotas and overage can't keep
  // flowing while no one is billed. 'pending' (approved in Shopify admin, not
  // yet from our side) and 'paused' (frozen shop) keep the plan but the bargain
  // gate already treats non-active rows as free as defense-in-depth.
  if (normalized === 'cancelled') {
    await downgradeSubscriptionToFree(local.id)
    console.log(`app_subscriptions/update ${gid} for ${shopDomain}: ${rawStatus} → downgraded to free`)
    return
  }

  await prisma.subscription.update({
    where: { id: local.id },
    data: {
      provider: 'shopify',
      status: normalized,
      shopDomain,
      shopifySubscriptionId: gid,
    },
  })

  // On activation, enrich with the authoritative period end + usage line item
  // so revenue-share charges have a target. Best-effort — status is already set.
  if (normalized === 'active') {
    await reconcileShopifySubscription(store).catch((err) => {
      console.error(`app_subscriptions/update reconcile failed for ${shopDomain}:`, err)
    })
  }

  console.log(`app_subscriptions/update ${gid} for ${shopDomain}: ${rawStatus} → ${normalized}`)
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

// customers/create + customers/update.
//
// This is the only event that carries the customer's real name even when the
// cart was captured before they typed it. It registers the recipient (so the
// dashboard is complete) but NEVER sets WhatsApp consent: Shopify's email/SMS
// marketing flags are not WhatsApp opt-ins, and inferring consent here would
// make every store's list "consented" without the customer ever agreeing.
async function handleCustomerSync(data: any, store: any) {
  const id = data?.id != null ? String(data.id) : null
  const email = data?.email || null
  const phone =
    data?.phone ||
    data?.default_address?.phone ||
    data?.addresses?.find?.((a: any) => a?.phone)?.phone ||
    null
  const name =
    `${data?.first_name || ''} ${data?.last_name || ''}`.trim() ||
    data?.name ||
    null

  const recipient = await upsertRecipient({
    storeId: store.id,
    shopifyCustomerId: id,
    name,
    email,
    phone,
    source: 'shopify_customer',
  })
  if (!recipient) return

  await logDataAccess({
    actorType: 'system',
    action: 'write',
    resourceType: 'customer_identity',
    resourceId: recipient.id,
    purpose: 'shopify customer webhook recipient registry sync',
    actorId: store.userId,
    metadata: {
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      whatsappConsent: false,
    },
  })
}

async function handleCartUpdate(data: any, store: any, domain: string) {
  // Shopify API 2026-04 removed the `id` field from the `checkouts/create` and
  // `checkouts/update` webhook payloads — only `token` remains (see the Shopify
  // changelog "Removed Checkout ID from checkout and order webhooks"). The old
  // guard required BOTH `id` and `token`, so every checkout webhook was dropped
  // before it could be stored. Carts captured from `carts/update` carry no
  // customer contact, so this silently left the recovery pipeline with NO email
  // or phone to send to — the root cause of "no recovery messages". `token` is
  // present on carts/* and checkouts/* alike and is the value we store as cartId.
  if (!data.token) return

  const cart = data
  const customerId = data.customer?.id ? String(data.customer.id) : null
  const customerPhone = extractPhone(cart)
  const customerName = extractName(cart)
  const customerEmail = cart.email || cart.customer?.email || null

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

  const items = normalizeShopifyLineItems(cart.line_items || cart.items)
  const totalValue = resolveCartTotal(cart, items)

  await prisma.cart.upsert({
    where: {
      storeId_cartId: {
        storeId: store.id,
        cartId: cart.token,
      },
    },
    update: {
      items,
      totalValue,
      ...(customerId ? { customerId } : {}),
      ...(customerEmail ? { customerEmail } : {}),
      ...(customerPhone ? { customerPhone } : {}),
      ...(customerName ? { customerName } : {}),
      updatedAt: new Date(),
    },
    create: {
      storeId: store.id,
      cartId: cart.token,
      items,
      totalValue,
      customerId,
      customerEmail,
      customerPhone,
      customerName,
      currency: cart.currency || 'USD',
    },
  })

  // Keep the store-wide recipient registry in step with every captured cart.
  // A failure here must not drop the cart itself.
  await ensureRecipientForCart(store.id, {
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    updatedAt: new Date(),
  }).catch((err) => {
    console.error(`Recipient registry sync failed for cart ${cart.token}:`, err?.message || err)
  })
}

// Some payloads (notably `carts/update`) can omit or zero `total_price` even
// when line items carry prices, which left recovered-cart value metrics at 0.
// Prefer Shopify's total; fall back to summing the line items.
function resolveCartTotal(cart: any, items: any[]): number {
  if (cart.total_price != null && cart.total_price !== '') {
    const parsed = parseFloat(cart.total_price)
    if (!Number.isNaN(parsed)) return parsed
  }
  return items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
}

async function handleCheckout(data: any, store: any, domain: string) {
  await handleCartUpdate(data, store, domain)
}

async function processOrderCreate(data: any, store: any, domain: string) {
  // A Shopify orders/create payload carries BOTH identifiers: `token` is the
  // checkout token (matches carts recorded from checkouts/create — the same
  // value we stored as cartId) and `cart_token` is the cart token (matches
  // carts/update rows). Try the preferred one first, fall back to the other so
  // one logical abandonment is never missed because it arrived via the other
  // webhook family. Only ONE Cart row ever matches a single order.
  // Register the buyer from the order as well. Orders are the highest-value
  // contact source (they include phone/name even when the checkout didn't) and
  // must be in the registry even if no Cart row survives. Consent stays false.
  const orderEmail = data.email || data.customer?.email || null
  const orderPhone =
    data.customer?.phone ||
    data.shipping_address?.phone ||
    data.billing_address?.phone ||
    data.phone ||
    null
  const orderName =
    data.customer?.name ||
    `${data.customer?.first_name || data.shipping_address?.first_name || data.billing_address?.first_name || ''} ${data.customer?.last_name || data.shipping_address?.last_name || data.billing_address?.last_name || ''}`.trim() ||
    null
  await upsertRecipient({
    storeId: store.id,
    shopifyCustomerId: data.customer?.id != null ? String(data.customer.id) : null,
    name: orderName,
    email: orderEmail,
    phone: orderPhone,
    source: 'shopify_order',
  }).catch((err) => {
    console.error(`Recipient registry sync failed for order ${data.id}:`, err?.message || err)
  })

  const preferredToken = data.token || data.cart_token
  const fallbackToken = preferredToken === data.token ? (data.cart_token || null) : (data.token || null)
  let cart = preferredToken
    ? await prisma.cart.findUnique({
        where: { storeId_cartId: { storeId: store.id, cartId: preferredToken } },
      })
    : null
  if (!cart && fallbackToken) {
    cart = await prisma.cart.findUnique({
      where: { storeId_cartId: { storeId: store.id, cartId: fallbackToken } },
    })
  }
  if (!cart) return

  // Backfill the customer id (raw or gid) on orders/create — carts recorded by
  // older webhooks/sync runs may predate the customerId column. Ensures
  // customers/redact can locate every cart even for legacy rows.
  const orderCustomerId = data.customer?.id ? String(data.customer.id) : null
  if (orderCustomerId && !cart.customerId) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { customerId: normalizeCustomerId(orderCustomerId) || orderCustomerId },
    }).catch(() => {})
  }

  await logDataAccess({
    actorType: 'system',
    action: 'read',
    resourceType: 'order',
    resourceId: String(data.id || preferredToken || fallbackToken || ''),
    purpose: 'shopify webhook order attribution',
    actorId: store.userId,
    metadata: {
      shopDomain: domain,
      cartToken: Boolean(preferredToken),
      totalPrice: data.total_price,
    },
  })

  const grossAmount = parseFloat(data.total_price || '0')
  const orderCreatedAt = data.created_at ? new Date(data.created_at) : new Date()
  const shopifyOrderId = data.id ? String(data.id) : undefined

  const discountAmount = parseFloat(data.total_discounts || '0')
  const netAmount = Math.max(0, grossAmount - discountAmount)
  const discountUsed = discountAmount > 0

  // ── AI Salesperson: attribute confirmed bargain orders to the daily goal ──
  // Idempotent per shopifyOrderId; never blocks cart recovery if it fails.
  try {
    await attributeBargainGoal({
      store: { id: store.id, timezone: store.timezone },
      shopifyOrderId: shopifyOrderId ?? '',
      orderAmount: netAmount,
      orderCreatedAt,
      email: data.email ?? null,
      cartToken: data.cart_token ?? null,
      checkoutToken: data.token ?? null,
      appliedCodes: Array.isArray(data.discount_codes)
        ? data.discount_codes.map((dc: any) => (dc && dc.code) || null).filter(Boolean)
        : [],
    })
  } catch (err) {
    console.error('[BARGAIN_GOAL_ATTRIBUTE]', err)
  }

  // ── Bargain purchase attribution ──
  // If the order used a bargain discount code, mark the session purchased,
  // advance the merchant's bargain analytics (count + value) and book the
  // rev-share event exactly once. Independent of cart-recovery attribution —
  // a bargain purchase is credited on its own even with no recovery message.
  try {
    await attributeBargainPurchase({
      store: { id: store.id, userId: store.userId, timezone: store.timezone },
      shopifyOrderId: shopifyOrderId ?? '',
      orderAmount: netAmount,
      orderCreatedAt,
      email: data.email ?? null,
      cartToken: data.cart_token ?? null,
      checkoutToken: data.token ?? null,
      appliedCodes: Array.isArray(data.discount_codes)
        ? data.discount_codes.map((dc: any) => (dc && dc.code) || null).filter(Boolean)
        : [],
    })
  } catch (err) {
    console.error('[BARGAIN_PURCHASE_ATTRIBUTE]', err)
  }

  if (!cart.convertedAt) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { convertedAt: new Date() },
    })
  }

  // A purchase supersedes every queued reminder. Mark pending rows skipped so a
  // sweep that started before this webhook cannot still message the buyer.
  await cancelPendingRecoveryForCart(cart.id, 'purchased').catch((err) => {
    console.error(`Could not cancel pending recovery for purchased cart ${cart.id}:`, err?.message || err)
  })

  const windowStart = new Date(orderCreatedAt.getTime() - ATTRIBUTION_WINDOW_HOURS * 60 * 60 * 1000)
  const attributingMessage = await prisma.message.findFirst({
    where: {
      cartId: cart.id,
      status: { in: ['sent', 'delivered'] as const },
      // Query a superset window; the canonical eligibility predicate then makes
      // the final call so the rule lives in ONE place (see attribution.ts).
      sentAt: { lte: orderCreatedAt, gte: windowStart },
    },
    orderBy: { sentAt: 'desc' },
  })

  // Canonical attribution gate — same rules as src/lib/attribution.ts.
  if (!attributingMessage || !isMessageAttributable({
    messageStatus: attributingMessage.status,
    sentAt: attributingMessage.sentAt,
    orderCreatedAt,
  })) {
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
      // Recognized revenue = what the merchant actually collects (net of all
      // order discounts), not the gross order total (tax/shipping excluded).
      revenueRecovered: { increment: netAmount },
    },
    create: {
      userId: store.userId,
      date: today,
      cartsRecovered: 1,
      revenueRecovered: netAmount,
    },
  })

  await track({
    name: 'cartgain_cart_recovered',
    userId: store.userId,
    storeId: store.id,
    properties: {
      channel,
      grossAmount,
      netAmount,
      discountUsed,
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

// ── Refund / cancellation netting ───────────────────────────────────────────
// A recovery that is later refunded or cancelled is NOT recognized revenue:
// reporting must never permanently claim it. Recognized revenue is defined as
//
//   recognizedNet = max(0, netRevenue − cumulativeRefunded)
//
// where cumulativeRefunded is the gross amount returned to the customer
// (cumulative across refunds/create webhooks and full on orders/cancelled).
// References: Day 8–10 revenue-engine adversarial testing, findings E3.
async function applyRefundToRecoveredCart(store: any, shopifyOrderId: string, refundAmount: number, reason: 'refund' | 'cancelled') {
  // Store-scoped lookup: Shopify order ids are per-shop sequences, so a global
  // lookup let store B's refund net store A's recovered revenue.
  const recovered = await prisma.recoveredCart.findFirst({
    where: { storeId: store.id, shopifyOrderId },
    include: { revenueShareEvent: true },
  })
  if (!recovered) return

  const { newTotalRefunded, deltaRefunded, recognizedNet, fullyRefunded, analyticsRevenueDelta, analyticsCartsDelta } =
    computeRefundNetting({
      recoveredValue: recovered.recoveredValue || 0,
      netRevenue: recovered.netRevenue || 0,
      prevTotalRefunded: recovered.totalRefunded || 0,
      refundAmount,
      reason,
    })

  if (deltaRefunded <= 0) {
    console.log(`Refund webhook for order ${shopifyOrderId}: nothing new to net (already netted)`)
    return
  }

  const today = new Date(new Date().toDateString())

  // Revenue-share reversal — only when the event has NOT been invoiced yet.
  // Invoiced events are frozen (billing has already run); those surface as an
  // ops alert instead of silently mutating closed books.
  let revShareDelta = 0
  const event = recovered.revenueShareEvent
  if (event && !fullyInvoiced(event)) {
    const pct = event.revSharePercent || 0
    const newAmount = (recognizedNet * pct) / 100
    revShareDelta = Math.max(0, (event.revShareAmount || 0) - newAmount)
  } else if (event && fullyInvoiced(event) && deltaRefunded > 0) {
    await sendAlertOnError(
      `Refund for invoiced revenue share — order ${shopifyOrderId}`,
      new Error(`RecoveredCart ${recovered.id} refunded ₹${deltaRefunded} but its revenue share event is already invoiced (invoiceId=${event.invoiceId}). Needs manual billing reconciliation.`),
      { storeDomain: store.domain, orderId: shopifyOrderId }
    ).catch(() => {})
  }

  await prisma.$transaction(async (tx) => {
    await tx.recoveredCart.update({
      where: { id: recovered.id },
      data: {
        netRevenue: recognizedNet,
        totalRefunded: newTotalRefunded,
        refundStatus: fullyRefunded ? 'fully_refunded' : 'partially_refunded',
      },
    })
    if (event && revShareDelta > 0) {
      await tx.revenueShareEvent.update({
        where: { id: event.id },
        data: {
          netAmount: recognizedNet,
          revShareAmount: (recognizedNet * (event.revSharePercent || 0)) / 100,
        },
      })
      await tx.subscription.update({
        where: { id: event.subscriptionId },
        data: { revenueShareAccrued: { decrement: revShareDelta } },
      })
    }
    if (analyticsRevenueDelta > 0) {
      const dbDate = today
      const row = await tx.analytics.findUnique({
        where: { userId_date: { userId: store.userId, date: dbDate } },
      })
      if (row) {
        const nextRevenue = Math.max(0, (row.revenueRecovered || 0) - analyticsRevenueDelta)
        const nextCarts = fullyRefunded
          ? Math.max(0, (row.cartsRecovered || 0) + analyticsCartsDelta)
          : (row.cartsRecovered || 0)
        await tx.analytics.update({
          where: { userId_date: { userId: store.userId, date: dbDate } },
          data: { revenueRecovered: nextRevenue, cartsRecovered: nextCarts },
        })
      }
    }
  })

  console.log(
    `Refund netted: order ${shopifyOrderId} ${reason} — ${fullyRefunded ? 'fully' : 'partially'} ` +
    `(refunded ${newTotalRefunded.toFixed(2)} of ${(recovered.recoveredValue || 0).toFixed(2)}, recognized revenue now ${recognizedNet.toFixed(2)}, revShare reversed ₹${revShareDelta.toFixed(2)})`
  )
}

function fullyInvoiced(event: any): boolean {
  return Boolean(event?.invoiceId)
}

async function handleOrderCancelled(data: any, store: any, domain: string) {
  const orderId = data.id ? String(data.id) : data.order_id ? String(data.order_id) : null
  if (!orderId) {
    console.log(`orders/cancelled from ${domain}: no order id`)
    return
  }
  await applyRefundToRecoveredCart(store, orderId, 0, 'cancelled')
  await netBargainGoalRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount: 0,
    fullyRefunded: true,
  })
  await netBargainPurchaseRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount: 0,
    fullyRefunded: true,
    refundId: 'cancelled',
  }).catch((err) => console.error('[BARGAIN_PURCHASE_REFUND]', err))
  await recordLearningRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount: 0,
    fullyRefunded: true,
    refundId: 'cancelled',
  })
}

async function handleRefundCreate(data: any, store: any, domain: string) {
  const orderId = data.order_id ? String(data.order_id) : data.id ? String(data.id) : null
  if (!orderId) {
    console.log(`refunds/create from ${domain}: no order id`)
    return
  }
  const transactions = Array.isArray(data.refund?.transactions) ? data.refund.transactions : Array.isArray(data.transactions) ? data.transactions : []
  let refundAmount = 0
  for (const t of transactions) {
    if (t.status === 'success') {
      refundAmount += parseFloat(t.amount || '0')
    }
  }
  // Some payloads nest the amount on the refund head itself.
  if (refundAmount === 0 && data.refund?.amount) {
    refundAmount = parseFloat(data.refund.amount || '0')
  }
  if (refundAmount <= 0) {
    console.log(`refunds/create from ${domain}: no successful refund amount for order ${orderId}`)
    return
  }
  await applyRefundToRecoveredCart(store, orderId, refundAmount, 'refund')
  await netBargainGoalRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount,
    fullyRefunded: false,
  })
  await netBargainPurchaseRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount,
    fullyRefunded: false,
    refundId: data.id ? String(data.id) : null,
  }).catch((err) => console.error('[BARGAIN_PURCHASE_REFUND]', err))
  await recordLearningRefund({
    storeId: store.id,
    shopifyOrderId: orderId,
    refundAmount,
    fullyRefunded: false,
    refundId: data.id ? String(data.id) : null,
  })
}

async function accrueRevenueShare(params: AccrueParams) {
  const { userId, cartId, storeId, shopifyOrderId, grossAmount, discountAmount, netAmount, channel, attributedMessageId, recoveredAt } = params

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'active' },
  })
  if (!subscription) return

  const planConfig = getPlan(subscription.plan)
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
