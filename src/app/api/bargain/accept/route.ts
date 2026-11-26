import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainAcceptSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { assertSessionOwnership, verifySessionToken } from '@/lib/bargain/session-bind'
import { getBargainGate, decideDealMode, recordBargainDealOps, BARGAIN_DEALS_EXHAUSTED } from '@/lib/bargain/gate'
import { computeMinPrice } from '@/lib/services/bargain'
import { generateBargainCode, buildBargainCheckoutUrl } from '@/lib/bargain/purchase'
import { fetchShopifyProductPrice, fetchShopifyProductDetail } from '@/lib/shopify'
import { buildExecutablePrice } from '@/lib/financial-safety'
import { validateOffer } from '@/lib/bargain/offer-validation'
import { bargainCampaignStatus, couponMentionedInMessages } from '@/lib/bargain/policy'
import { track } from '@/lib/analytics/track'
import { recordLearningAcceptance } from '@/lib/bargain/learning/outcomes'
import { createQuote, acceptQuote, findQuoteBySessionId } from '@/lib/bargain/quote'
import {
  detectPaymentIntent,
  normalizePaymentConfig,
  prepaidSaving,
} from '@/lib/bargain/payment'
import {
  computeShipping,
  normalizeShippingConfig,
  shippingUpsellLine,
} from '@/lib/bargain/shipping'
import { currencySymbolFor, formatMoney } from '@/lib/bargain/i18n'
import { dealAcceptedMessage } from '@/lib/bargain/post-deal'
import {
  bargainPlatformFor,
  buildWooCommerceCheckoutUrl,
  createOrReuseWooCommerceCoupon,
  getWooCommerceProductFacts,
} from '@/lib/woocommerce/bargain-adapter'

export const dynamic = 'force-dynamic'

const ACCEPTABLE_DECISIONS = new Set(['accept', 'counter'])

function purchaseUrlForDeal(opts: {
  platform: string
  store: any
  code: string
  productId?: string | null
  variantId?: string | null
  quantity?: number | null
}): string {
  if (opts.platform === 'woocommerce') {
    return buildWooCommerceCheckoutUrl({
      domain: opts.store.domain,
      code: opts.code,
      productId: opts.productId,
      variantId: opts.variantId,
    })
  }
  return buildBargainCheckoutUrl({
    domain: opts.store.domain,
    code: opts.code,
    variantId: opts.variantId,
    quantity: opts.quantity,
  })
}

async function priceChangedResponse(opts: {
  storeId: string
  currentPrice: number
  agreedPrice: number
  currency: string
  reason: string
}) {
  await track({
    name: 'cartgain_offer_rejected',
    storeId: opts.storeId,
    properties: { reason: 'PRICE_CHANGED', detail: opts.reason },
  })
  return NextResponse.json({
    message: `The listed price for this deal is now ${formatMoney(opts.currentPrice, opts.currency)}. Your agreed ${formatMoney(opts.agreedPrice, opts.currency)} can no longer be applied. Please refresh and make a fresh offer.`,
    reason: 'PRICE_CHANGED',
    code: 'OFFER_REJECTED_PRICE_CHANGED',
    currentPrice: opts.currentPrice,
    agreedPrice: opts.agreedPrice,
    currency: opts.currency,
  }, { status: 409 })
}

