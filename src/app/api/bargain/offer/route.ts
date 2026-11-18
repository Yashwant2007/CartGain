import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainOfferSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { negotiateStep, ruleBasedDecision, chatFallback, buildOpeningMessage, buildCustomerContext, computeMinPrice, retentionOffer, quotedFloor, type NegotiationContext } from '@/lib/services/bargain'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { detectWalkout, extractQuantity, extractPrice } from '@/lib/bargain/text'
import { assertSessionOwnership, verifySessionToken } from '@/lib/bargain/session-bind'
import { uiText, currencySymbolFor } from '@/lib/bargain/i18n'
import { detectLanguage } from '@/lib/bargain/language'
import { logDataAccess } from '@/lib/data-protection'
import { clampOfferToSafety } from '@/lib/bargain/engine'
import { detectCouponMention, detectMultiProductRequest } from '@/lib/bargain/policy'
import { normalizeShippingConfig, computeShipping, shippingUpsellLine } from '@/lib/bargain/shipping'
import { normalizePaymentConfig, detectPaymentIntent, prepaidSaving } from '@/lib/bargain/payment'
import { buildBundle, validateBundleOffer, allocateDiscount, bundleSummary, type BundleItem } from '@/lib/bargain/bundle'
import { walkoutOutcome } from '@/lib/bargain/negotiation-state'
import { buildGoalContextForNegotiation, publicGoalView } from '@/lib/bargain/goals'
import { analyzeIntent } from '@/lib/bargain/intent'
import { deriveConversationState } from '@/lib/bargain/conversation-state'
import { assessCustomerClaims } from '@/lib/bargain/claims'
import { isAbuseStrictness, isNegotiationStyle } from '@/lib/bargain/merchant-modes'
import { enginePersonaFor } from '@/lib/bargain/experience/personality'
import { publishedPersonality } from '@/lib/bargain/experience/config'
import { buildProductContext } from '@/lib/bargain/product-fetcher'
import {
  searchRecommendations,
  recommendationReason,
  decideRecommendation,
  allowsRecommendations,
  readRecommendationHistory,
  recommendationShownMetadata,
  withRecommendationShown,
  type RecommendationCard,
  type RecommendationReason,
  type RecommendationContext,
  type RecommendationDecision,
} from '@/lib/bargain/recommendations'
import { fetchShopifyProducts } from '@/lib/shopify'
import { toNumericId } from '@/lib/shopify-line-items'
import { issueRetentionDiscount, buildBargainClaimUrl, type IssuedBargainCode } from '@/lib/bargain/purchase'
import { track } from '@/lib/analytics/track'
import { resolveSessionLearning, recordLearningEvent, loadLearningConfig } from '@/lib/bargain/learning/service'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { bargainRequestMetrics } from '@/lib/bargain/request-metrics'
import type { BargainDecision, BargainOfferSuccess } from '@/lib/bargain/api-types'

export const dynamic = 'force-dynamic'

// Respect an explicit store/session language; otherwise detect from the
// customer's current message so the reply matches the language they speak.
function detectedLang(sessionOrConfig: string | null | undefined, customerMessage: string): string {
  if (sessionOrConfig && sessionOrConfig !== 'auto') return sessionOrConfig
  return detectLanguage(customerMessage) ?? 'auto'
}

function finalQuoteFor(session: any, minPrice: number): number {
  const floor = quotedFloor({ minPrice, originalPrice: session.originalPrice })
  const cap = Math.max(floor, session.originalPrice - Math.max(1, session.originalPrice * 0.01))
  const lastAi = [...(Array.isArray(session.messages) ? session.messages : [])].reverse()
    .find((m: any) => m.role === 'ai' && m.offeredPrice != null)
  const offered = lastAi?.offeredPrice ?? session.currentOffer
  if (offered == null) return Math.round(cap * 100) / 100
  return Math.round(Math.min(cap, Math.max(floor, offered)) * 100) / 100
}

function withFinalCode(reply: string, lang: string, retention: IssuedBargainCode, currencySymbol: string): string {
  const price = `${currencySymbol}${retention.finalPrice.toFixed(2)}`
  return `${reply} ${uiText(lang, 'final_code_offer', { price, code: retention.code })}`
}

// Recommendations are surfaced only when BOTH the master toggle and the
// "alternatives" sub-toggle are on (server-side guard; never client-side).
function recoEnabledForMessages(config: Partial<{ recommendationsEnabled: boolean | null; alternativeRecommendationsEnabled: boolean | null }>): boolean {
  return config.recommendationsEnabled === true && config.alternativeRecommendationsEnabled === true
}

const BUNDLE_STOPWORDS = new Set([
  'this', 'that', 'with', 'have', 'want', 'need', 'both', 'them', 'they', 'your', 'yours',
  'please', 'price', 'deal', 'bundle', 'together', 'also', 'plus', 'and', 'the', 'for',
  'can', 'you', 'get', 'give', 'would', 'could', 'about', 'some', 'more', 'less', 'than',
  'what', 'when', 'will', 'make', 'take', 'these', 'those', 'from', 'into', 'over', 'just',
])

/** Significant lowercase tokens from the shopper's message (for title matching). */
function bundleTokens(message: string): string[] {
  return Array.from(
    new Set(
      message
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !BUNDLE_STOPWORDS.has(t)),
    ),
  )
}

function titleMatchesTokens(title: string, tokens: string[]): boolean {
  const t = title.toLowerCase()
  return tokens.some((tok) => t.includes(tok))
}

/**
 * Resolve the DISTINCT products of a requested bundle. Prefers the shopper's
 * own cart (real products + real prices) and also matches products the shopper
 * named against the store catalog. Every item's floor is computed server-side;
 * non-bargainable products are dropped so a bundle can never discount below a
 * merchant floor. Returns null when fewer than two distinct products remain.
 */
async function resolveBundleItems(opts: {
  storeId: string
  store: any
  cartToken: string | null
  anchor: { productId: string; title: string; price: number }
  message: string
}): Promise<BundleItem[] | null> {
  const candidates: { productId: string; variantId?: string | null; title: string; price: number; quantity: number }[] = []
  const seen = new Set<string>()
  const push = (c: { productId?: string | null; variantId?: string | null; title?: string; price?: number; quantity?: number }) => {
    const productId = c.productId ? String(c.productId) : ''
    const price = Number(c.price)
    if (!productId || seen.has(productId) || !Number.isFinite(price) || price <= 0) return
    seen.add(productId)
    candidates.push({
      productId,
      variantId: c.variantId ?? null,
      title: c.title || 'Item',
      price,
      quantity: Math.max(1, Math.floor(c.quantity ?? 1)),
    })
  }

  push({ productId: opts.anchor.productId, title: opts.anchor.title, price: opts.anchor.price, quantity: 1 })

  if (opts.cartToken) {
    try {
      const cart = await prisma.cart.findUnique({
        where: { storeId_cartId: { storeId: opts.storeId, cartId: opts.cartToken } },
        select: { items: true },
      })
      const items = Array.isArray(cart?.items) ? (cart!.items as any[]) : []
      for (const it of items) {
        push({
          productId: toNumericId(it?.productId),
          variantId: toNumericId(it?.variantId) ?? null,
          title: typeof it?.name === 'string' ? it.name : it?.title,
          price: Number(it?.price),
          quantity: Number(it?.quantity) || 1,
        })
      }
    } catch {
      // cart lookup is best-effort; fall through to catalog matching
    }
  }

  const tokens = bundleTokens(opts.message)
  if (tokens.length > 0) {
    try {
      const catalog = await fetchShopifyProducts(opts.store, { limit: 100 })
      for (const p of catalog.products ?? []) {
        const title = String(p?.title ?? '')
        if (!title || !titleMatchesTokens(title, tokens)) continue
        const price = Number(p?.variants?.[0]?.price)
        push({ productId: toNumericId(p?.id) ?? String(p?.id ?? ''), title, price, quantity: 1 })
      }
    } catch {
      // catalog match is best-effort
    }
  }

  if (candidates.length < 2) return null

  const floors = await Promise.all(
    candidates.map((c) =>
      computeMinPrice({ storeId: opts.storeId, shopifyProductId: c.productId, originalPrice: c.price }).catch(() => null),
    ),
  )
  const items: BundleItem[] = []
  candidates.forEach((c, i) => {
    const f = floors[i]
    if (!f || !f.isBargainable) return
    items.push({ ...c, floor: Math.min(f.minPrice, c.price) })
  })

  return items.length >= 2 ? items : null
}

