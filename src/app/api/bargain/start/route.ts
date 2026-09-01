import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainStartSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { buildOpeningMessage, computeMinPrice, negotiateStep, buildCustomerContext, SUPPORTED_LANGUAGES, type NegotiationContext } from '@/lib/services/bargain'
import { currencySymbolFor } from '@/lib/bargain/i18n'
import { fetchShopifyProductPrice } from '@/lib/shopify'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { getBargainGate, recordBargainSessionOp, BARGAIN_SESSIONS_EXHAUSTED } from '@/lib/bargain/gate'

export const dynamic = 'force-dynamic'

// POST /api/bargain/start — open a new bargain session (no auth — storefront)
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_start_${request.headers.get('x-forwarded-for') || 'unknown'}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const data = validateOrThrow(bargainStartSchema, body)

    // Verify the store exists and is active
    const store = await prisma.store.findUnique({ where: { id: data.storeId } })
    if (!store || !store.isActive) {
      return NextResponse.json({ message: 'Store not available' }, { status: 404 })
    }

    // Verify originalPrice matches Shopify (prevents price manipulation).
    // The browser-controlled URL never dictates the price: when Shopify returns an
    // authoritative price we use THAT as the negotiation base and only proceed if
    // the tampered URL value is within a sane window (catches obvious cross-product
    // / inflated-price attacks). If the fetch fails (no/invalid token) we fall back
    // to the URL price — displayed price verification is best-effort, but the floor
    // is ALWAYS derived server-side from the merchant's config, never from the URL.
    let originalPrice = data.originalPrice
    const actualPrice = await fetchShopifyProductPrice(store, data.shopifyProductId, data.variantId)
    if (actualPrice != null) {
      const ratio = data.originalPrice / actualPrice
      if (ratio < 0.5 || ratio > 2) {
        return NextResponse.json({
          message: `Price mismatch — the actual price is ${store.currency === 'INR' ? '₹' : '$'}${actualPrice.toFixed(2)}. Please refresh and try again.`,
        }, { status: 400 })
      }
      // Trust the backend, not the URL: negotiate from the real listed price.
      originalPrice = actualPrice
    }

    // Load config — auto-create with bargaining ON. The storefront widget renders
    // for every connected active store (see embed page), so reaching this endpoint
    // is itself the signal that bargaining should be live. Previously a stale
    // BargainConfig.enabled=false (created before the flag defaulted to true, or
    // toggled off in the dashboard while the widget still rendered) produced the
    // "Bargaining is not enabled for this store" dead-end: the button showed but a
    // click always errored. We reconcile to enabled=true so a storefront bargain
    // always just works. Merchants who truly want bargaining OFF should remove the
    // widget block from their theme (the embed hides itself for disabled stores).
    const config = await prisma.bargainConfig.upsert({
      where: { storeId: data.storeId },
      create: { storeId: data.storeId, enabled: true },
      update: { enabled: true },
    })

    // Plan gate — bargain sessions are a hard quota on every tier.
    // Return a 402 so the widget can surface the plan-limit card.
    const gate = await getBargainGate(data.storeId)
    if (gate.sessionsExhausted) {
      return NextResponse.json({
        message: 'This store has reached its bargain session limit.',
        code: BARGAIN_SESSIONS_EXHAUSTED,
        planId: gate.planId,
        upgradeUrl: 'https://cart-gain.com/pricing',
      }, { status: 402 })
    }

    // Compute floor price + bargainability (floor derived server-side from the
    // merchant's config/product overrides — never from the URL)
    const { minPrice, isBargainable, reason } = await computeMinPrice({
      storeId: data.storeId,
      shopifyProductId: data.shopifyProductId,
      originalPrice,
    })

    if (!isBargainable) {
      return NextResponse.json(
        { message: 'This product is not eligible for bargaining', reason },
        { status: 403 }
      )
    }

    const now = new Date()
    const expiredAt = new Date(now.getTime() + config.sessionTimeout * 1000)

    // Block duplicate active sessions for same product+email (prevents attempt abuse)
    if (data.customerEmail) {
      const existing = await prisma.bargainSession.findFirst({
        where: {
          storeId: data.storeId,
          shopifyProductId: data.shopifyProductId,
          customerEmail: data.customerEmail,
          status: 'active',
          expiredAt: { gt: new Date() },
        },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
      })
      if (existing) {
        const existingFloor = await computeMinPrice({
          storeId: data.storeId,
          shopifyProductId: existing.shopifyProductId,
          originalPrice: existing.originalPrice,
        })
        return NextResponse.json({
          sessionId: existing.id,
          session: existing,
          openingMessage: existing.messages[0]?.content ?? buildOpeningMessage({
            storeName: store.name,
            currencySymbol: currencySymbolFor(store.currency),
            originalPrice: existing.originalPrice,
            minPrice: existingFloor.minPrice,
            attemptsUsed: existing.attemptsUsed,
            maxAttempts: config.maxAttempts,
            persona: config.aiPersona as any,
            language: existing.language || 'auto',
            customerContext: `Returning to continue an existing session.`,
          }),
          expiresAt: existing.expiredAt.toISOString(),
          attemptsRemaining: Math.max(0, config.maxAttempts - existing.attemptsUsed),
          maxDiscountPercent: Math.round((1 - existingFloor.minPrice / existing.originalPrice) * 100),
          existingSession: true,
        }, { status: 200 })
      }
    }

    const currencySymbol = currencySymbolFor(store.currency)
    const language = data.language && SUPPORTED_LANGUAGES.includes(data.language as any)
      ? data.language
      : (config.language || 'auto')

    const customerContext = await buildCustomerContext(data.storeId, data.customerEmail || null)
    const returning = !!(customerContext && data.customerEmail)

    const ctx: NegotiationContext = {
      storeName: store.name,
      currencySymbol,
      originalPrice,
      minPrice,
      attemptsUsed: 0,
      maxAttempts: config.maxAttempts,
      persona: config.aiPersona as NegotiationContext['persona'],
      productTitle: undefined,
      language,
      customerContext,
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
      const ai = await negotiateStep(ctx, [], "I'm interested in this item", originalPrice, 'opening')
      // Treat negotiation as welcome for opening (don't actually evaluate originalPrice as customer offer)
      openingReply = ai.reply || openingReply
      openingMeta = { source: 'openai', tactic: ai.tactic, sentiment: ai.sentiment }
    } catch (e) {
      // silent — fallback already set
    }

    const [bargainSession] = await prisma.$transaction([
      prisma.bargainSession.create({
        data: {
          storeId: data.storeId,
          cartToken: data.cartToken ?? null,
          shopifyProductId: data.shopifyProductId,
          variantId: data.variantId ?? null,
          customerEmail: data.customerEmail || null,
          customerPhone: data.customerPhone || null,
          originalPrice,
          currentOffer: originalPrice,
          attemptsUsed: 0,
          status: 'active',
          language,
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
      }),
      recordBargainSessionOp(gate.subscriptionId),
    ])

    return NextResponse.json({
      sessionId: bargainSession.id,
      session: bargainSession,
      openingMessage: openingReply,
      expiresAt: expiredAt.toISOString(),
      attemptsRemaining: config.maxAttempts,
      maxDiscountPercent: Math.round((1 - minPrice / originalPrice) * 100),
      returning,
    }, { status: 201 })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_START]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
