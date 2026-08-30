import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainAcceptSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { getBargainGate, decideDealMode, recordBargainDealOps, BARGAIN_DEALS_EXHAUSTED } from '@/lib/bargain/gate'

export const dynamic = 'force-dynamic'

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

    // Customer must have an accepted offer OR a previous AI counter they're accepting
    // If active, accept the most recent AI counteroffer
    let finalPrice = bargainSession.finalPrice
    if (bargainSession.status !== 'accepted') {
      if (bargainSession.status !== 'active') {
        return NextResponse.json({
          message: `Cannot accept — session is ${bargainSession.status}`,
        }, { status: 409 })
      }
      // Accept the last AI counter (most recent ai message with offeredPrice)
      const lastCounter = await prisma.bargainMessage.findFirst({
        where: { sessionId: bargainSession.id, role: 'ai', offeredPrice: { not: null } },
        orderBy: { createdAt: 'desc' },
      })
      if (!lastCounter?.offeredPrice) {
        return NextResponse.json({ message: 'No counter-offer to accept' }, { status: 400 })
      }
      finalPrice = lastCounter.offeredPrice
    }

    if (finalPrice == null) {
      return NextResponse.json({ message: 'No agreed final price' }, { status: 400 })
    }

    // Verify final price isn't below floor (bulk-aware; safety against manipulated originalPrice)
    const { computeMinPrice } = await import('@/lib/services/bargain')
    const recentMsgs = await prisma.bargainMessage.findMany({
      where: { sessionId: bargainSession.id, role: 'customer' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { metadata: true },
    })
    const bulkQuantity = recentMsgs
      .map((m: any) => (m.metadata as any)?.bulkQuantity)
      .find((q: any) => q != null) ?? undefined
    const { minPrice } = await computeMinPrice({
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      originalPrice: bargainSession.originalPrice,
      bulkQuantity,
    })
    if (finalPrice < minPrice) {
      return NextResponse.json({ message: 'Price mismatch — session may have been tampered with' }, { status: 409 })
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

    const discountPercent = Math.round(
      ((bargainSession.originalPrice - finalPrice) / bargainSession.originalPrice) * 100
    )

    // Generate short discount code - bind to cartToken to prevent sharing
    const code = `BARGAIN-${bargainSession.id.slice(-6).toUpperCase()}`
    const customerEmail = bargainSession.customerEmail
    const cartToken = bargainSession.cartToken

    // Persist system message marking acceptance + meter the deal atomically
    await prisma.$transaction([
      ...recordBargainDealOps(gate, bargainSession.id, bargainSession.originalPrice, finalPrice, dealMode as 'included' | 'overage'),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id,
          role: 'system',
          content: `Customer accepted final price of ${bargainSession.store.currency} ${finalPrice.toFixed(2)}. Discount code issued: ${code} (${discountPercent}% off)`,
          metadata: { event: 'accept', finalPrice, discountPercent, code, customerEmail, cartToken, dealMode },
        } as any,
      }),
      prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: {
          status: 'accepted',
          finalPrice,
          discountCode: code,
          discountCodeCustomerEmail: customerEmail,
          discountCodeCartToken: cartToken,
        },
      }),
    ])

    // Try to create Shopify discount code (best-effort) — gracefully degrade
    let shopifyCode: { code: string; status: 'created' | 'pending' | 'failed'; error?: string }
    try {
      const result = await generateBargainDiscountCode({
        store: bargainSession.store,
        shopifyProductId: bargainSession.shopifyProductId,
        variantId: bargainSession.variantId ?? null,
        originalPrice: bargainSession.originalPrice,
        finalPrice,
        discountPercent,
        code,
        customerEmail,
        cartToken,
      })
      shopifyCode = result
    } catch (err: any) {
      console.error('[BARGAIN_ACCEPT_SHOPIFY]', err?.message ?? err)
      shopifyCode = { code, status: 'failed', error: err?.message ?? 'unknown' }
    }

    return NextResponse.json({
      sessionId: bargainSession.id,
      finalPrice,
      discountPercent,
      discountCode: shopifyCode.code,
      shopifyStatus: shopifyCode.status,
      currency: bargainSession.store.currency,
      expiresAt: bargainSession.expiredAt.toISOString(),
      message:
        shopifyCode.status === 'created'
          ? `🎉 You got it for ${bargainSession.store.currency} ${finalPrice.toFixed(2)}! Use code: ${shopifyCode.code}`
          : `🎉 Deal locked at ${bargainSession.store.currency} ${finalPrice.toFixed(2)}! Your code: ${shopifyCode.code} — apply at checkout.`,
    })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_ACCEPT]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