function duplicateTurnMatch(messages: any[], turnId: string): { customer: any; ai: any | null } | null {
  let customerIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role === 'customer' && (message.metadata as any)?.turnId === turnId) {
      customerIndex = i
      break
    }
  }
  if (customerIndex < 0) return null
  const customer = messages[customerIndex]
  const sameTurnAi = [...messages].reverse()
    .find((message: any) => message?.role === 'ai' && (message.metadata as any)?.turnId === turnId)
  const nextMessage = messages[customerIndex + 1]
  const ai = sameTurnAi ?? (nextMessage?.role === 'ai' ? nextMessage : null)
  return { customer, ai }
}

function duplicateTurnPayload(session: any, ai: any | null): BargainOfferSuccess {
  const meta = (ai?.metadata ?? {}) as Record<string, any>
  const decision: BargainDecision =
    meta.decision === 'idle' || meta.decision === 'chat' || meta.decision === 'counter' || meta.decision === 'accept' || meta.decision === 'reject'
      ? meta.decision
      : 'chat'
  const status: string = session.status
  return {
    reply: typeof ai?.content === 'string' ? ai.content : '',
    decision,
    counterOffer: ai?.offeredPrice != null ? Number(ai.offeredPrice) : session.currentOffer ?? null,
    sessionStatus: status,
    sessionId: session.id,
    finalPrice: session.finalPrice ?? null,
    attemptsUsed: session.attemptsUsed,
    duplicateTurn: true,
    ...(status !== 'active' ? { terminal: true } : {}),
    ...(meta.tactic === 'final_offer' || meta.reason === 'budget_spent_but_acceptable' ? { floorReached: true } : {}),
    discountCode: session.discountCode ?? null,
    purchaseUrl: session.purchaseUrl ?? null,
    claimUrl: session.claimToken ? buildBargainClaimUrl(session.claimToken) : null,
  }
}

