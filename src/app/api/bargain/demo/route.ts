import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import {
  negotiateStep,
  ruleBasedDecision,
  chatFallback,
  SUPPORTED_LANGUAGES,
  type Persona,
  type NegotiationContext,
  type NegotiationResult,
} from '@/lib/services/bargain'
import { detectLanguage } from '@/lib/bargain/language'
import { buildProductContext } from '@/lib/bargain/product-fetcher'

export const dynamic = 'force-dynamic'

// POST /api/bargain/demo — OpenAI-powered negotiation for the interactive
// demos (/demo and /s/bargain). Sign-in required; the demos themselves are
// one-time per account (enforced by the pages). Clients keep the session
// history and replay it so this endpoint stays stateless.
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const VALID_PERSONAS: Persona[] = ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend']

// Merchant decides which negotiator the store runs. This is the single source
// of truth: a storefront caller that does not pass an explicit persona — or
// passes personaSource: 'store' — is always pinned to the merchant's saved
// BargainConfig persona, so customers can never pick (or game) the mode.
// Also returns the merchant's store so the demo can quote real catalog facts.
async function resolveMerchantPersona(userId: string): Promise<{ persona: Persona; store: {
  id: string; domain: string; currency: string; apiKey: string | null
  shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null
} | null }> {
  const store = await prisma.store.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!store) return { persona: 'friendly_shopkeeper', store: null }
  const config = await prisma.bargainConfig.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id },
    update: {},
  })
  return {
    persona: VALID_PERSONAS.includes(config.aiPersona as Persona)
      ? (config.aiPersona as Persona)
      : 'friendly_shopkeeper',
    store: {
      id: store.id,
      domain: store.domain,
      currency: store.currency ?? 'INR',
      apiKey: store.apiKey,
      shopifyRefreshToken: store.shopifyRefreshToken,
      shopifyTokenExpiresAt: store.shopifyTokenExpiresAt,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const rate = await checkSimpleRateLimit(`bargain_demo_${session.user.id}`)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many demo requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
      )
    }

    const body = await request.json()

    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''
    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    const originalPrice = typeof body.originalPrice === 'number' ? clamp(body.originalPrice, 1, 1_000_000) : 1000
    let minPrice = typeof body.minPrice === 'number' ? clamp(body.minPrice, 1, originalPrice) : originalPrice * 0.75
    minPrice = Math.min(minPrice, originalPrice)

    const maxAttempts = Math.round(clamp(typeof body.maxAttempts === 'number' ? body.maxAttempts : 3, 1, 10))
    const attemptsUsed = Math.round(clamp(typeof body.attemptsUsed === 'number' ? body.attemptsUsed : 0, 0, maxAttempts))

    // Persona authority: 'store' (storefront preview + real embed) always uses
    // the merchant's config. Marketing /demo may pass an explicit persona to
    // compare versions. Anything else falls back to the merchant's config too.
    const merchant = await resolveMerchantPersona(session.user.id)
    const persona: Persona = VALID_PERSONAS.includes(body.persona) && body.personaSource !== 'store'
      ? body.persona
      : merchant.persona
    const language = typeof body.language === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(body.language.toLowerCase())
      ? body.language.toLowerCase()
      : 'auto'
    // Auto = speak the customer's language. Detect from their latest message and
    // hand the engine an explicit language so the reply mirror is reliable.
    const effectiveLanguage = language !== 'auto' ? language : (detectLanguage(message) ?? 'auto')

    const storeName = typeof body.storeName === 'string' ? body.storeName.slice(0, 60) : 'Lumina Beauty'
    const productTitle = typeof body.productTitle === 'string' ? body.productTitle.slice(0, 120) : undefined
    const currencySymbol = typeof body.currencySymbol === 'string' ? body.currencySymbol.slice(0, 4) : '₹'
    const bulkQuantity = typeof body.bulkQuantity === 'number' ? Math.round(clamp(body.bulkQuantity, 2, 1000)) : undefined

    let offer: number | null = typeof body.offer === 'number' ? body.offer : null
    if (offer != null) {
      offer = clamp(offer, 0, originalPrice)
    }

    // Normalize + bound the replay history
    const history = Array.isArray(body.history)
      ? body.history.slice(-12).map((m: any) => ({
          role: (m?.role === 'ai' ? 'ai' : 'customer') as 'customer' | 'ai',
          content: typeof m?.content === 'string' ? m.content.slice(0, 500) : '',
          offeredPrice: typeof m?.offeredPrice === 'number' ? clamp(m.offeredPrice, 0, 1_000_000) : undefined,
        })).filter((m: { content: string }) => m.content.length > 0)
      : []

    const ctx: NegotiationContext = {
      storeName,
      currencySymbol,
      originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts,
      persona,
      productTitle,
      bulkQuantity,
      language: effectiveLanguage,
      walkoutTriggered: body.walkoutTriggered === true,
      customerContext: 'Sequential guided product demo on the CartGain site.',
    }

    // Real catalog facts for item demos: when the merchant's store + a real
    // Shopify product id are available, quote verified facts (description,
    // vendor, stock) so "describe me this product" is answered from the actual
    // product — not a canned "can't verify" brush-off. Failures degrade to the
    // existing verified-details fallback instead of erroring the turn.
    const shopifyProductId = typeof body.shopifyProductId === 'string' && body.shopifyProductId
      ? body.shopifyProductId
      : null
    if (merchant.store && shopifyProductId) {
      try {
        ctx.product = await buildProductContext({
          store: merchant.store,
          storeId: merchant.store.id,
          shopifyProductId,
          variantId: typeof body.variantId === 'string' ? body.variantId : undefined,
          currency: merchant.store.currency ?? 'INR',
          baseUrl: `https://${merchant.store.domain}`,
          fallbackTitle: productTitle ?? null,
        })
      } catch (err: any) {
        console.warn('[BARGAIN_DEMO] product-context fetch failed, using verified-details fallback', err?.message ?? err)
      }
    }

    let result: NegotiationResult
    try {
      result = await negotiateStep(ctx, history, message, offer ?? undefined, `demo_${session.user.id}`)
    } catch {
      result = offer != null
        ? ruleBasedDecision(offer, ctx)
        : { reply: chatFallback(message, ctx, history.length), decision: 'chat', tactic: 'demo_fallback', sentiment: 'neutral' }
    }

    return NextResponse.json({
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer ?? null,
      tactic: result.tactic ?? 'conversational',
      sentiment: result.sentiment ?? 'neutral',
      persona,
      abuse: (result.metadata as any)?.abuse === true,
    })
  } catch (err: any) {
    console.error('[BARGAIN_DEMO]', err?.message ?? err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}