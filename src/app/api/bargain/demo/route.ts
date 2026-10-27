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
  computeMinPrice,
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
import { assessCustomerClaims } from '@/lib/bargain/claims'
import { isAbuseStrictness, isNegotiationStyle } from '@/lib/bargain/merchant-modes'
import { enginePersonaFor } from '@/lib/bargain/experience/personality'
import { publishedPersonality } from '@/lib/bargain/experience/config'
import { extractPrice } from '@/lib/bargain/text'
import { fetchShopifyProducts } from '@/lib/shopify'
import {
  searchRecommendations,
  recommendationReason,
  type RecommendationCard,
  type RecommendationContext,
} from '@/lib/bargain/recommendations'
import type { BargainDemoGoal } from '@/lib/bargain/api-types'
import { previewDemoLearning, learningSelectionForClient, recordLearningEvent, loadLearningConfig } from '@/lib/bargain/learning/service'

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
type DemoStore = {
  id: string; name: string; domain: string; currency: string; apiKey: string | null
  platform: string
  timezone: string
  shopifyRefreshToken: string | null; shopifyTokenExpiresAt: Date | null
}

async function resolveMerchantPersona(userId: string): Promise<{
  persona: Persona
  config: BargainConfigRow | null
  store: DemoStore | null
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
      name: store.name,
      domain: store.domain,
      currency: store.currency ?? 'INR',
      apiKey: store.apiKey,
      platform: store.platform,
      timezone: store.timezone,
      shopifyRefreshToken: store.shopifyRefreshToken,
      shopifyTokenExpiresAt: store.shopifyTokenExpiresAt,
    },
  }
}