// POST /api/bargain/offer — customer sends a message, AI responds
export async function POST(request: NextRequest) {
  const endTotal = bargainRequestMetrics.startTimer('offer_total')
  try {
    const rate = await checkSimpleRateLimit(`bargain_offer_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const data = validateOrThrow(bargainOfferSchema, body)
    const turnMetadata = data.turnId ? { turnId: data.turnId } : {}
    const customerOffer = extractPrice(data.message)
    const isWalkout = detectWalkout(data.message)

    const endDbLoad = bargainRequestMetrics.startTimer('offer_db_load')
    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        store: true,
      },
    })
    endDbLoad()

    if (!bargainSession) {
      return NextResponse.json({ message: 'Bargain session not found' }, { status: 404 })
    }

    if (data.turnId) {
      const matchedTurn = duplicateTurnMatch(bargainSession.messages, data.turnId)
      if (matchedTurn) {
        const duplicateOwnership = assertSessionOwnership(bargainSession, {
          customerFingerprint: data.customerFingerprint,
          customerEmail: data.customerEmail,
          cartToken: data.cartToken,
          tokenOk: verifySessionToken(bargainSession.id, data.sessionToken),
        })
        if (!duplicateOwnership.ok) {
          return NextResponse.json({ message: duplicateOwnership.reason }, { status: 403 })
        }
        return NextResponse.json(duplicateTurnPayload(bargainSession, matchedTurn.ai), { status: 200 })
      }
    }

    const recoHistory = readRecommendationHistory(bargainSession.messages)
    if (bargainSession.status !== 'active') {
      const termLang = detectedLang(bargainSession.language, data.message)
      const terminalReplies: Record<string, string> = {
        accepted: uiText(termLang, 'terminal_accepted'),
        rejected: uiText(termLang, 'terminal_rejected'),
        expired: uiText(termLang, 'terminal_expired'),
        abandoned: uiText(termLang, 'terminal_abandoned'),
      }
      return NextResponse.json({
        message: terminalReplies[bargainSession.status] ?? `Session is ${bargainSession.status}. No further messages accepted.`,
        terminal: true,
        status: bargainSession.status,
      }, { status: 409 })
    }
    if (bargainSession.expiredAt < new Date()) {
      await prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: { status: 'expired' },
      })
      return NextResponse.json({ message: 'Session expired' }, { status: 410 })
    }

    // Owner binding — the caller must reproduce at least one of the session's
    // buyer identities (fingerprint / email / cart token). Blocks session
    // hijacking: a stranger with a leaked sessionId can no longer read the
    // transcript, burn attempts, or lock a deal on the real buyer's behalf.
    const ownership = assertSessionOwnership(bargainSession, {
      customerFingerprint: data.customerFingerprint,
      customerEmail: data.customerEmail,
      cartToken: data.cartToken,
      tokenOk: verifySessionToken(bargainSession.id, data.sessionToken),
    })
    if (!ownership.ok) {
      return NextResponse.json({ message: ownership.reason }, { status: 403 })
    }

    const config = await prisma.bargainConfig.findUnique({
      where: { storeId: bargainSession.storeId },
    })
    if (!config || !config.enabled) {
      return NextResponse.json({ message: 'Bargaining disabled' }, { status: 403 })
    }
    if ((config as any).emergencyPaused === true) {
      return NextResponse.json({ message: 'Bargaining is temporarily paused by the merchant.', paused: true }, { status: 503 })
    }

    // §24 Coupon-stacking detection — deterministic classifier on the customer's
    // own words. Never trusted to the AI. `couponsAllowed` defaults to false so
    // a missing/invalid config row fails CLOSED (no stacking).
    const couponMentioned = detectCouponMention(data.message)
    const couponsAllowed = config.couponStackingEnabled === true

    // Audit-log the read of the session's protected customer data (email/phone
    // are consumed when the AI builds the customer context for the reply).
    await logDataAccess({
      actorType: 'system',
      action: 'read',
      resourceType: 'bargain_session',
      resourceId: bargainSession.id,
      purpose: 'price_negotiation_processing',
      metadata: {
        storeId: bargainSession.storeId,
        customerEmail: bargainSession.customerEmail,
        customerPhone: bargainSession.customerPhone,
      },
    })

    // Resolve the negotiation language: honor an explicit session/config
    // language; otherwise detect the customer's language from THIS message so
    // every reply (AI + fixed strings) is spoken in the same language they use.
    // Deliberately NOT persisted back to the session when auto — persisting a
    // detected language would lock the session and break future mirroring.
    const lang = detectedLang(bargainSession.language ?? config.language, data.message)

    // Automated decision-making opt-out (DPDP Act 2023, GDPR Art. 22): end the
    // session without the AI consuming an attempt or responding.
    if (data.message?.trim().toLowerCase() === 'opt-out') {
      await prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: { status: 'abandoned' },
      })
      return NextResponse.json({
        message: uiText(lang, 'opt_out'),
        terminal: true,
        status: 'abandoned',
      }, { status: 200 })
    }

    const currencySymbol = currencySymbolFor(bargainSession.store.currency)

    // Resolve bulk quantity: from this message, or carry over the last known one
    const lastBulk = [...bargainSession.messages].reverse()
      .find((m: any) => (m.metadata as any)?.bulkQuantity)
    const bulkQuantity = extractQuantity(data.message) ?? (lastBulk?.metadata as any)?.bulkQuantity ?? null

    // Has the customer already received a walkout retention offer?
    const hadRetention = bargainSession.messages.some(
      (m: any) => (m.metadata as any)?.tactic === 'walkout_retention'
    )

    // Compute floor price (bulk-aware; reuses shared computeMinPrice with proper defaults)
    const { minPrice } = await computeMinPrice({
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      originalPrice: bargainSession.originalPrice,
      bulkQuantity: bulkQuantity ?? undefined,
    })
    // Fetch product title separately (not part of computeMinPrice)
    const productTitle = await (async () => {
      const p = await prisma.bargainProduct.findUnique({
        where: { storeId_shopifyProductId: { storeId: bargainSession.storeId, shopifyProductId: bargainSession.shopifyProductId } },
        select: { productTitle: true },
      })
      return p?.productTitle ?? undefined
    })()

    // Product intelligence — verified catalog facts the AI is allowed to cite.
    // Deliberately layered AFTER control-flow (walkout/attempts) so the hot path
    // only pays for it when the AI actually speaks. Never returns null: when
    // Shopify is unreachable it degrades to a fetchFailed context that forbids
    // the AI from inventing product facts.
    const endProduct = bargainRequestMetrics.startTimer('offer_product_context')
    const productCtx = await buildProductContext({
      store: bargainSession.store,
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      variantId: bargainSession.variantId ?? null,
      currency: bargainSession.store.currency,
      baseUrl: `https://${bargainSession.store.domain}`,
      fallbackTitle: productTitle ?? null,
    })
    endProduct()

    // Deterministic shopper-intent classification of the current message. Cheap,
    // predictable, and merchant-controlled — the LLM is told about it, it never
    // decides it.
    const intentAnalysis = analyzeIntent(data.message)
    const claimAssessment = assessCustomerClaims(data.message, {
      product: productCtx,
      originalPrice: bargainSession.originalPrice,
      compareAtPrice: productCtx?.compareAtPrice ?? null,
      approvedSellingPoints: config.approvedSellingPoints,
      disallowedClaims: config.disallowedClaims,
    })
    const alreadyQuarantined = Boolean((bargainSession as any).learningQuarantined)
    const learningQuarantined = claimAssessment.manipulation || alreadyQuarantined
    if (claimAssessment.manipulation && !alreadyQuarantined) {
      await (prisma as any).bargainSession.update({
        where: { id: bargainSession.id },
        data: { learningQuarantined: true },
      }).catch(() => {})
      const learningConfig = await loadLearningConfig(bargainSession.storeId)
      await recordLearningEvent({
        storeId: bargainSession.storeId,
        sessionId: bargainSession.id,
        environment: (bargainSession as any).environment === 'demo' ? 'demo' : 'production',
        eventType: 'quarantined',
        strategy: 'BASELINE',
        baselineStrategy: 'BASELINE',
        version: learningConfig?.version ?? 'v1',
        contextKey: '__global__',
        mode: 'baseline',
        intent: intentAnalysis.intent,
        objection: intentAnalysis.objection,
        originalPrice: bargainSession.originalPrice,
        floorPrice: minPrice,
        offer: customerOffer,
        dedupeKey: `quarantine:${bargainSession.id}`,
        properties: {
          source: 'offer_claim_assessment',
          claims: claimAssessment.claims.map((claim) => ({
            category: claim.category,
            status: claim.status,
            provenance: claim.provenance,
          })),
        },
      })
    }

    // ── §27 MULTI-PRODUCT / BUNDLE GUARD ──
    // The negotiation model is strictly single-product (bulk = same SKU). A
    // request for DISTINCT products ("serum and moisturizer together", "bundle
    // deal") must NEVER reach the AI pricing engine — otherwise the LLM could
    // invent a combined bundle price. Intercept deterministically BEFORE the
    // attempt claim (an informational redirect does not burn a negotiation
    // attempt) and keep the session open on THIS product. Falls back to cards
    // for budget-fit alternatives when reco is enabled.
    const bundleRequested = detectMultiProductRequest(data.message)
    if (bundleRequested) {
      // ── §27 BUNDLE NEGOTIATION (Module 6) ──
      // When the merchant opted in, try to resolve the distinct products and
      // mint a deterministic, floor-safe bundle offer. The AI never invents a
      // combined number — the server computes one uniform % that keeps every
      // item at/above its own floor, and Shopify's code is scoped to those
      // products with the full bundle value as the minimum subtotal.
      let bundleOffer: {
        items: ReturnType<typeof allocateDiscount>
        listTotal: number
        offerTotal: number
        discountPercent: number
        currencySymbol: string
        code: string | null
        codeStatus: 'created' | 'pending' | 'failed' | 'none'
      } | null = null

      const bundleEnabled = config.bundleNegotiationEnabled === true
      if (bundleEnabled) {
        try {
          const items = await resolveBundleItems({
            storeId: bargainSession.storeId,
            store: bargainSession.store,
            cartToken: bargainSession.cartToken ?? null,
            anchor: { productId: bargainSession.shopifyProductId, title: productTitle ?? 'Item', price: bargainSession.originalPrice },
            message: data.message,
          })
          if (items) {
            const desiredPct = config.bundleDiscountPercent ?? 10
            const quote = buildBundle(items, { discountPercent: desiredPct })
            if (quote && validateBundleOffer(quote).ok) {
              // A bundled price is a proposal, not an issued deal. No Shopify
              // code exists until the shopper accepts and the server revalidates
              // the floor at that moment; never show a code from a chat turn.
              bundleOffer = {
                items: allocateDiscount(quote.items, quote.offerTotal),
                listTotal: quote.listTotal,
                offerTotal: quote.offerTotal,
                discountPercent: quote.discountPercent,
                currencySymbol,
                code: null,
                codeStatus: 'none',
              }
              await track({
                name: 'cartgain_bundle_offer',
                storeId: bargainSession.storeId,
                properties: { items: quote.items.length, offerTotal: quote.offerTotal, discountPercent: quote.discountPercent },
              })
            }
          }
        } catch {
          bundleOffer = null
        }
      }

      if (bundleOffer) {
        const reply = `Bundle deal: ${bundleSummary(bundleOffer.items.map((a) => ({ productId: a.productId, title: a.title, price: a.listPrice, floor: 0, quantity: a.quantity })), currencySymbol)} — ${currencySymbol}${bundleOffer.offerTotal} (was ${currencySymbol}${bundleOffer.listTotal}, ${bundleOffer.discountPercent}% off).`
        await prisma.$transaction([
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'customer', content: data.message,
              offeredPrice: customerOffer ?? null,
              metadata: { ...turnMetadata, bundleRequested: true, couponMentioned: couponMentioned || undefined } as any,
            },
          }),
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'ai', content: reply,
              metadata: { ...turnMetadata, decision: 'chat', tactic: 'bundle_offer', policy: 'bundle_negotiation', bundleRequested: true } as any,
            },
          }),
        ])
        return NextResponse.json({
          reply,
          decision: 'chat',
          sessionStatus: 'active',
          sessionId: bargainSession.id,
          bundleOffer: {
            items: bundleOffer.items,
            listTotal: bundleOffer.listTotal,
            offerTotal: bundleOffer.offerTotal,
            discountPercent: bundleOffer.discountPercent,
            currencySymbol: bundleOffer.currencySymbol,
            code: bundleOffer.code,
            codeStatus: bundleOffer.codeStatus,
          },
        })
      }

      // Default fallback: redirect to per-item bargaining (preserves prior behaviour).
      let bundleReco: RecommendationCard[] | null = null
      if (recoEnabledForMessages(config) && intentAnalysis.budget != null) {
        try {
          const endBundleReco = bargainRequestMetrics.startTimer('bundle_recommendations')
          const outcome = await searchRecommendations(
            {
              store: bargainSession.store,
              shopifyProductId: bargainSession.shopifyProductId,
              currency: bargainSession.store.currency,
              budget: intentAnalysis.budget,
              need: intentAnalysis.need ?? null,
            },
            fetchShopifyProducts,
            bargainSession.originalPrice,
            {
              history: recoHistory,
              strictBudget: intentAnalysis.budget != null,
              reason: 'budget',
            },
          )
          endBundleReco()
          bundleReco = outcome.cards.length > 0 ? outcome.cards : null
        } catch (e) {
          bundleReco = null
        }
      }
      const reply = couponMentioned
        ? uiText(lang, 'bundle_coupon_redirect')
        : uiText(lang, 'bundle_redirect')

      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'customer', content: data.message,
            offeredPrice: customerOffer ?? null,
            metadata: { ...turnMetadata, bundleRequested: true, couponMentioned: couponMentioned || undefined } as any,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: reply,
            metadata: {
              ...turnMetadata,
              decision: 'chat', tactic: 'bundle_redirect',
              policy: 'multi_product_not_supported', bundleRequested: true,
            } as any,
          },
        }),
      ])
      await track({
        name: 'cartgain_bundle_requested',
        storeId: bargainSession.storeId,
        properties: { budget: intentAnalysis.budget ?? undefined },
      })
      return NextResponse.json({
        reply,
        decision: 'chat',
        sessionStatus: 'active',
        sessionId: bargainSession.id,
        ...(bundleReco
          ? {
              recommendations: bundleReco,
              recommendationContext: {
                budget: intentAnalysis.budget ?? null,
                need: intentAnalysis.need ?? null,
                reason: 'alternative' as RecommendationReason,
              } satisfies RecommendationContext,
            }
          : {}),
      })
    }

    // A turn that names no price is CHAT ("tell me about this product", "I'm a
    // student, it's too expensive"), not a negotiation round. Charging chat
    // against the offer budget is what killed real sessions: with
    // maxAttempts=3, three small-talk messages consumed the whole budget, so
    // the customer's first ACTUAL number arrived to find `attemptsExhausted`
    // and was refused without ever reaching the model. The budget exists to
    // bound negotiation rounds, so only a turn that quotes a price claims one.
    // Small talk is still bounded by the per-IP rate limit at the top of this
    // route (30/min), so this cannot be used to farm free model calls.
    const isOfferTurn = customerOffer != null

    if (isOfferTurn) {
      // Atomic attempt claim — prevents race conditions from concurrent requests
      const claimResult = await prisma.bargainSession.updateMany({
        where: {
          id: bargainSession.id,
          status: 'active',
          attemptsUsed: bargainSession.attemptsUsed,
        },
        data: { attemptsUsed: { increment: 1 } },
      })
      if (claimResult.count === 0) {
        // Another request already claimed this attempt or status changed
        const refreshed = await prisma.bargainSession.findUnique({ where: { id: bargainSession.id }, select: { status: true, attemptsUsed: true } })
        if (!refreshed || refreshed.status !== 'active') {
          return NextResponse.json({ message: `Session is ${refreshed?.status ?? 'gone'}.`, terminal: true, status: refreshed?.status }, { status: 409 })
        }
        return NextResponse.json({ message: 'Too fast — someone else just used this attempt. Please try again.', terminal: false }, { status: 429 })
      }
    }

    const attemptsUsed = isOfferTurn ? bargainSession.attemptsUsed + 1 : bargainSession.attemptsUsed
    const attemptsRemaining = Math.max(0, config.maxAttempts - attemptsUsed)
    const attemptsExhausted = isOfferTurn && attemptsUsed >= config.maxAttempts

    if (attemptsExhausted && attemptsRemaining <= 0) {
      // The budget is spent, but the customer just put a NUMBER on the table and
      // it still has to be judged. Refusing blind threw away sales: a shopper on
      // their last round who offered ABOVE the floor got "you've used all your
      // attempts" instead of a deal. So we evaluate deterministically (no model
      // call — the budget is the cost bound) and either close at their number
      // or refuse with one last, genuinely final counter.
      if (customerOffer != null && customerOffer >= minPrice) {
        const finalPrice = Math.round(Math.min(customerOffer, bargainSession.originalPrice) * 100) / 100
        const acceptReply =
          `Done! ${currencySymbol}${finalPrice.toFixed(2)} works for me — that's my last round, so let's lock it in. Tap "Accept" and your discount code is generated.`
        await prisma.$transaction([
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer,
              metadata: { ...turnMetadata } as any,
            },
          }),
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'ai', content: acceptReply, offeredPrice: finalPrice,
              metadata: { ...turnMetadata, decision: 'accept', tactic: 'accept_final_round', reason: 'budget_spent_but_acceptable' } as any,
            },
          }),
          prisma.bargainSession.update({
            where: { id: bargainSession.id },
            // Stay ACTIVE: the engine "accept" is a proposal the shopper still
            // has to confirm. Only POST /api/bargain/accept mints the code and
            // closes the session.
            data: { status: 'active', currentOffer: finalPrice, finalPrice },
          }),
        ])
        return NextResponse.json({
          reply: acceptReply,
          decision: 'accept',
          counterOffer: finalPrice,
          finalPrice,
          sessionStatus: 'active',
          sessionId: bargainSession.id,
          floorReached: true,
          attemptsUsed,
        })
      }

      const finalQuote = finalQuoteFor(bargainSession, minPrice)
      const retention = await issueRetentionDiscount(bargainSession.id, finalQuote).catch(() => null)
      const rejectReply = retention
        ? withFinalCode(uiText(lang, 'attempts_exhausted'), lang, retention, currencySymbol)
        : `${uiText(lang, 'attempts_exhausted')} ${uiText(lang, 'farewell_friendly')}`
      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null,
            metadata: { ...turnMetadata } as any,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: rejectReply,
            metadata: { ...turnMetadata, tactic: 'reject_graceful', reason: 'attempts_exhausted', ...(retention ? { discountCode: retention.code } : {}) } as any,
          },
        }),
        prisma.bargainSession.update({
          where: { id: bargainSession.id },
          data: { status: 'rejected', currentOffer: customerOffer ?? bargainSession.currentOffer },
        }),
      ])
      return NextResponse.json({
        reply: rejectReply,
        decision: 'reject',
        sessionStatus: 'rejected',
        attemptsUsed,
        discountCode: retention?.code ?? null,
        finalPrice: retention?.finalPrice ?? null,
        purchaseUrl: retention?.purchaseUrl ?? null,
        claimUrl: bargainSession.claimToken ? buildBargainClaimUrl(bargainSession.claimToken) : null,
      })
    }

    // Deterministic offer-direction read over this same buyer's earlier turns.
    // The engine uses it to reward real upward movement and to HOLD against a
    // repeated lowball instead of folding — the difference between a salesman
    // and a vending machine.
    const priorCustomerOffers = bargainSession.messages
      .filter((m: any) => m.role === 'customer' && m.offeredPrice != null)
      .map((m: any) => m.offeredPrice as number)
    let customerOfferTrend: NegotiationContext['customerOfferTrend']
    if (customerOffer != null) {
      if (priorCustomerOffers.length === 0) {
        customerOfferTrend = 'new'
      } else {
        const last = priorCustomerOffers[priorCustomerOffers.length - 1]
        customerOfferTrend = customerOffer > last ? 'rising' : customerOffer < last ? 'falling' : 'flat'
      }
    }

    // Daily-goal context, computed once: the engine uses it for strategy-aware
    // replies, and the SAME context is projected (strategy/mode redacted via
    // publicGoalView) into the response so the widget's goal strip tracks real
    // progress each turn.
    const goalCtx = await buildGoalContextForNegotiation(config, bargainSession.store.timezone, new Date())

    const learningContextIsReady =
      customerOffer != null ||
      intentAnalysis.budget != null ||
      isWalkout ||
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

    // Module 8 — emergency "Pause AI agent" keeps negotiation alive on the
    // deterministic rule engine only. It never calls a provider, so it is safe
    // when a merchant needs to stop AI spend or a misbehaving model instantly.
    const aiPaused = (config as any).aiPaused === true
    const runNegotiationStep = async (
      negotiationCtx: NegotiationContext,
      negotiationHistory: typeof history,
      message: string,
      offer: number | undefined,
    ) => {
      const endAi = bargainRequestMetrics.startTimer(aiPaused ? 'reflex_turn' : 'ai_turn')
      try {
        if (!aiPaused) {
          return await negotiateStep(negotiationCtx, negotiationHistory, message, offer, bargainSession.id)
        }
        if (offer != null) {
          const ruled = ruleBasedDecision(offer, negotiationCtx)
          return {
            ...ruled,
            metadata: { ...(ruled.metadata ?? {}), aiSource: 'reflex', aiFallbackReason: 'merchant_paused_ai' },
          }
        }
        return {
          reply: chatFallback(message, negotiationCtx, negotiationHistory.length),
          decision: 'chat' as const,
          tactic: 'conversational' as const,
          sentiment: 'neutral' as const,
          metadata: { aiSource: 'reflex', aiFallbackReason: 'merchant_paused_ai' },
        }
      } finally {
        endAi()
      }
    }

    // Module 7 / Phase 14 — real holdout experiment. When the dual-agent flag is
    // on, the deterministic `control` arm keeps the baseline engine (no learning
    // guidance, no ±5% nudge) while `treatment` gets the learning layer. With the
    // flag off nothing changes, so this is a safe, reversible A/B switch.
    const dualAgentExperiment = isFeatureEnabled('BARGAIN_DUAL_AGENT')
    const holdoutControl = dualAgentExperiment && (bargainSession as any).experimentArm === 'control'
    const learningResolved = !learningContextIsReady || learningQuarantined || holdoutControl
      ? null
      : await resolveSessionLearning({
      session: {
        id: bargainSession.id,
        storeId: bargainSession.storeId,
        environment: (bargainSession as any).environment === 'demo' ? 'demo' : 'production',
        learningQuarantined,
        learningStrategy: (bargainSession as any).learningStrategy ?? null,
        learningStrategyVersion: (bargainSession as any).learningStrategyVersion ?? null,
        learningContextKey: (bargainSession as any).learningContextKey ?? null,
        learningMode: (bargainSession as any).learningMode ?? null,
        learningShadowStrategy: (bargainSession as any).learningShadowStrategy ?? null,
        learningMaxRounds: (bargainSession as any).learningMaxRounds ?? null,
      },
      storeId: bargainSession.storeId,
      environment: (bargainSession as any).environment === 'demo' ? 'demo' : 'production',
      context: {
        originalPrice: bargainSession.originalPrice,
        floorPrice: minPrice,
        offer: customerOffer,
        budget: intentAnalysis.budget,
        intent: intentAnalysis.intent,
        objection: intentAnalysis.objection,
        rounds: attemptsUsed,
        maxRounds: config.maxAttempts,
        recommendationsEnabled: recoEnabledForMessages(config),
        bulkQuantity,
        promoAvailable: Boolean(config.campaignMessage),
      },
    })

    const shopkeeperPersonality = publishedPersonality(config)

    // Shipping-aware negotiation (Module 4) — merchant's public shipping rule
    // only (never the floor). Off unless the merchant enabled it.
    const shippingConfig = normalizeShippingConfig(config)

    // Payment-method awareness (Module 5) — reuse the merchant's existing RTO /
    // payment settings (read-only; no row is created on this public path). The
    // prepaid lever is public; the floor is not, and the engine clamp still owns it.
    const merchantConfig = await prisma.merchantConfig.findUnique({
      where: { storeId: bargainSession.storeId },
      select: { rtoReductionEnabled: true, rtoIncentive: true },
    })
    const paymentConfig = normalizePaymentConfig({
      paymentAwareEnabled: config.paymentAwareEnabled,
      prepaidIncentivePercent: config.prepaidIncentivePercent,
      rtoReductionEnabled: merchantConfig?.rtoReductionEnabled,
      rtoIncentive: merchantConfig?.rtoIncentive,
    })
    const paymentIntent = detectPaymentIntent(
      data.message,
      bargainSession.messages.filter((m: any) => m.role === 'customer').map((m: any) => m.content as string),
    )

    const ctx: NegotiationContext = {
      storeName: bargainSession.store.name,
      currencySymbol,
      originalPrice: bargainSession.originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts: config.maxAttempts,
      persona: enginePersonaFor(shopkeeperPersonality),
      shopkeeperPersonality,
      aiModel: config.aiModel ?? undefined,
      productTitle,
      bulkQuantity: bulkQuantity ?? undefined,
      walkoutTriggered: isWalkout,
      language: lang,
      customerContext: await buildCustomerContext(bargainSession.storeId, {
        customerEmail: bargainSession.customerEmail,
        customerFingerprint: bargainSession.customerFingerprint,
        cartToken: bargainSession.cartToken,
      }),
      customerOfferTrend,
      goal: goalCtx,
      product: productCtx,
      intent: intentAnalysis,
      claims: claimAssessment,
      negotiationMode: (config.negotiationMode as NegotiationContext['negotiationMode']) ?? 'balanced',
      ...(isNegotiationStyle(config.negotiationStyle) ? { negotiationStyle: config.negotiationStyle } : {}),
      abuseStrictness: isAbuseStrictness(config.abuseStrictness) ? config.abuseStrictness : 'standard',
      couponsAllowed,
      recommendationsEnabled: recoEnabledForMessages(config),
      ...(learningResolved ? { learning: learningResolved.guidance } : {}),
      ...(shippingConfig.enabled ? { shipping: shippingConfig } : {}),
      ...(paymentConfig.enabled ? { payment: { intent: paymentIntent, config: paymentConfig } } : {}),
    }

    const history = bargainSession.messages
      .filter((m: any) => m.role === 'customer' || m.role === 'ai')
      .map((m: any) => ({
        role: (m.role === 'customer' ? 'customer' : 'ai') as 'customer' | 'ai',
        content: m.content,
        offeredPrice: m.offeredPrice ?? undefined,
      }))

    // ── WALKOUT HANDLING ──
    if (isWalkout) {
      // Last known AI counter (most recent ai message with offeredPrice)
      const lastCounter = [...bargainSession.messages].reverse()
        .find((m: any) => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null

      if (walkoutOutcome({ hadRetention, attemptsRemaining }) === 'abandon') {
        // Second walkout OR no attempts left → close the session (abandoned)
        const farewellReplies: Record<string, string> = {
          friendly_shopkeeper: uiText(lang, 'farewell_friendly'),
          strict_negotiator: uiText(lang, 'farewell_strict'),
          playful_friend: uiText(lang, 'farewell_playful'),
        } as Record<string, string>
        const baseFarewell = farewellReplies[ctx.persona] ?? farewellReplies.friendly_shopkeeper
        const finalQuote = finalQuoteFor(bargainSession, minPrice)
        const retention = await issueRetentionDiscount(bargainSession.id, lastCounter ?? finalQuote).catch(() => null)
        const farewell = retention
          ? withFinalCode(baseFarewell, lang, retention, currencySymbol)
          : baseFarewell
        await prisma.$transaction([
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null,
              metadata: { ...turnMetadata } as any,
            },
          }),
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'ai', content: farewell,
              metadata: { ...turnMetadata, tactic: 'walkout_final', reason: hadRetention ? 'second_walkout' : 'no_attempts_left', ...(retention ? { discountCode: retention.code } : {}) } as any,
            },
          }),
          prisma.bargainSession.update({
            where: { id: bargainSession.id },
            data: { status: 'abandoned', currentOffer: customerOffer ?? bargainSession.currentOffer },
          }),
        ])
        return NextResponse.json({
          reply: farewell,
          decision: 'reject',
          sessionStatus: 'abandoned',
          terminal: true,
          discountCode: retention?.code ?? null,
          finalPrice: retention?.finalPrice ?? null,
          purchaseUrl: retention?.purchaseUrl ?? null,
          claimUrl: bargainSession.claimToken ? buildBargainClaimUrl(bargainSession.claimToken) : null,
        })
      }

      // First walkout → retention offer (one meaningful extra concession)
      const retentionResult = await runNegotiationStep(ctx, history, data.message, customerOffer ?? undefined)
      // Deterministic final safety validator: whatever the negotiation produced,
      // the price actually offered is clamped into [minPrice, originalPrice].
      const retentionPrice = clampOfferToSafety({
        originalPrice: bargainSession.originalPrice,
        minPrice,
        suggested:
          retentionResult.counterOffer ??
          retentionOffer(ctx, lastCounter).counterOffer ??
          quotedFloor({ minPrice, originalPrice: bargainSession.originalPrice }),
      })
      const retentionReply = retentionResult.reply || retentionOffer(ctx, lastCounter).reply

      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'customer', content: data.message,
            offeredPrice: customerOffer ?? null,
            metadata: { ...turnMetadata, bulkQuantity } as any,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: retentionReply,
            offeredPrice: retentionPrice,
            metadata: { ...turnMetadata, decision: 'counter', tactic: 'walkout_retention', sentiment: 'urgent' } as any,
          },
        }),
        prisma.bargainSession.update({
          where: { id: bargainSession.id },
          data: { currentOffer: customerOffer ?? bargainSession.currentOffer },
        }),
      ])
      return NextResponse.json({
        reply: retentionReply,
        decision: 'counter',
        counterOffer: retentionPrice,
        sessionStatus: 'active',
        sessionId: bargainSession.id,
        // The retention turn still consumed an attempt — report it so the UI
        // round meter stays in step with the server.
        attemptsUsed,
      })
    }

    // ── NORMAL NEGOTIATION (incl. bulk) ──
    const result = await runNegotiationStep(ctx, history, data.message, customerOffer ?? undefined)
    const resultMeta = (result.metadata ?? {}) as Record<string, any>
    const aiSource =
      typeof resultMeta.aiSource === 'string' && resultMeta.aiSource
        ? resultMeta.aiSource
        : 'emergency'
    const aiModel = typeof resultMeta.aiModel === 'string' ? resultMeta.aiModel : null
    const aiLatencyMs =
      typeof resultMeta.aiTotalLatencyMs === 'number'
        ? resultMeta.aiTotalLatencyMs
        : typeof resultMeta.aiLatencyMs === 'number'
          ? resultMeta.aiLatencyMs
          : null
    const aiFailure =
      typeof resultMeta.failureCategory === 'string'
        ? resultMeta.failureCategory
        : typeof resultMeta.aiFallbackReason === 'string'
          ? resultMeta.aiFallbackReason
          : null

    // If abuse was detected and doesn't consume an attempt, don't count it.
    // Only meaningful on an offer turn: a chat turn never incremented, so
    // "rolling back" would corrupt the counter downward.
    const isAbuseNoConsume = isOfferTurn &&
      (result.metadata as any)?.abuse === true &&
      (result.metadata as any)?.consumeAttempt === false

    // An absurd offer (a joke number far below the floor) earns a persona reply
    // but is NOT a serious negotiation round, so it must not burn the customer's
    // attempt budget — that is what turned "₹5 … ₹2" into "you've reached the
    // limit" in a real session. It is safe to roll back: absurd offers are
    // short-circuited before any model call, so this cannot farm free AI usage.
    const isAbsurdNoConsume = isOfferTurn && (result.metadata as any)?.absurdOffer === true

    const isNoConsumeTurn = isAbuseNoConsume || isAbsurdNoConsume

    // An engine "accept" is the shopkeeper MEETING the shopper's number and
    // inviting them to confirm — not a closed sale. The session stays ACTIVE so
    // the shopper's tap can reach POST /api/bargain/accept, the only path that
    // mints the discount code. Marking it 'accepted' here stranded the deal with
    // no code (the accept route can only claim an active session).
    const sessionStatus: string =
      result.decision === 'reject' ? 'rejected' : 'active'

    // Roll back the attempt if the turn doesn't consume it
    const effectiveAttemptsUsed = isNoConsumeTurn ? attemptsUsed - 1 : attemptsUsed

    if (isNoConsumeTurn) {
      await prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: { attemptsUsed: { decrement: 1 } },
      })
    }

    // Deterministic final safety validator — the offer the customer is actually
    // shown is always within [minPrice, originalPrice] regardless of AI output.
    const safeCounter =
      result.decision === 'chat' || result.counterOffer == null
        ? null
        : clampOfferToSafety({
            originalPrice: bargainSession.originalPrice,
            minPrice,
            suggested: result.counterOffer,
          })

    // Funnel analytics (prod-only; fire-and-forget inserts, never customer
    // message content). Record the deterministic intent/objection signals and
    // any below-floor offers so the merchant sees negotiation behavior.
    // Fired concurrently — `track` inserts are independent, so awaiting them in
    // parallel keeps the customer reply off the critical path's sum of round-trips.
    const analyticsEvents: Promise<void>[] = []
    if (intentAnalysis.intent !== 'UNKNOWN' && intentAnalysis.intent !== 'GENERIC_CHAT') {
      analyticsEvents.push(track({
        name: 'cartgain_intent_detected',
        storeId: bargainSession.storeId,
        properties: { intent: intentAnalysis.intent },
      }))
    }
    if (intentAnalysis.objection) {
      analyticsEvents.push(track({
        name: 'cartgain_objection_detected',
        storeId: bargainSession.storeId,
        properties: { objection: intentAnalysis.objection },
      }))
    }
    if (intentAnalysis.intent === 'PRODUCT_QUESTION') {
      analyticsEvents.push(track({
        name: 'cartgain_product_question',
        storeId: bargainSession.storeId,
        properties: { hasVerifiedContext: productCtx.fetchFailed === false && productCtx.description.length > 0 },
      }))
    }
    if (customerOffer != null && customerOffer < minPrice) {
      analyticsEvents.push(track({
        name: 'cartgain_offer_below_floor',
        storeId: bargainSession.storeId,
        properties: {},
      }))
    }
    // §36 funnel analytics — every priced turn + the negotiation round counter.
    if (customerOffer != null) {
      analyticsEvents.push(track({
        name: 'cartgain_customer_offer',
        storeId: bargainSession.storeId,
        properties: { aboveFloor: customerOffer >= minPrice },
      }))
      analyticsEvents.push(track({
        name: 'cartgain_negotiation_round',
        storeId: bargainSession.storeId,
        properties: { round: attemptsUsed, remaining: attemptsRemaining },
      }))
    }
    // §24 — a coupon mention when stacking is disabled is a policy-relevant
    // signal worth seeing, even though the offer itself stays live (the ACCEPT
    // layer enforces the block).
    if (couponMentioned && !couponsAllowed) {
      analyticsEvents.push(track({
        name: 'cartgain_coupon_stack_attempt_detected',
        storeId: bargainSession.storeId,
        properties: {},
      }))
    }
    if (aiSource === 'fallback' || aiSource === 'emergency') {
      analyticsEvents.push(track({
        name: 'cartgain_ai_fallback',
        storeId: bargainSession.storeId,
        properties: {
          source: aiSource,
          failure: aiFailure,
          model: aiModel,
          latencyMs: aiLatencyMs,
        },
      }))
    }
    await Promise.all(analyticsEvents)
    // §36 — terminal negotiation outcomes from THIS turn.
    if (result.decision === 'accept') {
      await track({
        name: 'cartgain_offer_approved',
        storeId: bargainSession.storeId,
        properties: {},
      })
    } else if (result.decision === 'reject') {
      await track({
        name: 'cartgain_offer_rejected',
        storeId: bargainSession.storeId,
        properties: { reason: (result.metadata as any)?.reason ?? 'ai_rejected' },
      })
    }

    // ── PRODUCT RECOMMENDATION LAYER ──
    // When the store enables it AND this turn reads as a recovery signal (an
    // explicit ask for alternatives, product discovery, a budget that sits under
    // the floor, or a lowball), attach REAL, verified catalog cards to the reply.
    // Cards are built server-side from Shopify and sanitized so no merchant
    // financial secret (floor / margin / max discount) ever reaches the customer.
    let recommendations: RecommendationCard[] | null = null
    let recoReason: RecommendationReason | null = null
    let recoDecision: RecommendationDecision = 'DO_NOT_RECOMMEND'
    let recommendationHistory = recoHistory
    const recoEnabled = recoEnabledForMessages(config)

    if (intentAnalysis.budget != null) {
      await track({
        name: 'cartgain_budget_detected',
        storeId: bargainSession.storeId,
        properties: {
          budget: intentAnalysis.budget,
          budgetType: intentAnalysis.budgetType ?? undefined,
          aboveFloor: intentAnalysis.budget >= minPrice,
        },
      })
    }
    if (intentAnalysis.need != null) {
      await track({
        name: 'cartgain_need_detected',
        storeId: bargainSession.storeId,
        properties: { need: intentAnalysis.need },
      })
    }

    if (recoEnabled) {
      const budget = intentAnalysis.budget ?? null
      const eligibility = decideRecommendation({
        intent: intentAnalysis,
        message: data.message,
        sessionStatus,
        engineDecision: result.decision,
        walkout: isWalkout,
        acceptingDeal: result.decision === 'accept' || sessionStatus === 'accepted',
        purchased: false,
        budget,
        minPrice,
      })
      recoDecision = eligibility.decision
      if (allowsRecommendations(recoDecision)) {
        const aiRequested = (result.metadata as any)?.recommendationsRequested === true
        recoReason = eligibility.decision === 'SHOW_COMPLEMENTARY_PRODUCT'
          ? 'complementary'
          : recommendationReason(intentAnalysis.intent, aiRequested, budget, customerOffer, minPrice)
        if (!recoReason && eligibility.decision === 'RECOMMEND_ALTERNATIVES') {
          recoReason = budget != null ? 'budget' : 'requested'
        }
      }
      if (recoReason) {
        const similarProductRaw = !productCtx || productCtx.fetchFailed ? null : {
          id: bargainSession.shopifyProductId,
          title: productCtx.title,
          product_type: productCtx.productType,
          vendor: productCtx.vendor,
          tags: (productCtx.tags ?? []).join(','),
          status: 'active',
          variants: (productCtx.variants ?? []).map((v) => ({
            id: v.variantId,
            title: v.title,
            price: v.price,
            available: v.available,
          })),
        }
        const endRecommendations = bargainRequestMetrics.startTimer('recommendations')
        const outcome = await searchRecommendations(
          {
            store: bargainSession.store,
            shopifyProductId: bargainSession.shopifyProductId,
            currency: bargainSession.store.currency,
            budget,
            need: intentAnalysis.need ?? null,
          },
          fetchShopifyProducts,
          bargainSession.originalPrice,
          {
            history: recoHistory,
            strictBudget: budget != null,
            objection: intentAnalysis.objection,
            similarProductRaw,
            reason: recoReason,
            limit: 2,
          },
        )
        endRecommendations()
        recommendations = outcome.cards.length > 0 ? outcome.cards : null
        if (recommendations) {
          recommendationHistory = withRecommendationShown(recoHistory, {
            productIds: recommendations.map((card) => card.productId),
            reason: recoReason,
            decision: recoDecision,
          })
          await track({
            name: 'cartgain_recommendation_requested',
            storeId: bargainSession.storeId,
            properties: {
              reason: recoReason,
              decision: recoDecision,
              budget: budget ?? undefined,
              need: intentAnalysis.need ?? undefined,
            },
          })
          await track({
            name: 'cartgain_recommendation_shown',
            storeId: bargainSession.storeId,
            properties: {
              count: recommendations.length,
              reason: recoReason,
              decision: recoDecision,
              truncated: outcome.truncated,
            },
          })
        }
      }
    }

    const recommendationMetadata = recommendations && recoReason
      ? recommendationShownMetadata({
          productIds: recommendations.map((card) => card.productId),
          reason: recoReason,
          decision: recoDecision,
        })
      : {}

    let customerReply = result.reply
    let terminalRetention: IssuedBargainCode | null = null
    if (sessionStatus === 'rejected') {
      const finalQuote = finalQuoteFor(bargainSession, minPrice)
      terminalRetention = await issueRetentionDiscount(bargainSession.id, safeCounter ?? finalQuote).catch(() => null)
      customerReply = terminalRetention
        ? withFinalCode(result.reply, lang, terminalRetention, currencySymbol)
        : `${result.reply} ${uiText(lang, 'farewell_friendly')}`
    }

    const [customerMsg, aiMsg, updatedSession] = await prisma.$transaction([
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id, role: 'customer', content: data.message,
          offeredPrice: customerOffer ?? null,
          metadata: {
            ...turnMetadata,
            ...(bulkQuantity ? { bulkQuantity } : {}),
            ...(couponMentioned ? { couponMentioned: true } : {}),
            ...(paymentConfig.enabled && paymentIntent !== 'unknown' ? { paymentIntent } : {}),
          } as any,
        },
      }),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id, role: 'ai', content: customerReply,
          // Financial safety: a pure-chat reply (no AI counter) must NOT
          // persist `offeredPrice` — otherwise `minPrice` would be written as an
          // accept-able offer and the customer could lock the floor without the
          // AI ever offering it. Only real counters (decision counter/accept)
          // carry an offeredPrice.
          offeredPrice: safeCounter,
          metadata: { ...turnMetadata, decision: result.decision, tactic: result.tactic, sentiment: result.sentiment, ...(result.metadata ?? {}), ...(terminalRetention ? { discountCode: terminalRetention.code } : {}), ...recommendationMetadata } as any,
        },
      }),
      prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: {
          currentOffer: customerOffer ?? bargainSession.currentOffer,
          status: sessionStatus,
          finalPrice: result.decision === 'accept' ? (safeCounter ?? customerOffer ?? bargainSession.currentOffer) : null,
          lastAiSource: aiSource,
          lastAiModel: aiModel,
          lastAiFailure: aiFailure,
        },
      }),
    ])

    if (learningResolved) {
      await recordLearningEvent({
        storeId: bargainSession.storeId,
        sessionId: bargainSession.id,
        environment: (bargainSession as any).environment === 'demo' ? 'demo' : 'production',
        eventType: 'offer_turn',
        strategy: learningResolved.selection.appliedStrategy,
        baselineStrategy: learningResolved.selection.baselineStrategy,
        version: learningResolved.selection.version,
        contextKey: learningResolved.selection.contextKey,
        mode: learningResolved.selection.mode,
        intent: intentAnalysis.intent,
        objection: intentAnalysis.objection,
        originalPrice: bargainSession.originalPrice,
        floorPrice: minPrice,
        offer: customerOffer,
        budget: intentAnalysis.budget,
        recommendationEligible: learningResolved.selection.features.recommendationEligible,
        value: safeCounter,
        dedupeKey: `turn:${bargainSession.id}:${bargainSession.messages.filter((m: any) => m.role === 'customer' || m.role === 'ai').length}:${result.decision}`,
        properties: {
          decision: result.decision,
          tactic: result.tactic ?? null,
          counterOffer: safeCounter,
          candidate: learningResolved.selection.strategy,
          exploration: learningResolved.selection.isExploration,
        },
        agentSource: aiSource,
        agentModel: aiModel,
        latencyMs: aiLatencyMs,
        failureCategory: aiFailure,
      })
    }

    // Shipping transparency (Module 4) — deterministic total + truthful
    // free-shipping value-add for the widget, computed from the standing price.
    // Never carries the floor. Omitted entirely when the feature is off.
    const shippingView = shippingConfig.enabled
      ? (() => {
          const quote = computeShipping({
            config: shippingConfig,
            unitPrice: safeCounter ?? customerOffer ?? bargainSession.originalPrice,
            quantity: bulkQuantity ?? 1,
          })
          return { ...quote, upsell: shippingUpsellLine(quote, currencySymbol, { config: shippingConfig }) }
        })()
      : null

    const conversationState = deriveConversationState({
      sessionStatus,
      attemptsUsed: effectiveAttemptsUsed,
      dealAccepted: result.decision === 'accept' || sessionStatus === 'accepted',
      intent: intentAnalysis.intent,
      objection: intentAnalysis.objection,
      offersPriceSignal: intentAnalysis.offersPriceSignal,
      recommendationsEnabled: recoEnabledForMessages(config),
    })

    return NextResponse.json({
      reply: customerReply,
      decision: result.decision,
      counterOffer: safeCounter,
      conversationState,
      sessionStatus,
      finalPrice: updatedSession.finalPrice,
      ...(terminalRetention
        ? {
            discountCode: terminalRetention.code,
            finalPrice: terminalRetention.finalPrice,
            purchaseUrl: terminalRetention.purchaseUrl,
            claimUrl: bargainSession.claimToken ? buildBargainClaimUrl(bargainSession.claimToken) : null,
          }
        : {}),
      sessionId: bargainSession.id,
      // §10 floor-reached: backend-determined, boolean-only. Tells the UI the
      // AI just presented its best (= last) price so the customer gets a
      // "Final offer" frame. NEVER carries the floor amount itself; the client
      // cannot compute or alter it.
      floorReached: result.tactic === 'final_offer',
      // Rounds spent, straight from the session row. A COUNT only — the UI
      // renders it as a round meter. It is the post-transaction value, so an
      // abuse turn that was rolled back below is reported correctly.
      attemptsUsed: effectiveAttemptsUsed,
      goal: publicGoalView(goalCtx),
      ...(shippingView ? { shipping: shippingView } : {}),
      ...(paymentConfig.enabled
        ? { payment: { intent: paymentIntent, prepaidSaving: prepaidSaving(paymentConfig) } }
        : {}),
      ...(isAbuseNoConsume ? { abuseDetected: true, abuseCategory: (result.metadata as any)?.category } : {}),
      ...(recoEnabled
        ? {
            recommendationDecision: recoDecision,
            recommendationHistory,
          }
        : {}),
      ...(recommendations && recoReason
        ? {
            recommendations,
            recommendationReason: recoReason,
            recommendationContext: {
              budget: intentAnalysis.budget ?? null,
              need: intentAnalysis.need ?? null,
              reason: recoReason,
            } satisfies RecommendationContext,
          }
        : {}),
    })
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('[BARGAIN_OFFER]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  } finally {
    endTotal()
  }
}
