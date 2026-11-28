import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { computeMinPrice } from '@/lib/services/bargain'
import { buildExecutablePrice } from '@/lib/financial-safety'
import { publicOfferRejection, validateOffer } from '@/lib/bargain/offer-validation'
import { bargainCampaignStatus } from '@/lib/bargain/policy'
import { generateBargainCode } from '@/lib/bargain/purchase'
import { acceptQuote, createQuote } from '@/lib/bargain/quote'
import { track } from '@/lib/analytics/track'
import {
  checkoutBuyerFromBody,
  checkoutOriginCorsHeaders,
  checkoutPlatform,
  resolveCheckoutStore,
} from '@/lib/bargain/checkout-origin'

export const dynamic = 'force-dynamic'

const CHECKOUT_QUOTE_TTL_MS = 24 * 60 * 60 * 1000

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: checkoutOriginCorsHeaders(request.headers.get('origin')),
  })
}

/**
 * Server-authoritative quote minting for the Shopify Checkout UI extension.
 *
 * The extension cannot carry a full BargainSession, so it used to send a client-
 * computed price straight to /checkout-accept. This route derives the price,
 * floor and discount from live Shopify data first, binds the signed quote to the
 * checkout token/customer, and returns only the public quote fields. The code is
 * still generated server-side and is only created on Shopify by /checkout-accept
 * after the signed quote passes validation again.
 */
export async function POST(request: NextRequest) {
  const headers = checkoutOriginCorsHeaders(request.headers.get('origin'))
  try {
    const rate = await checkSimpleRateLimit(`bargain_checkout_quote_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const platform = checkoutPlatform(body)
    const productId = body?.productId ?? body?.platformProductId ?? body?.shopifyProductId
    const variantId = typeof body?.variantId === 'string' && body.variantId ? body.variantId : null
    const requestedPrice = Number(body?.finalPrice ?? body?.requestedPrice)
    const rawBulk = body?.bulkQuantity != null ? Math.floor(Number(body.bulkQuantity)) : null
    const quantity = rawBulk != null && Number.isFinite(rawBulk) && rawBulk >= 1 ? rawBulk : 1

    if (
      platform !== 'shopify' ||
      typeof body?.shopDomain !== 'string' ||
      !body.shopDomain ||
      !productId ||
      !Number.isFinite(requestedPrice) ||
      requestedPrice <= 0 ||
      body?.orderLevel === true
    ) {
      return NextResponse.json({ message: 'Missing or invalid checkout quote fields' }, { status: 400, headers })
    }

    const buyer = checkoutBuyerFromBody(body)
    if (!buyer.cartToken) {
      return NextResponse.json({ message: 'Checkout token required' }, { status: 400, headers })
    }

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
        { status: 429, headers: { ...headers, 'Retry-After': String(budget.retryAfter) } },
      )
    }

    const currentPrice = await fetchShopifyProductPrice(store, String(productId), variantId)
    if (currentPrice == null) {
      return NextResponse.json({ message: 'Could not verify current product price' }, { status: 503, headers })
    }

    const { minPrice } = await computeMinPrice({
      storeId: store.id,
      shopifyProductId: String(productId),
      originalPrice: currentPrice,
      bulkQuantity: quantity > 1 ? quantity : undefined,
      platform,
      platformProductId: null,
    })

    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: store.id },
      select: { enabled: true, campaignStart: true, campaignEnd: true, emergencyPaused: true },
    })
    if (config?.enabled === false) {
      return NextResponse.json({ message: 'Bargaining disabled' }, { status: 403, headers })
    }
    const validation = validateOffer({
      requestedPrice,
      originalPrice: currentPrice,
      floorPrice: minPrice,
      campaignActive: bargainCampaignStatus(config, new Date()) === 'active',
      emergencyPaused: config?.emergencyPaused === true,
    })
    if (!validation.ok) {
      return NextResponse.json(publicOfferRejection(validation), { status: 409, headers })
    }

    const executable = buildExecutablePrice({
      originalPrice: currentPrice,
      finalPrice: requestedPrice,
      floorPrice: minPrice,
      bulkQuantity: quantity > 1 ? quantity : null,
    })
    if (!executable.ok) {
      return NextResponse.json({ message: 'Price mismatch — please refresh the page and renegotiate.' }, { status: 409, headers })
    }

    const quote = await createQuote({
      force: true,
      storeId: store.id,
      cartToken: buyer.cartToken,
      shopifyProductId: String(productId),
      variantId,
      quantity,
      originalPrice: currentPrice,
      finalPrice: executable.finalPrice,
      discountPercent: executable.discountPercent,
      floorPrice: minPrice,
      currency: store.currency ?? 'INR',
      customerEmail: buyer.customerEmail,
      shopifyCustomerId: buyer.shopifyCustomerId,
      customerFingerprint: buyer.customerFingerprint,
      discountCode: generateBargainCode(),
      conditions: { source: 'checkout_ui_extension', platform },
      ttlMs: CHECKOUT_QUOTE_TTL_MS,
    })
    if (!quote) {
      return NextResponse.json({ message: 'Could not issue a secure quote' }, { status: 503, headers })
    }
    const accepted = await acceptQuote(quote)
    if (!accepted) {
      return NextResponse.json({ message: 'Quote could not be confirmed' }, { status: 409, headers })
    }

    await track({
      name: 'cartgain_checkout_quote_issued',
      storeId: store.id,
      properties: { source: 'checkout_ui_extension' },
    })

    return NextResponse.json({
      quoteToken: quote.token,
      originalPrice: currentPrice,
      finalPrice: executable.finalPrice,
      discountPercent: executable.discountPercent,
      discountCode: quote.discountCode,
      expiresAt: quote.expiresAt.toISOString(),
    }, { headers })
  } catch (error) {
    console.error('[BARGAIN_CHECKOUT_QUOTE]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500, headers })
  }
}
