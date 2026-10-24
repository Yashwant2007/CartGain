import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { computeMinPrice } from '@/lib/services/bargain'
import { fetchShopifyProductPrice, fetchShopifyProductDetail } from '@/lib/shopify'
import { buildExecutablePrice, clampOrderPercentForProduct } from '@/lib/financial-safety'
import { validateOffer } from '@/lib/bargain/offer-validation'
import { bargainCampaignStatus } from '@/lib/bargain/policy'
import { getBargainGate, decideDealMode, recordBargainDealOps, BARGAIN_DEALS_EXHAUSTED } from '@/lib/bargain/gate'
import { track } from '@/lib/analytics/track'
import { redisIncr, redisExpire } from '@/lib/redis'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { normalizeShopDomain, shopDomainCandidates } from '@/lib/stores/resolve-by-domain'

export const dynamic = 'force-dynamic'

// Public (storefront + checkout) tier — cap how many discount codes each shop
// can mint per hour to prevent spam, while staying generous for real traffic.
const MAX_CODES_PER_SHOP_HOUR = 250
const CODE_WINDOW_SECONDS = 60 * 60

// Accepts a raw numeric Shopify customer id or a `gid://shopify/Customer/<id>`
// and returns it in the raw-numeric form `buildCustomerSelection` expects, or
// null for anything else. Strict allow-list keeps client input out of the
// GraphQL body shape.
function normalizeShopifyCustomerId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(?:gid:\/\/shopify\/Customer\/)?(\d{1,20})$/)
  return m ? m[1] : null
}

async function underCodeBudget(shopKey: string): Promise<boolean> {
  try {
    const count = await redisIncr(`bargain:codes:${shopKey}`)
    if (count === 1) {
      await redisExpire(`bargain:codes:${shopKey}`, CODE_WINDOW_SECONDS * 1000)
    }
    return count <= MAX_CODES_PER_SHOP_HOUR
  } catch {
    return true
  }
}

// Checkout UI extensions run on https://checkout.shopify.com — allow those
// cross-origin requests (plus the storefront admin/preview origins).
const ALLOWED_ORIGINS = [
  'https://checkout.shopify.com',
  'https://cart-gain.com',
  /^https:\/\/[a-z0-9-]+\.myshopify\.com$/,
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some(
    (o) => o === origin || (o instanceof RegExp && o.test(origin))
  )
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) })
}