// POST /api/bargain/accept — customer accepts the final price; generate Shopify discount code
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_accept_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const data = validateOrThrow(bargainAcceptSchema, body)

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      include: { store: true },
    })
    if (!bargainSession) {
      return NextResponse.json({ message: 'Bargain session not found' }, { status: 404 })
    }
    const platform = bargainPlatformFor(bargainSession.store, body?.platform)
    const productId = bargainSession.shopifyProductId

    // Owner binding — the caller must reproduce at least one of the session's
    // buyer identities, otherwise discount-code replay would be trivially
    // farmed by anyone with the sessionId.
    const ownership = assertSessionOwnership(bargainSession, {
      customerFingerprint: data.customerFingerprint,
      customerEmail: data.customerEmail,
      cartToken: data.cartToken,
      tokenOk: verifySessionToken(bargainSession.id, data.sessionToken),
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason }, { status: 403 })
    }

    // Idempotent replay — already accepted sessions resurface the issued code
    // instead of double-counting the deal or re-creating the rev share event.
    if (bargainSession.status === 'accepted' && bargainSession.discountCode) {
      const existingQuote = await findQuoteBySessionId(bargainSession.id).catch(() => null)
      return NextResponse.json({
        sessionId: bargainSession.id,
        finalPrice: bargainSession.finalPrice,
        discountPercent: Math.round(
          ((bargainSession.originalPrice - (bargainSession.finalPrice ?? bargainSession.originalPrice)) / bargainSession.originalPrice) * 100
        ),
        discountCode: bargainSession.discountCode,
        quoteToken: existingQuote?.token ?? null,
        shopifyStatus: 'created',
        purchaseUrl:
          bargainSession.purchaseUrl ??
          purchaseUrlForDeal({
            platform,
            store: bargainSession.store,
            code: bargainSession.discountCode,
            productId,
            variantId: bargainSession.variantId,
            quantity: bargainSession.bulkQuantity,
          }),
        currency: bargainSession.store.currency,
        expiresAt: bargainSession.expiredAt.toISOString(),
        message: `Deal already locked at ${formatMoney(bargainSession.finalPrice ?? bargainSession.originalPrice, bargainSession.store.currency)}! Use code: ${bargainSession.discountCode}`,
      })
    }

    if (bargainSession.status !== 'active' && bargainSession.status !== 'accepted') {
      return NextResponse.json({
        message: `Cannot accept — session is ${bargainSession.status}`,
      }, { status: 409 })
    }

    // ── What can be accepted? Only a REAL AI counteroffer or an inline-accept
    // finalPrice. Pure-chat replies (decision 'chat') never carry an offer —
    // they must NOT unlock the floor. Defense-in-depth over the offer-route fix.
    let finalPrice: number | null = bargainSession.finalPrice
    let offerBulkQuantity: number | null = null
    if (bargainSession.status === 'active') {
      const counters = await prisma.bargainMessage.findMany({
        where: { sessionId: bargainSession.id, role: 'ai', offeredPrice: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, createdAt: true, offeredPrice: true, metadata: true },
      })
      const acceptable = counters.find(
        (m: any) => m.offeredPrice != null && ACCEPTABLE_DECISIONS.has((m.metadata as any)?.decision)
      )
      if (!acceptable?.offeredPrice) {
        return NextResponse.json({ message: 'No counter-offer to accept' }, { status: 400 })
      }
      finalPrice = acceptable.offeredPrice

      // The offer's bulk context: from the customer message that immediately
      // preceded the accepted counter, else the most recent bulk mention (or
      // the inline-accept bulk context, which is also recent customer messages).
      const preceding = await prisma.bargainMessage.findFirst({
        where: { sessionId: bargainSession.id, role: 'customer', createdAt: { lt: acceptable.createdAt } },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      })
      if ((preceding?.metadata as any)?.bulkQuantity != null) {
        offerBulkQuantity = Number((preceding?.metadata as any).bulkQuantity)
      }
    }

    // Universal fallback bulk scan: the preceding-counter strategy didn't find
    // bulk (e.g. inline-accept, or the counter had no customer msg before it).
    if (offerBulkQuantity == null) {
      const recentCustomer = await prisma.bargainMessage.findMany({
        where: { sessionId: bargainSession.id, role: 'customer' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { metadata: true },
      })
      for (const m of recentCustomer) {
        if ((m.metadata as any)?.bulkQuantity != null) {
          offerBulkQuantity = Number((m.metadata as any).bulkQuantity)
          break
        }
      }
    }

    if (finalPrice == null) {
      return NextResponse.json({ message: 'No agreed final price' }, { status: 400 })
    }

    // ── OFFER VALIDATION (machine reason codes) ──
    // Re-derive the floor at the AUTHORITATIVE, CURRENT Shopify price (not the
    // stale start-time snapshot). If the merchant raised the price, the floor
    // moved up; a stale agreement that now clears nothing is rejected instead of
    // charged at a loss. If Shopify is unreachable we fall back to the snapshot
    // originalPrice (same as start/offer).
    let currentPrice = bargainSession.originalPrice
    let variantAvailable: boolean | null = null
    let productAvailable: boolean | null = null
    if (platform === 'woocommerce') {
      const facts = await getWooCommerceProductFacts({
        store: bargainSession.store,
        productId,
        variantId: bargainSession.variantId,
        fallbackPrice: bargainSession.originalPrice,
      })
      currentPrice = facts?.price ?? bargainSession.originalPrice
      variantAvailable = facts?.available ?? null
      productAvailable = facts ? facts.status == null || ['active', 'publish', 'published'].includes(facts.status.toLowerCase()) : null
    } else {
      const currentDetail = await fetchShopifyProductDetail(bargainSession.store, bargainSession.shopifyProductId)
      const matchedVariant = currentDetail?.variants?.find(v =>
        bargainSession.variantId
          ? v.id === bargainSession.variantId.replace(/^gid:\/\/shopify\/ProductVariant\//, '')
          : true,
      )
      currentPrice =
        (matchedVariant?.price != null ? Number(matchedVariant.price) : null) ??
        (await fetchShopifyProductPrice(bargainSession.store, bargainSession.shopifyProductId, bargainSession.variantId ?? null)) ??
        bargainSession.originalPrice
      const effectiveVariantId = bargainSession.variantId?.replace(/^gid:\/\/shopify\/ProductVariant\//, '')
      variantAvailable = !currentDetail || !effectiveVariantId
        ? null
        : currentDetail.variants?.find(v => v.id === effectiveVariantId)?.available ?? null
      productAvailable = !currentDetail ? null : currentDetail.status === 'active' || currentDetail.status == null
    }
    const { minPrice } = await computeMinPrice({
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      originalPrice: currentPrice,
      bulkQuantity: offerBulkQuantity ?? undefined,
      platform,
      platformProductId: productId,
    })

    // ── MERCHANT POLICY GATES (deterministic, independent of the AI) ──
    // §25 Campaign lifecycle: an offer must not be accepted once the campaign
    // window closed — `campaignStart/campaignEnd` are validated on write (they
    // are set together and ordered).
    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: bargainSession.storeId },
      select: {
        enabled: true,
        campaignStart: true,
        campaignEnd: true,
        couponStackingEnabled: true,
        emergencyPaused: true,
        maxAttempts: true,
        shippingAwareEnabled: true,
        shippingFlatCost: true,
        freeShippingThreshold: true,
        paymentAwareEnabled: true,
        prepaidIncentivePercent: true,
      },
    })
    if (config?.enabled === false) {
      return NextResponse.json({ message: 'Bargaining disabled' }, { status: 403 })
    }
    const campaignActive = bargainCampaignStatus(config, new Date()) === 'active'

    // §24 Coupon stacking: if the customer ever mentioned another coupon/promo
    // during this session and the merchant disabled stacking, the accept is
    // blocked with a machine reason code. Scans the recent customer transcript
    // (metadata from the offer pipeline is bonus; the transcript is authoritative).
    const recentCustomerMessages = await prisma.bargainMessage.findMany({
      where: { sessionId: bargainSession.id, role: 'customer' },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { content: true, metadata: true },
    })
    const couponMentioned =
      couponMentionedInMessages(recentCustomerMessages) ||
      recentCustomerMessages.some((m) => (m.metadata as any)?.couponMentioned === true)
    const couponsAllowed = config?.couponStackingEnabled === true

    // Module 5 — payment intent for the quote conditions (informational; the
    // price path is unchanged). Prefer the server-tagged metadata, else classify
    // from the transcript.
    const paymentIntent =
      (recentCustomerMessages.find((m) => (m.metadata as any)?.paymentIntent)?.metadata as any)?.paymentIntent ??
      detectPaymentIntent(
        recentCustomerMessages[0]?.content ?? '',
        recentCustomerMessages.slice(1).map((m) => m.content),
      )

    const validation = validateOffer({
      requestedPrice: finalPrice,
      originalPrice: currentPrice,
      floorPrice: minPrice,
      variantAvailable,
      productAvailable,
      campaignActive,
      sessionExpired: bargainSession.expiredAt.getTime() <= Date.now(),
      emergencyPaused: config?.emergencyPaused === true,
      attemptsUsed: Math.max(0, bargainSession.attemptsUsed - 1),
      maxAttempts: config?.maxAttempts ?? 3,
      couponMentioned,
      couponsAllowed,
    })
    if (!validation.ok) {
      if (
        validation.reason === 'BELOW_FLOOR_REJECTED' ||
        (validation.reason === 'INVALID_PRICE' && finalPrice > currentPrice)
      ) {
        return priceChangedResponse({
          storeId: bargainSession.storeId,
          currentPrice,
          agreedPrice: finalPrice,
          currency: bargainSession.store.currency,
          reason: validation.reason,
        })
      }
      await track({
        name: 'cartgain_offer_rejected',
        storeId: bargainSession.storeId,
        properties: { reason: validation.reason },
      })
      return NextResponse.json({
        message: validation.message ?? 'Cannot accept this purchase right now.',
        reason: validation.reason,
        code: `OFFER_REJECTED_${validation.reason}`,
      }, { status: 409 })
    }
    await track({
      name: 'cartgain_offer_approved',
      storeId: bargainSession.storeId,
      properties: { bulkQuantity: offerBulkQuantity ?? undefined },
    })

    const executable = buildExecutablePrice({
      originalPrice: currentPrice,
      finalPrice,
      floorPrice: minPrice,
      bulkQuantity: offerBulkQuantity,
    })
    if (!executable.ok) {
      return priceChangedResponse({
        storeId: bargainSession.storeId,
        currentPrice,
        agreedPrice: finalPrice,
        currency: bargainSession.store.currency,
        reason: executable.reason,
      })
    }

    const currencySymbol = currencySymbolFor(bargainSession.store.currency)
    const shippingConfig = normalizeShippingConfig((config ?? {}) as any)
    const paymentConfig = normalizePaymentConfig((config ?? {}) as any)
    const shippingView = shippingConfig.enabled
      ? (() => {
          const quote = computeShipping({
            config: shippingConfig,
            unitPrice: executable.finalPrice,
            quantity: executable.bulkQuantity,
          })
          return { ...quote, upsell: shippingUpsellLine(quote, currencySymbol, { config: shippingConfig }) }
        })()
      : null
    const paymentView = paymentConfig.enabled
      ? { intent: paymentIntent, prepaidSaving: prepaidSaving(paymentConfig) }
      : null

    // Plan gate — free tiers hard-stop at the deal quota; paid tiers fall back
    // to overage billing only when the store is opted in.
    const gate = await getBargainGate(bargainSession.storeId)
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
      }, { status: 402 })
    }

    // ── ATOMIC CLAIM: only one acceptance wins the CAS. Prevents concurrent
    // double-accepts from double-metering the deal or issuing two codes.
    // An 'accepted' row that still has NO code can only be a legacy session
    // stranded by the old offer-path bug (the offer route now keeps the session
    // active on a proposal). Claim it so the shopper isn't stuck forever.
    const claim = await prisma.bargainSession.updateMany({
      where: {
        id: bargainSession.id,
        status: { in: ['active', 'accepted'] },
        discountCode: null,
      },
      data: { status: 'accepting' },
    })
    if (claim.count === 0) {
      const refreshed = await prisma.bargainSession.findUnique({
        where: { id: bargainSession.id },
        select: { status: true, discountCode: true, finalPrice: true, originalPrice: true, purchaseUrl: true, variantId: true, bulkQuantity: true },
      })
      if (refreshed?.status === 'accepted' && refreshed.discountCode) {
        const existingQuote = await findQuoteBySessionId(bargainSession.id).catch(() => null)
        const alreadyAgreedPrice = refreshed.finalPrice ?? refreshed.originalPrice
        return NextResponse.json({
          sessionId: bargainSession.id,
          originalPrice: currentPrice,
          finalPrice: alreadyAgreedPrice,
          discountCode: refreshed.discountCode,
          quoteToken: existingQuote?.token ?? null,
          shopifyStatus: 'created',
          purchaseUrl:
            refreshed.purchaseUrl ??
            purchaseUrlForDeal({
              platform,
              store: bargainSession.store,
              code: refreshed.discountCode,
              productId,
              variantId: refreshed.variantId,
              quantity: refreshed.bulkQuantity,
            }),
          currency: bargainSession.store.currency,
          shipping: shippingView,
          payment: paymentView,
          message: 'Deal already locked — code issued.',
        })
      }
      return NextResponse.json({
        message: refreshed?.status === 'accepting'
          ? 'Acceptance is being processed — please retry in a moment.'
          : `Cannot accept — session is ${refreshed?.status ?? 'gone'}.`,
      }, { status: 409 })
    }

    const discountPercent = executable.discountPercent
    const code = generateBargainCode()
    const customerEmail = bargainSession.customerEmail
    const cartToken = bargainSession.cartToken

    // If we know the Shopify customer for this cart, bind the code to them so a
    // shared screenshot can't be redeemed by someone else.
    let shopifyCustomerId: string | null = null
    if (cartToken) {
      const cart = await prisma.cart.findUnique({
        where: { storeId_cartId: { storeId: bargainSession.storeId, cartId: cartToken } },
        select: { customerId: true },
      })
      shopifyCustomerId = cart?.customerId ?? null
    }

    // Create the Shopify discount code BEFORE committing the acceptance. On
    // failure the claim is rolled back to 'active' so the customer can retry —
    // an 'accepted' session must never carry a code Shopify does not know.
    let shopifyCode: { code: string; status: 'created' | 'pending' | 'failed'; error?: string }
    if (platform === 'woocommerce') {
      try {
        const coupon = await createOrReuseWooCommerceCoupon({
          store: bargainSession.store,
          code,
          value: discountPercent,
          type: 'percentage',
          minimumSubtotal: executable.minSubtotalMinor != null ? executable.minSubtotalMinor / 100 : null,
          productIds: [productId],
          expiresAt: bargainSession.expiredAt,
          description: `CartGain bargain ${code}`,
        })
        shopifyCode = coupon
          ? { code: coupon.code, status: 'created' }
          : { code, status: 'failed', error: 'WooCommerce coupon creation failed' }
      } catch (err: any) {
        console.error('[BARGAIN_ACCEPT_WOOCOMMERCE]', err?.message ?? err)
        shopifyCode = { code, status: 'failed', error: err?.message ?? 'unknown' }
      }
    } else {
      try {
        shopifyCode = await generateBargainDiscountCode({
          store: bargainSession.store,
          shopifyProductId: bargainSession.shopifyProductId,
          variantId: bargainSession.variantId ?? null,
          originalPrice: currentPrice,
          finalPrice: executable.finalPrice,
          discountPercent,
          code,
          customerEmail,
          cartToken,
          bulkQuantity: executable.bulkQuantity,
          floorPrice: minPrice,
          shopifyCustomerId,
        })
      } catch (err: any) {
        console.error('[BARGAIN_ACCEPT_SHOPIFY]', err?.message ?? err)
        shopifyCode = { code, status: 'failed', error: err?.message ?? 'unknown' }
      }
    }

    if (shopifyCode.status !== 'created') {
      await prisma.bargainSession.updateMany({
        where: { id: bargainSession.id, status: 'accepting' },
        data: { status: 'active' },
      })
      return NextResponse.json({
        message: shopifyCode.status === 'pending'
          ? 'Your offer is ready, but this store is not connected to Shopify yet. Please try again shortly.'
          : `Discount code creation failed — please try again. ${shopifyCode.error || ''}`,
      }, { status: shopifyCode.status === 'pending' ? 503 : 500 })
    }

    // Commit the acceptance atomically: meters + system message + session update
    // guarded by the 'accepting' CAS so a racing request cannot double-meter.
    const purchaseUrl = purchaseUrlForDeal({
      platform,
      store: bargainSession.store,
      code,
      productId,
      variantId: bargainSession.variantId,
      quantity: executable.bulkQuantity,
    })
    await prisma.$transaction([
      ...recordBargainDealOps(gate, bargainSession.id, currentPrice, executable.finalPrice, dealMode as 'included' | 'overage'),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id,
          role: 'system',
          content: `Customer accepted final price of ${formatMoney(executable.finalPrice, bargainSession.store.currency)}. Discount code issued: ${code} (${discountPercent}% off)`,
          metadata: {
            event: 'accept',
            finalPrice: executable.finalPrice,
            discountPercent,
            code,
            customerEmail,
            cartToken,
            dealMode,
            bargainFloor: minPrice,
            bulkQuantity: executable.bulkQuantity,
            originalPriceUsed: currentPrice,
            chargeMinor: executable.unitPriceMinor,
          } as any,
        },
      }),
      prisma.bargainSession.updateMany({
        where: { id: bargainSession.id, status: 'accepting' },
        data: {
          status: 'accepted',
          acceptedAt: new Date(),
          finalPrice: executable.finalPrice,
          bargainFloor: minPrice,
          bulkQuantity: executable.bulkQuantity,
          discountCode: code,
          discountCodeCustomerEmail: customerEmail,
          discountCodeCartToken: cartToken,
          purchaseUrl,
        },
      }),
    ])

    await recordLearningAcceptance(bargainSession.id)

    // ── MODULE 3 — secure quote ──
    // Best-effort, additive, flag-gated. The discount code above is already the
    // authoritative artifact; the quote adds a signed, revocable, audited record
    // of the same deal. A failure here must NEVER fail the accept response.
    let quoteToken: string | null = null
    if (platform !== 'woocommerce') try {
      const quote = await createQuote({
        storeId: bargainSession.storeId,
        sessionId: bargainSession.id,
        cartToken,
        shopifyProductId: bargainSession.shopifyProductId,
        variantId: bargainSession.variantId,
        quantity: executable.bulkQuantity,
        originalPrice: currentPrice,
        finalPrice: executable.finalPrice,
        discountPercent,
        floorPrice: minPrice,
        currency: bargainSession.store.currency,
        customerEmail,
        shopifyCustomerId,
        customerFingerprint: bargainSession.customerFingerprint,
        discountCode: shopifyCode.code,
        conditions: paymentIntent !== 'unknown' ? { paymentIntent } : {},
      })
      if (quote) {
        await acceptQuote(quote)
        quoteToken = quote.token
      }
    } catch (quoteErr) {
      console.error('[BARGAIN_ACCEPT_QUOTE]', (quoteErr as Error)?.message ?? quoteErr)
    }

    return NextResponse.json({
      sessionId: bargainSession.id,
      originalPrice: currentPrice,
      finalPrice: executable.finalPrice,
      discountPercent,
      discountCode: shopifyCode.code,
      quoteToken,
      shopifyStatus: shopifyCode.status,
      platform,
      purchaseUrl,
      currency: bargainSession.store.currency,
      expiresAt: bargainSession.expiredAt.toISOString(),
      shipping: shippingView,
      payment: paymentView,
      message: dealAcceptedMessage({
        price: formatMoney(executable.finalPrice, bargainSession.store.currency),
        code: shopifyCode.code,
        verified: shopifyCode.status === 'created',
      }),
    })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
