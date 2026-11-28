import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { buildBargainCartCheckoutUrl, buildBargainCheckoutUrl, generateBargainCode } from '@/lib/bargain/purchase'
import { computeMinPrice } from '@/lib/services/bargain'
import { fetchShopifyProductPrice, fetchShopifyProductDetail } from '@/lib/shopify'
import { buildExecutablePrice } from '@/lib/financial-safety'
import { publicOfferRejection, validateOffer } from '@/lib/bargain/offer-validation'
import { bargainCampaignStatus } from '@/lib/bargain/policy'
import { getBargainGate, decideDealMode, recordBargainDealOps, BARGAIN_DEALS_EXHAUSTED } from '@/lib/bargain/gate'
import { track } from '@/lib/analytics/track'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import {
  checkoutBuyerFromBody,
  checkoutOriginCorsHeaders,
  checkoutPlatform,
  resolveCheckoutStore,
} from '@/lib/bargain/checkout-origin'
import {
  loadQuoteByToken,
  markQuoteCheckoutPending,
  quoteBindingMatches,
  quoteMatchesDeal,
  revalidateQuote,
} from '@/lib/bargain/quote'
import { checkoutAcceptedMessage } from '@/lib/bargain/post-deal'
import { enginePersonaFor } from '@/lib/bargain/experience/personality'
import { publishedPersonality } from '@/lib/bargain/experience/config'
import { CHECKOUT_ACCEPT_RATE_KEY } from '@/lib/bargain/checkout-lock'
import {
  bargainPlatformFor,
  buildWooCommerceCheckoutUrl,
  createOrReuseWooCommerceCoupon,
  getWooCommerceProductFacts,
  resolveActiveWooCommerceStore,
} from '@/lib/woocommerce/bargain-adapter'

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: checkoutOriginCorsHeaders(request.headers.get('origin')),
  })
}

