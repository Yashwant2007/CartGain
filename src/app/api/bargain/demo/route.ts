import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { BargainConfig as BargainConfigRow } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import {
  negotiateStep,
  ruleBasedDecision,
  chatFallback,
  SUPPORTED_LANGUAGES,
  NEGOTIATION_MODES,
  type Persona,
  type BargainNegotiationMode,
  type NegotiationContext,
  type NegotiationResult,
} from '@/lib/services/bargain'
import { detectLanguage } from '@/lib/bargain/language'
import { buildProductContext } from '@/lib/bargain/product-fetcher'
import {
  buildGoalContextForNegotiation,
  publicGoalView,
} from '@/lib/bargain/goals'
import { analyzeIntent } from '@/lib/bargain/intent'
import type { BargainDemoGoal } from '@/lib/bargain/api-types'

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
// Also returns the merchant's store (catalog facts) and the full BargainConfig
// row so the AI salesperson gets the same daily-goal context as production.
async function resolveMerchantPersona(userId: string): Promise<{
  persona: Persona
  config: BargainConfigRow | null
  store: {
    id: string; domain: string; currency: string; apiKey: string | null
    timezone: string
    shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null
  } | null
}> {
  const store = await prisma.store.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!store) return { persona: 'friendly_shopkeeper', config: null, store: null }
  const config = await prisma.bargainConfig.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id },
    update: {},
  })
  return {
    persona: VALID_PERSONAS.includes(config.aiPersona as Persona)
      ? (config.aiPersona as Persona)
      : 'friendly_shopkeeper',
    config,
    store: {
      id: store.id,
      domain: store.domain,
      currency: store.currency ?? 'INR',
      apiKey: store.apiKey,
      timezone: store.timezone,
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
    // The client reports the number of turns ALREADY completed (0 on the first
    // message). The engine works in 1-based rounds — the live storefront passes
    // `session.attemptsUsed + 1` for exactly the same reason. Without this the
    // first offer lands on round 0, where the pacing schedule sits AT the listed
    // price, so the backend forces the first counter back up to the list — the
    // "₹500 is a bold play! I can bring it down to ₹1000" (on a ₹1000 item)
    // frustration. This one-line alignment makes the embed pace exactly like the
    // real storefront.
    const turnsSent = Math.round(clamp(typeof body.attemptsUsed === 'number' ? body.attemptsUsed : 0, 0, maxAttempts))
    const attemptsUsed = Math.min(maxAttempts, turnsSent + 1)

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

    // Offer-direction read over the replayed history so the demo negotiates on
    // the same serious/not-serious signal as the live storefront.
    const priorCustomerOffers = history
      .filter((m) => m.role === 'customer' && typeof m.offeredPrice === 'number')
      .map((m) => m.offeredPrice as number)
    let customerOfferTrend: NegotiationContext['customerOfferTrend']
    if (offer != null) {
      if (priorCustomerOffers.length === 0) {
        customerOfferTrend = 'new'
      } else {
        const last = priorCustomerOffers[priorCustomerOffers.length - 1]
        customerOfferTrend = offer > last ? 'rising' : offer < last ? 'falling' : 'flat'
      }
    }

    // ── AI salesperson context ───────────────────────────────────────────
    // Real daily-goal state (target, progress, true close time, campaign),
    // the merchant's negotiation mode and the read on this message — exactly
    // what the production storefront feeds the engine. This endpoint is
    // merchant-session gated, so the RESPONSE may additionally carry the
    // internal strategy/mode chip for the merchant's own live preview.
    const goalCtx = merchant.config
      ? await buildGoalContextForNegotiation(
          merchant.config,
          merchant.store?.timezone ?? null,
          new Date(),
        )
      : undefined
    const negotiationMode: BargainNegotiationMode | undefined =
      merchant.config && (NEGOTIATION_MODES as readonly string[]).includes(merchant.config.negotiationMode)
        ? (merchant.config.negotiationMode as BargainNegotiationMode)
        : undefined
    const intentAnalysis = analyzeIntent(message)

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
      customerOfferTrend,
      customerContext: 'Sequential guided product demo on the CartGain site.',
      goal: goalCtx,
      intent: intentAnalysis,
      ...(negotiationMode ? { negotiationMode } : {}),
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

    // When the client has already accepted a deal earlier in this exchange
    // (widget decision state), tell the engine so a follow-up chat confirms
    // the locked deal instead of re-quoting a confusing price or reopening
    // negotiation on a closed exchange.
    const dealAccepted = body.dealAccepted === true
    const acceptedPrice = typeof body.finalPrice === 'number' ? clamp(body.finalPrice, 1, 1_000_000) : undefined
    const ctx2 = dealAccepted ? { ...ctx, dealAccepted, acceptedPrice } : ctx

    let result: NegotiationResult
    try {
      result = await negotiateStep(ctx2, history, message, offer ?? undefined, `demo_${session.user.id}`)
    } catch {
      result = offer != null
        ? ruleBasedDecision(offer, ctx2)
        : { reply: chatFallback(message, ctx2, history.length), decision: 'chat', tactic: 'demo_fallback', sentiment: 'neutral' }
    }

    // Merchant preview: the goal strip shows real progress plus the internal
    // strategy chip driving this turn. publicGoalView is the single redaction
    // point for client payloads; strategy/mode are added ONLY here, behind
    // the merchant session check at the top of this handler.
    const demoGoal: BargainDemoGoal | undefined = goalCtx
      ? {
          ...(publicGoalView(goalCtx)! as NonNullable<BargainDemoGoal>),
          strategy: goalCtx.strategy,
          mode: goalCtx.mode,
        }
      : undefined

    return NextResponse.json({
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer ?? null,
      tactic: result.tactic ?? 'conversational',
      sentiment: result.sentiment ?? 'neutral',
      persona,
      abuse: (result.metadata as any)?.abuse === true,
      goal: demoGoal,
    })
  } catch (err: any) {
    console.error('[BARGAIN_DEMO]', err?.message ?? err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}