import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainAcceptSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'

export const dynamic = 'force-dynamic'

// POST /api/bargain/accept — customer accepts the final price; generate Shopify discount code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateOrThrow(bargainAcceptSchema, body)

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      include: { store: true },
    })
    if (!bargainSession) {
      return NextResponse.json({ message: 'Bargain session not found' }, { status: 404 })
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

    const discountPercent = Math.round(
      ((bargainSession.originalPrice - finalPrice) / bargainSession.originalPrice) * 100
    )

    // Generate short discount code
    const code = `BARGAIN-${bargainSession.id.slice(-6).toUpperCase()}`

    // Persist system message marking acceptance
    await prisma.$transaction([
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id,
          role: 'system',
          content: `Customer accepted final price of ${bargainSession.store.currency} ${finalPrice.toFixed(2)}. Discount code issued: ${code} (${discountPercent}% off)`,
          metadata: { event: 'accept', finalPrice, discountPercent, code },
        } as any,
      }),
      prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: {
          status: 'accepted',
          finalPrice,
          discountCode: code,
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
