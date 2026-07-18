import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainStartSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { buildOpeningMessage, computeMinPrice, negotiateStep, type NegotiationContext } from '@/lib/services/bargain'

export const dynamic = 'force-dynamic'

// POST /api/bargain/start — open a new bargain session (no auth — storefront)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateOrThrow(bargainStartSchema, body)

    // Verify the store exists and is active
    const store = await prisma.store.findUnique({ where: { id: data.storeId } })
    if (!store || !store.isActive) {
      return NextResponse.json({ message: 'Store not available' }, { status: 404 })
    }

    // Load config (or auto-create defaults on merchant's first request)
    const config = await prisma.bargainConfig.upsert({
      where: { storeId: data.storeId },
      create: { storeId: data.storeId },
      update: {},
    })

    if (!config.enabled) {
      return NextResponse.json(
        { message: 'Bargaining is not enabled for this store', enabled: false },
        { status: 403 }
      )
    }

    // Compute floor price + bargainability
    const { minPrice, isBargainable, reason } = await computeMinPrice({
      storeId: data.storeId,
      shopifyProductId: data.shopifyProductId,
      originalPrice: data.originalPrice,
    })

    if (!isBargainable) {
      return NextResponse.json(
        { message: 'This product is not eligible for bargaining', reason },
        { status: 403 }
      )
    }

    const now = new Date()
    const expiredAt = new Date(now.getTime() + config.sessionTimeout * 1000)

    const currencySymbol = store.currency === 'INR' ? '₹' : store.currency === 'USD' ? '$' : store.currency === 'EUR' ? '€' : store.currency + ' '

    const ctx: NegotiationContext = {
      storeName: store.name,
      currencySymbol,
      originalPrice: data.originalPrice,
      minPrice,
      attemptsUsed: 0,
      maxAttempts: config.maxAttempts,
      persona: config.aiPersona as NegotiationContext['persona'],
      productTitle: undefined, // merchant APIs store title optionally on product override
    }

    // Pull optional product title from override
    const product = await prisma.bargainProduct.findUnique({
      where: { storeId_shopifyProductId: { storeId: data.storeId, shopifyProductId: data.shopifyProductId } },
      select: { productTitle: true },
    })
    if (product?.productTitle) ctx.productTitle = product.productTitle

    // Try AI opening message, fall back to deterministic
    let openingReply = buildOpeningMessage(ctx)
    let openingMeta: any = { source: 'fallback' }

    try {
      const ai = await negotiateStep(ctx, [], data.originalPrice) // ask AI to greet given originalPrice as "offer" placeholder
      // Treat negotiation as welcome for opening (don't actually evaluate originalPrice as customer offer)
      openingReply = ai.reply || openingReply
      openingMeta = { source: 'openai', tactic: ai.tactic, sentiment: ai.sentiment }
    } catch (e) {
      // silent — fallback already set
    }

    const bargainSession = await prisma.bargainSession.create({
      data: {
        storeId: data.storeId,
        cartToken: data.cartToken ?? null,
        shopifyProductId: data.shopifyProductId,
        variantId: data.variantId ?? null,
        customerEmail: data.customerEmail || null,
        customerPhone: data.customerPhone || null,
        originalPrice: data.originalPrice,
        currentOffer: data.originalPrice,
        attemptsUsed: 0,
        status: 'active',
        startedAt: now,
        expiredAt,
        messages: {
          create: [
            {
              role: 'ai',
              content: openingReply,
              metadata: openingMeta,
            },
          ],
        },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    return NextResponse.json({
      sessionId: bargainSession.id,
      session: bargainSession,
      minPrice, // NOTE: do NOT expose to client in production UI — only used server-side
      openingMessage: openingReply,
      expiresAt: expiredAt.toISOString(),
      attemptsRemaining: config.maxAttempts,
    }, { status: 201 })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_START]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
