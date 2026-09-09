import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainAcceptSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { assertSessionOwnership } from '@/lib/bargain/session-bind'
import { getBargainGate, decideDealMode, recordBargainDealOps, BARGAIN_DEALS_EXHAUSTED } from '@/lib/bargain/gate'
import { computeMinPrice } from '@/lib/services/bargain'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { buildExecutablePrice } from '@/lib/financial-safety'

export const dynamic = 'force-dynamic'

const ACCEPTABLE_DECISIONS = new Set(['accept', 'counter'])

// POST /api/bargain/accept — customer accepts the final price; generate Shopify discount code
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_accept_${request.headers.get('x-forwarded-for') || 'unknown'}`)
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

    // Owner binding — the caller must reproduce at least one of the session's
    // buyer identities, otherwise discount-code replay would be trivially
    // farmed by anyone with the sessionId.
    const ownership = assertSessionOwnership(bargainSession, {
      customerFingerprint: data.customerFingerprint,
      customerEmail: data.customerEmail,
      cartToken: data.cartToken,
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason }, { status: 403 })
    }

    // Idempotent replay — already accepted sessions resurface the issued code
    // instead of double-counting the deal or re-creating the rev share event.
    if (bargainSession.status === 'accepted' && bargainSession.discountCode) {
      return NextResponse.json({
        sessionId: bargainSession.id,
        finalPrice: bargainSession.finalPrice,
        discountPercent: Math.round(
          ((bargainSession.originalPrice - (bargainSession.finalPrice ?? bargainSession.originalPrice)) / bargainSession.originalPrice) * 100
        ),
        discountCode: bargainSession.discountCode,
        shopifyStatus: 'created',
        currency: bargainSession.store.currency,
        expiresAt: bargainSession.expiredAt.toISOString(),
        message: `🎉 Deal already locked at ${bargainSession.store.currency} ${(bargainSession.finalPrice ?? bargainSession.originalPrice).toFixed(2)}! Use code: ${bargainSession.discountCode}`,
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

    // ── FINANCIAL SAFETY: re-derive the floor at the AUTHORITATIVE, CURRENT
    // Shopify price (not the stale start-time snapshot). If the merchant raised
    // the price, the floor moved up; a stale agreement that now clears nothing
    // is rejected instead of charged at a loss. If Shopify is unreachable we
    // fall back to the snapshot originalPrice (same as start/offer).
    const currentPrice =
      (await fetchShopifyProductPrice(bargainSession.store, bargainSession.shopifyProductId, bargainSession.variantId ?? null)) ??
      bargainSession.originalPrice
    const { minPrice } = await computeMinPrice({
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      originalPrice: currentPrice,
      bulkQuantity: offerBulkQuantity ?? undefined,
    })

    const executable = buildExecutablePrice({
      originalPrice: currentPrice,
      finalPrice,
      floorPrice: minPrice,
      bulkQuantity: offerBulkQuantity,
    })
    if (!executable.ok) {
      return NextResponse.json({
        message:
          executable.reason === 'below_floor'
            ? 'Price mismatch — the listed price may have changed. Please refresh and renegotiate.'
            : 'Price mismatch — session may have been tampered with.',
      }, { status: 409 })
    }

    // Plan gate — free tiers hard-stop at the deal quota; paid tiers fall back
    // to overage billing only when the store is opted in.
    const gate = await getBargainGate(bargainSession.storeId)
    const dealMode = decideDealMode(gate)
    if (dealMode === 'blocked_free' || dealMode === 'blocked_no_overage') {
      return NextResponse.json({
        message:
          dealMode === 'blocked_free'
            ? 'This store has reached its free bargain deal limit. Please ask the store to upgrade.'
            : 'This store has reached its bargain deal limit. Overage billing is off for this store.',
        code: BARGAIN_DEALS_EXHAUSTED,
        planId: gate.planId,
        mode: dealMode,
        upgradeUrl: 'https://cart-gain.com/pricing',
      }, { status: 402 })
    }

    // ── ATOMIC CLAIM: only one acceptance wins the CAS. Prevents concurrent
    // double-accepts from double-metering the deal or issuing two codes.
    const claim = await prisma.bargainSession.updateMany({
      where: { id: bargainSession.id, status: 'active' },
      data: { status: 'accepting' },
    })
    if (claim.count === 0) {
      const refreshed = await prisma.bargainSession.findUnique({
        where: { id: bargainSession.id },
        select: { status: true, discountCode: true, finalPrice: true, originalPrice: true },
      })
      if (refreshed?.status === 'accepted' && refreshed.discountCode) {
        return NextResponse.json({
          sessionId: bargainSession.id,
          finalPrice: refreshed.finalPrice ?? refreshed.originalPrice,
          discountCode: refreshed.discountCode,
          shopifyStatus: 'created',
          currency: bargainSession.store.currency,
          message: '🎉 Deal already locked — code issued.',
        })
      }
      return NextResponse.json({
        message: refreshed?.status === 'accepting'
          ? 'Acceptance is being processed — please retry in a moment.'
          : `Cannot accept — session is ${refreshed?.status ?? 'gone'}.`,
      }, { status: 409 })
    }

    const discountPercent = executable.discountPercent
    const code = `BARGAIN-${bargainSession.id.slice(-6).toUpperCase()}`
    const customerEmail = bargainSession.customerEmail
    const cartToken = bargainSession.cartToken

    // Create the Shopify discount code BEFORE committing the acceptance. On
    // failure the claim is rolled back to 'active' so the customer can retry —
    // an 'accepted' session must never carry a code Shopify does not know.
    let shopifyCode: { code: string; status: 'created' | 'pending' | 'failed'; error?: string }
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
      })
    } catch (err: any) {
      console.error('[BARGAIN_ACCEPT_SHOPIFY]', err?.message ?? err)
      shopifyCode = { code, status: 'failed', error: err?.message ?? 'unknown' }
    }

    if (shopifyCode.status === 'failed') {
      await prisma.bargainSession.updateMany({
        where: { id: bargainSession.id, status: 'accepting' },
        data: { status: 'active' },
      })
      return NextResponse.json({
        message: `Discount code creation failed — please try again. ${shopifyCode.error || ''}`,
      }, { status: 500 })
    }

    // Commit the acceptance atomically: meters + system message + session update
    // guarded by the 'accepting' CAS so a racing request cannot double-meter.
    await prisma.$transaction([
      ...recordBargainDealOps(gate, bargainSession.id, currentPrice, executable.finalPrice, dealMode as 'included' | 'overage'),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id,
          role: 'system',
          content: `Customer accepted final price of ${bargainSession.store.currency} ${executable.finalPrice.toFixed(2)}. Discount code issued: ${code} (${discountPercent}% off)`,
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
          finalPrice: executable.finalPrice,
          bargainFloor: minPrice,
          bulkQuantity: executable.bulkQuantity,
          discountCode: code,
          discountCodeCustomerEmail: customerEmail,
          discountCodeCartToken: cartToken,
        },
      }),
    ])

    return NextResponse.json({
      sessionId: bargainSession.id,
      finalPrice: executable.finalPrice,
      discountPercent,
      discountCode: shopifyCode.code,
      shopifyStatus: shopifyCode.status,
      currency: bargainSession.store.currency,
      expiresAt: bargainSession.expiredAt.toISOString(),
      message:
        shopifyCode.status === 'created'
          ? `🎉 You got it for ${bargainSession.store.currency} ${executable.finalPrice.toFixed(2)}! Use code: ${shopifyCode.code}`
          : `🎉 Deal locked at ${bargainSession.store.currency} ${executable.finalPrice.toFixed(2)}! Your code: ${shopifyCode.code} — apply at checkout.`,
    })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