// POST /api/bargain/checkout-accept — called from Checkout UI Extension when bargain accepted
export async function POST(request: NextRequest) {
  const headers = checkoutOriginCorsHeaders(request.headers.get('origin'))
  try {
    // Per-IP throttle. This endpoint mints codes from client-supplied prices and
    // returns a distinguishable below-floor rejection, so unbounded probing
    // could binary-search the merchant floor. The per-shop code budget (below)
    // does not cover rejections; this does.
    const rate = await checkSimpleRateLimit(`${CHECKOUT_ACCEPT_RATE_KEY}${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const { shopDomain, shopifyProductId, variantId, originalPrice, finalPrice, code, bulkQuantity, quoteToken } = body
    const platform = checkoutPlatform(body)
    const domainValue = shopDomain ?? body?.domain ?? body?.storeDomain
    const productId = body?.productId ?? body?.platformProductId ?? shopifyProductId
    // Signed quotes are mandatory for every checkout-origin Shopify deal, not
    // just when the dashboard quote flag is on. The flag only controls the
    // optional storefront quote mirror; checkout code minting must always prove
    // a server-authorised deal.
    const quotesRequired = platform === 'shopify'

    if (
      (platform === 'shopify' && (typeof shopDomain !== 'string' || !shopDomain)) ||
      (platform === 'woocommerce' && typeof domainValue !== 'string' && typeof body?.storeId !== 'string') ||
      (platform === 'woocommerce' && !productId) ||
      (code != null && (typeof code !== 'string' || code.length > 100)) ||
      (platform === 'woocommerce' && (!originalPrice || !finalPrice))
    ) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400, headers })
    }
    if (body?.orderLevel === true) {
      return NextResponse.json({ message: 'Whole-cart discounts are not supported' }, { status: 400, headers })
    }
    if (quotesRequired && typeof quoteToken !== 'string' && typeof code === 'string') {
      return NextResponse.json({ message: 'Quote token required' }, { status: 400, headers })
    }

    const buyer = checkoutBuyerFromBody(body)
    const normalizedCustomerId = buyer.shopifyCustomerId
    const safeCustomerEmail = buyer.customerEmail

    // Find the store by its Shopify domain. Domain is not proof of ownership
    // (signup can park an unconnected row on any domain), so the lookup requires
    // a real OAuth connection and matches both the permanent domain and the bare
    // legacy handle.
    const store = await resolveCheckoutStore(platform, body)

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404, headers })
    }

    const budget = await checkSimpleRateLimit(`bargain_codes_${store.id}`, {
      maxRequests: 250,
      windowMs: 60 * 60 * 1000,
    })
    if (!budget.allowed) {
      return NextResponse.json(
        { message: 'Too many codes generated for this store recently. Try again later.' },
        { status: 429, headers: { ...headers, 'Retry-After': String(budget.retryAfter) } }
      )
    }

    const rawBulk = bulkQuantity != null ? Math.floor(Number(bulkQuantity)) : null
    const safeBulk = rawBulk != null && Number.isFinite(rawBulk) && rawBulk >= 1 ? rawBulk : null

    // Codes are server-issued. A client may echo a previously returned code to
    // retry safely, but it can never invent one and show it as a real code.
    let issuedCode = typeof code === 'string' && code.trim() ? code.trim() : generateBargainCode()

    const preloadedQuote = typeof quoteToken === 'string' && quoteToken
      ? await loadQuoteByToken(quoteToken)
      : null
    const cartQuoteConditions = preloadedQuote?.conditions && typeof preloadedQuote.conditions === 'object' && !Array.isArray(preloadedQuote.conditions)
      ? (preloadedQuote.conditions as Record<string, unknown>)
      : null
    if (cartQuoteConditions?.kind === 'cart_offer') {
      const cartQuote = preloadedQuote!
      if (cartQuote.storeId !== store.id) {
        return NextResponse.json({ message: 'Quote does not belong to this store' }, { status: 409, headers })
      }
      if (cartQuote.status !== 'ACCEPTED' && cartQuote.status !== 'CHECKOUT_PENDING') {
        return NextResponse.json({ message: 'Quote is not ready for checkout' }, { status: 409, headers })
      }
      if (!quoteBindingMatches(cartQuote, {
        cartToken: buyer.cartToken,
        customerFingerprint: buyer.customerFingerprint,
        customerEmail: buyer.customerEmail,
        shopifyCustomerId: buyer.shopifyCustomerId,
      })) {
        return NextResponse.json({ message: 'Quote was issued for a different checkout' }, { status: 403, headers })
      }
      if (!cartQuote.discountCode) {
        return NextResponse.json({ message: 'Cart quote has no authorised discount code' }, { status: 409, headers })
      }
      if (code && code !== cartQuote.discountCode) {
        return NextResponse.json({ message: 'Quote code mismatch' }, { status: 409, headers })
      }
      const pending = await markQuoteCheckoutPending(cartQuote)
      if (!pending && cartQuote.status !== 'CHECKOUT_PENDING') {
        return NextResponse.json({ message: 'Quote could not be claimed for checkout' }, { status: 409, headers })
      }
      const cartSession = cartQuote.sessionId
        ? await prisma.bargainSession.findFirst({
            where: { id: cartQuote.sessionId, storeId: store.id },
            select: { discountCode: true, purchaseUrl: true },
          })
        : null
      return NextResponse.json({
        success: true,
        code: cartQuote.discountCode,
        status: 'created',
        platform,
        scope: 'cart',
        purchaseUrl: cartSession?.purchaseUrl ?? buildBargainCartCheckoutUrl({
          domain: store.domain,
          code: cartQuote.discountCode,
          cartToken: buyer.cartToken,
        }),
      }, { headers })
    }

    const wooFacts = platform === 'woocommerce'
      ? await getWooCommerceProductFacts({
          store,
          productId: String(productId),
          variantId,
          fallbackPrice: Number(originalPrice),
        })
      : null
    const currentPrice = platform === 'woocommerce'
      ? wooFacts?.price ?? null
      : (await fetchShopifyProductPrice(store, shopifyProductId, variantId || null)) ?? null
    if (currentPrice == null) {
      return NextResponse.json({ message: 'Could not verify current product price' }, { status: 503, headers })
    }
    const ratio = originalPrice / currentPrice
    if (ratio < 0.995 || ratio > 1.005) {
      return NextResponse.json({ message: 'Price mismatch — product price has changed' }, { status: 409, headers })
    }

    const { minPrice } = await computeMinPrice({
      storeId: store.id,
      shopifyProductId: String(productId ?? shopifyProductId ?? ''),
      originalPrice: currentPrice,
      bulkQuantity: safeBulk ?? undefined,
      platform,
      platformProductId: platform === 'woocommerce' ? String(productId) : null,
    })

    let authorisedQuote: any = null
    let agreedPrice = Number(finalPrice)
    if (quotesRequired) {
      if (typeof quoteToken !== 'string' || !quoteToken) {
        return NextResponse.json({ message: 'Quote token required' }, { status: 400, headers })
      }
      const quote = preloadedQuote
      if (!quote) {
        return NextResponse.json({ message: 'Quote is no longer valid' }, { status: 409, headers })
      }
      if (quote.storeId !== store.id) {
        return NextResponse.json({ message: 'Quote does not belong to this store' }, { status: 409, headers })
      }
      if (quote.status !== 'ACCEPTED' && quote.status !== 'CHECKOUT_PENDING') {
        return NextResponse.json({ message: 'Quote is not ready for checkout' }, { status: 409, headers })
      }
      if (!quoteMatchesDeal(quote, {
        storeId: store.id,
        productId: productId ?? shopifyProductId,
        variantId,
        finalPrice: Number(finalPrice),
        quantity: safeBulk ?? 1,
        discountCode: code,
      })) {
        return NextResponse.json({ message: 'Quote does not match this checkout' }, { status: 409, headers })
      }
      if (!quoteBindingMatches(quote, {
        cartToken: buyer.cartToken,
        customerFingerprint: buyer.customerFingerprint,
        customerEmail: buyer.customerEmail,
        shopifyCustomerId: buyer.shopifyCustomerId,
      })) {
        return NextResponse.json({ message: 'Quote was issued for a different checkout' }, { status: 403, headers })
      }
      agreedPrice = Number(quote.finalPrice)
      if (quote.discountCode) {
        if (code && code !== quote.discountCode) {
          return NextResponse.json({ message: 'Quote code mismatch' }, { status: 409, headers })
        }
        issuedCode = quote.discountCode
      }
      const verdict = revalidateQuote(quote, { price: currentPrice, floor: minPrice })
      if (!verdict.ok) {
        return NextResponse.json(
          { message: 'This deal has expired or changed — please renegotiate.', reason: verdict.reason, code: `QUOTE_REJECTED_${verdict.reason}` },
          { status: 409, headers },
        )
      }
      const pending = await markQuoteCheckoutPending(quote)
      if (!pending && quote.status !== 'CHECKOUT_PENDING') {
        return NextResponse.json({ message: 'Quote could not be claimed for checkout' }, { status: 409, headers })
      }
      authorisedQuote = quote
    } else if (typeof quoteToken === 'string' && quoteToken) {
      const quote = preloadedQuote
      if (quote) {
        if (quote.storeId !== store.id) {
          return NextResponse.json({ message: 'Quote does not belong to this store' }, { status: 409, headers })
        }
        if (quote.discountCode) {
          if (issuedCode !== quote.discountCode && code) {
            return NextResponse.json({ message: 'Quote code mismatch' }, { status: 409, headers })
          }
          issuedCode = quote.discountCode
        }
        const verdict = revalidateQuote(quote, { price: currentPrice, floor: minPrice })
        if (!verdict.ok) {
          return NextResponse.json(
            { message: 'This deal has expired or changed — please renegotiate.', reason: verdict.reason, code: `QUOTE_REJECTED_${verdict.reason}` },
            { status: 409, headers },
          )
        }
        await markQuoteCheckoutPending(quote)
      }
    }

    // ── IDEMPOTENT REPLAY ──
    // The client can retry with the SAME code (flaky network / double tap). A
    // retried request must never mint a second Shopify code (Shopify would reject
    // the duplicate and surface a 500) or double-meter the deal.
    const existing = await prisma.bargainSession.findFirst({
      where: { storeId: store.id, discountCode: issuedCode, status: 'accepted' },
      select: { discountCode: true },
    })
    if (existing?.discountCode) {
      return NextResponse.json({
        success: true,
        code: existing.discountCode,
        status: 'created',
        platform,
        ...(platform === 'woocommerce'
          ? { purchaseUrl: buildWooCommerceCheckoutUrl({ domain: store.domain, code: existing.discountCode }) }
          : {}),
      }, { headers })
    }

    // 2b) Live availability + machine reason codes. Only an explicit false from
    // Shopify blocks (null = unverifiable = don't block).
    let variantAvailable: boolean | null = null
    let productAvailable: boolean | null = null
    if (platform === 'woocommerce') {
      variantAvailable = wooFacts?.available ?? null
      productAvailable = wooFacts
        ? wooFacts.status == null || ['active', 'publish', 'published'].includes(wooFacts.status.toLowerCase())
        : null
    } else {
      const currentDetail = await fetchShopifyProductDetail(store, shopifyProductId)
      const effectiveVariantId = variantId?.replace(/^gid:\/\/shopify\/ProductVariant\//, '')
      variantAvailable = !currentDetail || !effectiveVariantId
        ? null
        : currentDetail.variants?.find(v => v.id === effectiveVariantId)?.available ?? null
      productAvailable = !currentDetail ? null : currentDetail.status === 'active' || currentDetail.status == null
    }
    // §25 Campaign lifecycle: a checkout-stage code must not be minted once the
    // campaign window closed. Fails closed (blocks) only when the window is
    // configured AND outside it — no window means always active.
    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: store.id },
      select: { enabled: true, campaignStart: true, campaignEnd: true, emergencyPaused: true },
    })
    if (config?.enabled === false) {
      return NextResponse.json({ message: 'Bargaining disabled' }, { status: 403, headers })
    }
    const campaignActive = bargainCampaignStatus(config, new Date()) === 'active'

    const validation = validateOffer({
      requestedPrice: agreedPrice,
      originalPrice: currentPrice,
      floorPrice: minPrice,
      variantAvailable,
      productAvailable,
      campaignActive,
      emergencyPaused: config?.emergencyPaused === true,
    })
    if (!validation.ok) {
      return NextResponse.json(publicOfferRejection(validation), { status: 409, headers })
    }

    const executable = buildExecutablePrice({
      originalPrice: currentPrice,
      finalPrice: agreedPrice,
      floorPrice: minPrice,
      bulkQuantity: safeBulk,
    })
    if (!executable.ok) {
      return NextResponse.json(
        { message: 'Price mismatch — please refresh the page and renegotiate.' },
        { status: 409, headers }
      )
    }
    const calculatedPercent = executable.discountPercent
    const finalPriceSafe = executable.finalPrice

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

    let result: { code: string; status: 'created' | 'pending' | 'failed'; error?: string }
    let purchaseUrl: string | null = null
    if (platform === 'woocommerce') {
      const coupon = await createOrReuseWooCommerceCoupon({
        store,
        code: issuedCode,
        value: calculatedPercent,
        type: 'percentage',
        minimumSubtotal: currentPrice,
        productIds: [String(productId)],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        description: `CartGain bargain ${issuedCode}`,
      })
      if (!coupon) {
        return NextResponse.json({ message: 'Failed to create WooCommerce coupon' }, { status: 500, headers })
      }
      result = { code: coupon.code, status: 'created' }
      purchaseUrl = coupon.purchaseUrl
    } else {
      result = await generateBargainDiscountCode({
        store,
        shopifyProductId,
        variantId: variantId || null,
        originalPrice: currentPrice,
        finalPrice: finalPriceSafe,
        discountPercent: calculatedPercent,
        code: issuedCode,
        bulkQuantity: safeBulk,
        floorPrice: minPrice,
        shopifyCustomerId: normalizedCustomerId,
      })
      purchaseUrl = buildBargainCheckoutUrl({
        domain: store.domain,
        code: result.code,
        variantId: variantId || null,
        quantity: safeBulk,
      })
    }

    if (result.status !== 'created') {
      return NextResponse.json({
        message: result.status === 'pending'
          ? 'This store is not connected to Shopify yet. Please try again shortly.'
          : result.error || 'Failed to create discount code',
      }, { status: result.status === 'pending' ? 503 : 500, headers })
    }

    if (platform === 'woocommerce' && !purchaseUrl) {
      purchaseUrl = buildWooCommerceCheckoutUrl({
        domain: store.domain,
        code: result.code,
        productId: String(productId),
        variantId: variantId ?? null,
      })
    }

    // ── RECORD THE DEAL ──
    // Create a BargainSession for this checkout-origin negotiation and meter the
    // deal exactly like /api/bargain/accept: bump the plan meters, accrue rev
    // share, and book the session-scoped rev-share event. Storing the issued code
    // on the session lets orders/create attribute the purchase back to it (the
    // code must actually appear on the order, so attribution cannot be faked).
    // Atomic: the session row and its meter/rev-share ops commit together.
    const sessionId = authorisedQuote?.sessionId || crypto.randomUUID()
    await prisma.$transaction([
      prisma.bargainSession.create({
        data: {
          id: sessionId,
          storeId: store.id,
          shopifyProductId: String(productId ?? shopifyProductId ?? ''),
          variantId: variantId || null,
          originalPrice: currentPrice,
          currentOffer: finalPriceSafe,
          finalPrice: finalPriceSafe,
          bargainFloor: minPrice,
          bulkQuantity: safeBulk,
          discountCode: result.code,
          discountCodeCartToken: buyer.cartToken,
          discountCodeCustomerEmail: safeCustomerEmail,
          purchaseUrl,
          customerEmail: safeCustomerEmail,
          customerFingerprint: buyer.customerFingerprint,
          cartToken: buyer.cartToken,
          platform,
          platformProductId: platform === 'woocommerce' ? String(productId) : null,
          platformVariantId: variantId || null,
          externalCustomerId: normalizedCustomerId,
          status: 'accepted',
          acceptedAt: new Date(),
          expiredAt: authorisedQuote?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
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
      properties: { scope: 'product' },
    })
    await track({
      name: 'cartgain_bargain_deal_accepted',
      storeId: store.id,
      properties: { source: 'checkout', scope: 'product', dealMode },
    })

    return NextResponse.json({
      success: true,
      code: result.code,
      status: result.status,
      platform,
      message: checkoutAcceptedMessage({
        code: result.code,
        persona: enginePersonaFor(publishedPersonality(config)),
      }),
      ...(purchaseUrl ? { purchaseUrl } : {}),
    }, { headers })
  } catch (error) {
    console.error('[BARGAIN_CHECKOUT_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500, headers })
  }
}