// GET /api/bargain/demo — demo context for the signed-in merchant: whether a
// Shopify store is connected, its shop domain + currency, and a normalized
// shortlist of the store's REAL products. /demo uses these so "describe this
// product" is answered from the actual catalog, recommendations come from the
// real store, and an accepted deal can mint a real discount code. Any failure
// degrades to an empty list — the page then keeps its built-in demo products.
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    const { store } = await resolveMerchantPersona(session.user.id)
    if (!store || store.platform !== 'shopify') {
      return NextResponse.json({ storeConnected: false, storeName: null, storeDomain: null, currency: 'INR', products: [] })
    }
    const { products, error } = await fetchShopifyProducts(store, { limit: 50 })
    if (error) {
      return NextResponse.json({ storeConnected: false, storeName: store.name, storeDomain: null, currency: store.currency, products: [], error })
    }
    const normalized = (products as any[])
      .map((p) => {
        const variants = Array.isArray(p?.variants) ? p.variants : []
        const v = variants.find((x: any) => x?.available) ?? variants[0]
        const price = v?.price != null ? Number(v.price) : NaN
        const image = Array.isArray(p?.images) && p.images[0]?.src ? String(p.images[0].src) : null
        if (p?.id == null || v?.id == null || !Number.isFinite(price) || price <= 0) return null
        return {
          shopifyProductId: String(p.id),
          variantId: String(v.id),
          title: typeof p.title === 'string' ? p.title.slice(0, 120) : 'Product',
          price,
          image,
          available: v?.available !== false,
        }
      })
      .filter(Boolean)
      .slice(0, 50)
    return NextResponse.json({
      storeConnected: normalized.length > 0,
      storeName: store.name,
      storeDomain: store.domain,
      currency: store.currency,
      products: normalized,
    })
  } catch (err) {
    console.error('[BARGAIN_DEMO_GET]', err)
    return NextResponse.json({ storeConnected: false, storeName: null, storeDomain: null, currency: 'INR', products: [] })
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

    // Real product identity. When the /demo page runs against the merchant's own
    // connected catalog it passes these, which unlocks verified product facts,
    // real store recommendations and a real discount code at accept.
    const shopifyProductId = typeof body.shopifyProductId === 'string' && body.shopifyProductId
      ? body.shopifyProductId
      : null
    const variantId = typeof body.variantId === 'string' && body.variantId ? body.variantId : undefined
    const learningSessionId = typeof body.learningSessionId === 'string' && body.learningSessionId
      ? body.learningSessionId.slice(0, 80)
      : null

    // Verified floor: against a REAL product on the merchant's own Shopify store,
    // derive the floor server-side exactly like the live storefront instead of
    // trusting the client's estimate. The demo is merchant-session gated, so
    // quoting the merchant's own floor back is not a leak.
    if (merchant.store && merchant.store.platform === 'shopify' && shopifyProductId) {
      try {
        const { minPrice: realMin } = await computeMinPrice({
          storeId: merchant.store.id,
          shopifyProductId,
          originalPrice,
          bulkQuantity,
        })
        if (Number.isFinite(realMin) && realMin > 0) minPrice = Math.min(realMin, originalPrice)
      } catch (err: any) {
        console.warn('[BARGAIN_DEMO] floor compute failed, using client estimate', err?.message ?? err)
      }
    }

    // Deterministic read on the customer's message. Computed early because it
    // also gates the defensive offer re-derivation below.
    const intentAnalysis = analyzeIntent(message)

    let offer: number | null = typeof body.offer === 'number' ? body.offer : null
    if (offer != null) {
      offer = clamp(offer, 0, originalPrice)
    }
    // Defensive: a price complaint ("714 is a little too much") is an objection,
    // never an offer — even if a stale client shipped one. When the message is a
    // complaint, re-derive the offer from the text itself: this yields null for a
    // bare complaint, and still finds a genuine bid in a mixed message
    // ("500 is too much, I'll give 450" → 450).
    if (intentAnalysis.priceComplaint) {
      offer = extractPrice(message)
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

    const shopkeeperPersonality = publishedPersonality(merchant.config)

    const ctx: NegotiationContext = {
      storeName,
      currencySymbol,
      originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts,
      persona: enginePersonaFor(shopkeeperPersonality),
      shopkeeperPersonality,
      productTitle,
      bulkQuantity,
      language: effectiveLanguage,
      walkoutTriggered: body.walkoutTriggered === true,
      customerOfferTrend,
      customerContext: 'Sequential guided product demo on the CartGain site.',
      goal: goalCtx,
      intent: intentAnalysis,
      ...(negotiationMode ? { negotiationMode } : {}),
      ...(isNegotiationStyle(merchant.config?.negotiationStyle) ? { negotiationStyle: merchant.config.negotiationStyle } : {}),
      abuseStrictness: isAbuseStrictness(merchant.config?.abuseStrictness) ? merchant.config!.abuseStrictness : 'standard',
    }

    // Real catalog facts for item demos: when the merchant's store + a real
    // Shopify product id are available, quote verified facts (description,
    // vendor, stock) so "describe me this product" is answered from the actual
    // product — not a canned "can't verify" brush-off. Failures degrade to the
    // existing verified-details fallback instead of erroring the turn.
    if (merchant.store && shopifyProductId) {
      try {
        ctx.product = await buildProductContext({
          store: merchant.store,
          storeId: merchant.store.id,
          shopifyProductId,
          variantId,
          currency: merchant.store.currency ?? 'INR',
          baseUrl: `https://${merchant.store.domain}`,
          fallbackTitle: productTitle ?? null,
        })
      } catch (err: any) {
        console.warn('[BARGAIN_DEMO] product-context fetch failed, using verified-details fallback', err?.message ?? err)
      }
    }

    const claims = assessCustomerClaims(body.message, {
      product: ctx.product ?? null,
      originalPrice,
      compareAtPrice: ctx.product?.compareAtPrice ?? null,
      approvedSellingPoints: merchant.config?.approvedSellingPoints ?? [],
      disallowedClaims: merchant.config?.disallowedClaims ?? [],
    })
    ctx.claims = claims
    const demoQuarantined = claims.manipulation

    const learningContextIsReady =
      offer != null ||
      intentAnalysis.budget != null ||
      body.walkoutTriggered === true ||
      [
        'PRICE_ONLY',
        'BUDGET_CONSTRAINT',
        'VALUE_UNCLEAR',
        'COMPARISON',
        'PRODUCT_QUESTION',
        'PRODUCT_MISMATCH',
        'RECOMMENDATION_REQUEST',
        'PRODUCT_DISCOVERY',
        'PURCHASE_READY',
      ].includes(intentAnalysis.intent)

    const learningResolved = merchant.store && learningContextIsReady && !demoQuarantined
      ? await previewDemoLearning({
          storeId: merchant.store.id,
          demoSessionId: learningSessionId,
          context: {
            originalPrice,
            floorPrice: minPrice,
            offer,
            budget: intentAnalysis.budget,
            intent: intentAnalysis.intent,
            objection: intentAnalysis.objection,
            rounds: attemptsUsed,
            maxRounds: maxAttempts,
            recommendationsEnabled: merchant.config?.recommendationsEnabled === true,
            bulkQuantity,
            promoAvailable: Boolean(merchant.config?.campaignMessage),
          },
        })
      : null
    if (learningResolved) ctx.learning = learningResolved.guidance

    if (demoQuarantined && merchant.store) {
      const learningConfig = await loadLearningConfig(merchant.store.id)
      await recordLearningEvent({
        storeId: merchant.store.id,
        sessionId: null,
        environment: 'demo',
        eventType: 'quarantined',
        strategy: 'BASELINE',
        baselineStrategy: 'BASELINE',
        version: learningConfig?.version ?? 'v1',
        contextKey: '__global__',
        mode: 'baseline',
        intent: intentAnalysis.intent,
        objection: intentAnalysis.objection,
        originalPrice,
        floorPrice: minPrice,
        offer,
        dedupeKey: `quarantine:demo:${merchant.store.id}:${learningSessionId ?? 'stateless'}`,
        properties: {
          source: 'demo_claim_assessment',
          claims: claims.claims.map((claim) => ({
            category: claim.category,
            status: claim.status,
            provenance: claim.provenance,
          })),
        },
      })
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

    if (learningResolved) {
      await recordLearningEvent({
        storeId: merchant.store!.id,
        sessionId: null,
        environment: 'demo',
        eventType: 'offer_turn',
        strategy: learningResolved.selection.appliedStrategy,
        baselineStrategy: learningResolved.selection.baselineStrategy,
        version: learningResolved.selection.version,
        contextKey: learningResolved.selection.contextKey,
        mode: learningResolved.selection.mode,
        intent: intentAnalysis.intent,
        objection: intentAnalysis.objection,
        originalPrice,
        floorPrice: minPrice,
        offer,
        budget: intentAnalysis.budget,
        recommendationEligible: learningResolved.selection.features.recommendationEligible,
        value: result.counterOffer ?? null,
        dedupeKey: `turn:demo:${merchant.store!.id}:${learningSessionId ?? 'stateless'}:${history.length}:${result.decision}`,
        properties: {
          decision: result.decision,
          tactic: result.tactic ?? null,
          candidate: learningResolved.selection.strategy,
          exploration: learningResolved.selection.isExploration,
        },
      })
    }

    // ── Product recommendation layer (demo parity) ──
    // The same verified, sanitized catalog cards the live storefront attaches:
    // only when the merchant's store is connected and the master + alternatives
    // toggles are on, and this turn reads as a recovery signal (explicit ask,
    // discovery, an under-floor budget or a lowball). Failures are swallowed —
    // recommendations are a bonus, never a blocker.
    let recommendations: RecommendationCard[] | null = null
    let recommendationContext: RecommendationContext | null = null
    const recoEnabled = merchant.config?.recommendationsEnabled === true
      && merchant.config?.alternativeRecommendationsEnabled === true
    if (recoEnabled && merchant.store) {
      const reason = recommendationReason(
        intentAnalysis.intent,
        (result.metadata as any)?.recommendationsRequested === true,
        intentAnalysis.budget ?? null,
        offer ?? null,
        minPrice,
      )
      if (reason) {
        try {
          const out = await searchRecommendations(
            {
              store: merchant.store,
              shopifyProductId: shopifyProductId ?? '',
              currency: merchant.store.currency,
              budget: intentAnalysis.budget ?? null,
              need: intentAnalysis.need ?? null,
            },
            fetchShopifyProducts,
            originalPrice,
          )
          if (out.cards.length > 0) {
            recommendations = out.cards
            recommendationContext = {
              budget: intentAnalysis.budget ?? null,
              need: intentAnalysis.need ?? null,
              reason,
            }
          }
        } catch (err: any) {
          console.warn('[BARGAIN_DEMO] recommendation fetch failed', err?.message ?? err)
        }
      }
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
      ...(learningResolved ? { learning: learningSelectionForClient(learningResolved.selection), learningSessionId } : {}),
      ...(recommendations && recommendationContext
        ? { recommendations, recommendationContext }
        : {}),
    })
  } catch (err: any) {
    console.error('[BARGAIN_DEMO]', err?.message ?? err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}