// POST /api/bargain/checkout-accept — called from Checkout UI Extension when bargain accepted
export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'))
  try {
    // Per-IP throttle. This endpoint mints codes from client-supplied prices and
    // returns a distinguishable below-floor rejection, so unbounded probing
    // could binary-search the merchant floor. The per-shop code budget (below)
    // does not cover rejections; this does.
    const rate = await checkSimpleRateLimit(`bargain_checkout_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const { shopDomain, shopifyProductId, variantId, originalPrice, finalPrice, discountPercent, code, orderLevel, bulkQuantity, shopifyCustomerId, customerEmail } = body

    if (
      typeof shopDomain !== 'string' || !shopDomain ||
      typeof code !== 'string' || !code || code.length > 100 ||
      !originalPrice || !finalPrice
    ) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400, headers })
    }

    // Buyer binding: the Checkout UI Extension forwards the logged-in customer
    // id/email when it has protected-customer-data access. The id is strictly
    // validated (numeric or gid) before it reaches the Shopify discount, so it
    // can only ever bind a code to a real customer — never inject GraphQL.
    const normalizedCustomerId = normalizeShopifyCustomerId(shopifyCustomerId)
    const safeCustomerEmail =
      typeof customerEmail === 'string' && customerEmail.length <= 254 && customerEmail.includes('@')
        ? customerEmail
        : null

    // Find the store by its Shopify domain. Domain is not proof of ownership
    // (signup can park an unconnected row on any domain), so the lookup requires
    // a real OAuth connection and matches both the permanent domain and the bare
    // legacy handle.
    const cleanDomain = normalizeShopDomain(shopDomain)
    const domainCandidates = shopDomainCandidates(cleanDomain)
    const matches = await Promise.all(
      domainCandidates.map((domain) =>
        prisma.store.findFirst({
          where: {
            domain: { equals: domain, mode: 'insensitive' },
            platform: 'shopify',
            apiKey: { not: null },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ),
    )
    const store = matches.find((s) => s !== null) ?? null

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404, headers })
    }

    const withinBudget = await underCodeBudget(cleanDomain)
    if (!withinBudget) {
      return NextResponse.json(
        { message: 'Too many codes generated for this store recently. Try again later.' },
        { status: 429, headers }
      )
    }

    const rawBulk = bulkQuantity != null ? Math.floor(Number(bulkQuantity)) : null
    const safeBulk = rawBulk != null && Number.isFinite(rawBulk) && rawBulk >= 1 ? rawBulk : null

    // ── IDEMPOTENT REPLAY ──
    // The client can retry with the SAME code (flaky network / double tap). A
    // retried request must never mint a second Shopify code (Shopify would reject
    // the duplicate and surface a 500) or double-meter the deal.
    const existing = await prisma.bargainSession.findFirst({
      where: { storeId: store.id, discountCode: code, status: 'accepted' },
      select: { discountCode: true },
    })
    if (existing?.discountCode) {
      return NextResponse.json({ success: true, code: existing.discountCode, status: 'created' }, { headers })
    }

    // ── FINANCIAL SAFETY ──
    // This endpoint mints codes purely from client-supplied values (the Checkout
    // UI Extension cannot carry a bargain session), so the merchant floor must be
    // enforced HERE, mathematically, from the AUTHORITATIVE current Shopify price.
    // 1) Re-fetch the price; reject when the client price drifted noticeably.
    const currentPrice =
      (await fetchShopifyProductPrice(store, shopifyProductId, variantId || null)) ?? null
    if (currentPrice == null) {
      return NextResponse.json({ message: 'Could not verify current product price' }, { status: 503, headers })
    }
    const ratio = originalPrice / currentPrice
    if (ratio < 0.995 || ratio > 1.005) {
      return NextResponse.json({ message: 'Price mismatch — product price has changed' }, { status: 409, headers })
    }

    // 2) Floor derived server-side from the merchant's own config/product overrides.
    const { minPrice } = await computeMinPrice({
      storeId: store.id,
      shopifyProductId,
      originalPrice: currentPrice,
      bulkQuantity: safeBulk ?? undefined,
    })

    // 2b) Live availability + machine reason codes. Only an explicit false from
    // Shopify blocks (null = unverifiable = don't block).
    const currentDetail = await fetchShopifyProductDetail(store, shopifyProductId)
    const effectiveVariantId = variantId?.replace(/^gid:\/\/shopify\/ProductVariant\//, '')
    const variantAvailable = !currentDetail || !effectiveVariantId
      ? null
      : currentDetail.variants?.find(v => v.id === effectiveVariantId)?.available ?? null
    const productAvailable = !currentDetail ? null : currentDetail.status === 'active' || currentDetail.status == null
    // §25 Campaign lifecycle: a checkout-stage code must not be minted once the
    // campaign window closed. Fails closed (blocks) only when the window is
    // configured AND outside it — no window means always active.
    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: store.id },
      select: { campaignStart: true, campaignEnd: true },
    })
    const campaignActive = bargainCampaignStatus(config, new Date()) === 'active'

    const validation = validateOffer({
      requestedPrice: Number(finalPrice),
      originalPrice: currentPrice,
      floorPrice: minPrice,
      variantAvailable,
      productAvailable,
      campaignActive,
    })
    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.message ?? 'Cannot accept this purchase right now.', reason: validation.reason, code: `OFFER_REJECTED_${validation.reason}` },
        { status: 409, headers }
      )
    }

    let calculatedPercent: number
    let finalPriceSafe: number
    if (orderLevel) {
      // An order-level percentage discounts the WHOLE basket (unrelated items
      // too), so clamp its depth to the featured product's margin floor. This is
      // what keeps a "₹1 finalPrice" attack from converting into 99%-off-everything.
      const clientPercent = discountPercent != null
        ? Number(discountPercent)
        : 100 - (Number(finalPrice) / currentPrice) * 100
      const clamped = clampOrderPercentForProduct({
        originalPrice: currentPrice,
        floorPrice: minPrice,
        requestedPercent: clientPercent,
      })
      if (!clamped.ok) {
        return NextResponse.json(
          { message: 'That discount is beyond what I can offer — please choose a smaller one.' },
          { status: 409, headers }
        )
      }
      calculatedPercent = clamped.percent
      finalPriceSafe = currentPrice * (1 - clamped.percent / 100)
    } else {
      const executable = buildExecutablePrice({
        originalPrice: currentPrice,
        finalPrice: Number(finalPrice),
        floorPrice: minPrice,
        bulkQuantity: safeBulk,
      })
      if (!executable.ok) {
        return NextResponse.json(
          { message: 'Price mismatch — please refresh the page and renegotiate.' },
          { status: 409, headers }
        )
      }
      calculatedPercent = executable.discountPercent
      finalPriceSafe = executable.finalPrice
    }

    // ── PLAN GATE ──
    // Deals are the metered/billed unit. Gate BEFORE minting so a store over its
    // deal quota (and without overage) can never mint an unmetered code here —
    // the exact leak the storefront accept path already closes.
    const gate = await getBargainGate(store.id)
    const dealMode = decideDealMode(gate)
    if (dealMode === 'blocked_free' || dealMode === 'blocked_no_overage') {
      return NextResponse.json({
        message:
          dealMode === 'blocked_free'
            ? 'This store has reached its free bargain deal limit. Please ask the store to upgrade.'
            : 'This store has reached its bargain deal limit. Please ask the store to upgrade or contact you directly.',
        code: BARGAIN_DEALS_EXHAUSTED,
        planId: gate.planId,
        mode: dealMode,
        upgradeUrl: 'https://cart-gain.com/pricing',
      }, { status: 402, headers })
    }

    // Generate the discount code in Shopify
    const result = await generateBargainDiscountCode({
      store,
      shopifyProductId: orderLevel ? null : shopifyProductId,
      variantId: orderLevel ? null : variantId || null,
      originalPrice: currentPrice,
      finalPrice: finalPriceSafe,
      discountPercent: calculatedPercent,
      code,
      bulkQuantity: safeBulk,
      floorPrice: minPrice,
      shopifyCustomerId: normalizedCustomerId,
    })

    if (result.status === 'failed') {
      return NextResponse.json({ message: result.error || 'Failed to create discount code' }, { status: 500, headers })
    }

    // ── RECORD THE DEAL ──
    // Create a BargainSession for this checkout-origin negotiation and meter the
    // deal exactly like /api/bargain/accept: bump the plan meters, accrue rev
    // share, and book the session-scoped rev-share event. Storing the issued code
    // on the session lets orders/create attribute the purchase back to it (the
    // code must actually appear on the order, so attribution cannot be faked).
    // Atomic: the session row and its meter/rev-share ops commit together.
    const sessionId = crypto.randomUUID()
    await prisma.$transaction([
      prisma.bargainSession.create({
        data: {
          id: sessionId,
          storeId: store.id,
          shopifyProductId: orderLevel ? '' : (shopifyProductId ?? ''),
          variantId: orderLevel ? null : (variantId || null),
          originalPrice: currentPrice,
          currentOffer: finalPriceSafe,
          finalPrice: finalPriceSafe,
          bargainFloor: minPrice,
          bulkQuantity: safeBulk,
          discountCode: result.code,
          customerEmail: safeCustomerEmail,
          status: 'accepted',
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
      ...recordBargainDealOps(gate, sessionId, currentPrice, finalPriceSafe, dealMode as 'included' | 'overage'),
    ])

    // §36 funnel analytics — checkout-stage deal accepted (mini-cart/embedded
    // apps accept earlier via /api/bargain/accept; this event covers storefront
    // checkout origins). Fire-and-forget.
    await track({
      name: 'cartgain_checkout_started',
      storeId: store.id,
      properties: { orderLevel: orderLevel === true },
    })
    await track({
      name: 'cartgain_bargain_deal_accepted',
      storeId: store.id,
      properties: { source: 'checkout', orderLevel: orderLevel === true, dealMode },
    })

    return NextResponse.json({
      success: true,
      code: result.code,
      status: result.status,
    }, { headers })
  } catch (error) {
    console.error('[BARGAIN_CHECKOUT_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500, headers })
  }
}