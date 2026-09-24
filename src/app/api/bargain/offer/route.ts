import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { bargainOfferSchema, validateOrThrow, handleValidationError } from '@/lib/validation/bargain'
import { negotiateStep, ruleBasedDecision, buildOpeningMessage, buildCustomerContext, computeMinPrice, retentionOffer, quotedFloor, type NegotiationContext } from '@/lib/services/bargain'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { detectWalkout, extractQuantity, extractPrice } from '@/lib/bargain/text'
import { assertSessionOwnership } from '@/lib/bargain/session-bind'
import { uiText, currencySymbolFor } from '@/lib/bargain/i18n'
import { detectLanguage } from '@/lib/bargain/language'
import { logDataAccess } from '@/lib/data-protection'
import { clampOfferToSafety } from '@/lib/bargain/engine'
import { detectCouponMention, detectMultiProductRequest } from '@/lib/bargain/policy'
import { buildGoalContextForNegotiation } from '@/lib/bargain/goals'
import { analyzeIntent } from '@/lib/bargain/intent'
import { buildProductContext } from '@/lib/bargain/product-fetcher'
import { searchRecommendations, recommendationReason, type RecommendationCard, type RecommendationReason, type RecommendationContext } from '@/lib/bargain/recommendations'
import { fetchShopifyProducts } from '@/lib/shopify'
import { track } from '@/lib/analytics/track'

export const dynamic = 'force-dynamic'

// Respect an explicit store/session language; otherwise detect from the
// customer's current message so the reply matches the language they speak.
function detectedLang(sessionOrConfig: string | null | undefined, customerMessage: string): string {
  if (sessionOrConfig && sessionOrConfig !== 'auto') return sessionOrConfig
  return detectLanguage(customerMessage) ?? 'auto'
}

// Recommendations are surfaced only when BOTH the master toggle and the
// "alternatives" sub-toggle are on (server-side guard; never client-side).
function recoEnabledForMessages(config: Partial<{ recommendationsEnabled: boolean | null; alternativeRecommendationsEnabled: boolean | null }>): boolean {
  return config.recommendationsEnabled === true && config.alternativeRecommendationsEnabled === true
}
// POST /api/bargain/offer — customer sends a message, AI responds
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_offer_${request.headers.get('x-forwarded-for') || 'unknown'}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json()
    const data = validateOrThrow(bargainOfferSchema, body)
    const customerOffer = extractPrice(data.message)
    const isWalkout = detectWalkout(data.message)

    const bargainSession = await prisma.bargainSession.findUnique({
      where: { id: data.sessionId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        store: true,
      },
    })

    if (!bargainSession) {
      return NextResponse.json({ message: 'Bargain session not found' }, { status: 404 })
    }
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
    const productCtx = await buildProductContext({
      store: bargainSession.store,
      storeId: bargainSession.storeId,
      shopifyProductId: bargainSession.shopifyProductId,
      variantId: bargainSession.variantId ?? null,
      currency: bargainSession.store.currency,
      baseUrl: `https://${bargainSession.store.domain}`,
      fallbackTitle: productTitle ?? null,
    })

    // Deterministic shopper-intent classification of the current message. Cheap,
    // predictable, and merchant-controlled — the LLM is told about it, it never
    // decides it.
    const intentAnalysis = analyzeIntent(data.message)

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
      let bundleReco: RecommendationCard[] | null = null
      if (recoEnabledForMessages(config) && intentAnalysis.budget != null) {
        try {
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
          )
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
            metadata: { bundleRequested: true, couponMentioned: couponMentioned || undefined } as any,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: reply,
            metadata: {
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

    const attemptsUsed = bargainSession.attemptsUsed + 1
    const attemptsRemaining = Math.max(0, config.maxAttempts - attemptsUsed)
    const attemptsExhausted = attemptsUsed >= config.maxAttempts

    if (attemptsExhausted && attemptsRemaining <= 0) {
      const rejectReply = uiText(lang, 'attempts_exhausted')
      await prisma.$transaction([
        prisma.bargainMessage.create({
          data: { sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: rejectReply,
            metadata: { tactic: 'reject_graceful', reason: 'attempts_exhausted' } as any,
          },
        }),
        prisma.bargainSession.update({
          where: { id: bargainSession.id },
          data: { status: 'rejected', currentOffer: customerOffer ?? bargainSession.currentOffer },
        }),
      ])
      return NextResponse.json({ reply: rejectReply, decision: 'reject', sessionStatus: 'rejected' })
    }

    const ctx: NegotiationContext = {
      storeName: bargainSession.store.name,
      currencySymbol,
      originalPrice: bargainSession.originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts: config.maxAttempts,
      persona: config.aiPersona as NegotiationContext['persona'],
      productTitle,
      bulkQuantity: bulkQuantity ?? undefined,
      walkoutTriggered: isWalkout,
      language: lang,
      customerContext: await buildCustomerContext(bargainSession.storeId, bargainSession.customerEmail),
      goal: await buildGoalContextForNegotiation(config, bargainSession.store.timezone, new Date()),
      product: productCtx,
      intent: intentAnalysis,
      negotiationMode: (config.negotiationMode as NegotiationContext['negotiationMode']) ?? 'balanced',
      couponsAllowed,
      recommendationsEnabled: recoEnabledForMessages(config),
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

      if (hadRetention || attemptsRemaining <= 0) {
        // Second walkout OR no attempts left → close the session (abandoned)
        const farewellReplies: Record<string, string> = {
          friendly_shopkeeper: uiText(lang, 'farewell_friendly'),
          strict_negotiator: uiText(lang, 'farewell_strict'),
          playful_friend: uiText(lang, 'farewell_playful'),
        } as Record<string, string>
        const farewell = farewellReplies[ctx.persona] ?? farewellReplies.friendly_shopkeeper
        await prisma.$transaction([
          prisma.bargainMessage.create({
            data: { sessionId: bargainSession.id, role: 'customer', content: data.message, offeredPrice: customerOffer ?? null },
          }),
          prisma.bargainMessage.create({
            data: {
              sessionId: bargainSession.id, role: 'ai', content: farewell,
              metadata: { tactic: 'walkout_final', reason: hadRetention ? 'second_walkout' : 'no_attempts_left' } as any,
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
        })
      }

      // First walkout → retention offer (one meaningful extra concession)
      const retentionResult = await negotiateStep(ctx, history, data.message, customerOffer ?? undefined, bargainSession.id)
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
            metadata: { bulkQuantity } as any,
          },
        }),
        prisma.bargainMessage.create({
          data: {
            sessionId: bargainSession.id, role: 'ai', content: retentionReply,
            offeredPrice: retentionPrice,
            metadata: { decision: 'counter', tactic: 'walkout_retention', sentiment: 'urgent' } as any,
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
      })
    }

    // ── NORMAL NEGOTIATION (incl. bulk) ──
    const result = await negotiateStep(ctx, history, data.message, customerOffer ?? undefined, bargainSession.id)

    // If abuse was detected and doesn't consume an attempt, don't count it
    const isAbuseNoConsume = (result.metadata as any)?.abuse === true &&
      (result.metadata as any)?.consumeAttempt === false

    const sessionStatus =
      result.decision === 'accept' ? 'accepted' :
      result.decision === 'reject' ? 'rejected' : 'active'

    // Roll back the attempt if abuse doesn't consume it
    const effectiveAttemptsUsed = isAbuseNoConsume ? attemptsUsed - 1 : attemptsUsed

    if (isAbuseNoConsume) {
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
    if (intentAnalysis.intent !== 'UNKNOWN' && intentAnalysis.intent !== 'GENERIC_CHAT') {
      await track({
        name: 'cartgain_intent_detected',
        storeId: bargainSession.storeId,
        properties: { intent: intentAnalysis.intent },
      })
    }
    if (intentAnalysis.objection) {
      await track({
        name: 'cartgain_objection_detected',
        storeId: bargainSession.storeId,
        properties: { objection: intentAnalysis.objection },
      })
    }
    if (intentAnalysis.intent === 'PRODUCT_QUESTION') {
      await track({
        name: 'cartgain_product_question',
        storeId: bargainSession.storeId,
        properties: { hasVerifiedContext: productCtx.fetchFailed === false && productCtx.description.length > 0 },
      })
    }
    if (customerOffer != null && customerOffer < minPrice) {
      await track({
        name: 'cartgain_offer_below_floor',
        storeId: bargainSession.storeId,
        properties: {},
      })
    }
    // §36 funnel analytics — every priced turn + the negotiation round counter.
    if (customerOffer != null) {
      await track({
        name: 'cartgain_customer_offer',
        storeId: bargainSession.storeId,
        properties: { aboveFloor: customerOffer >= minPrice },
      })
      await track({
        name: 'cartgain_negotiation_round',
        storeId: bargainSession.storeId,
        properties: { round: attemptsUsed, remaining: attemptsRemaining },
      })
    }
    // §24 — a coupon mention when stacking is disabled is a policy-relevant
    // signal worth seeing, even though the offer itself stays live (the ACCEPT
    // layer enforces the block).
    if (couponMentioned && !couponsAllowed) {
      await track({
        name: 'cartgain_coupon_stack_attempt_detected',
        storeId: bargainSession.storeId,
        properties: {},
      })
    }
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
      recoReason = recommendationReason(
        intentAnalysis.intent,
        (result.metadata as any)?.recommendationsRequested === true,
        budget,
        customerOffer,
        minPrice,
      )
      if (recoReason) {
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
        )
        recommendations = outcome.cards.length > 0 ? outcome.cards : null
        if (recommendations) {
          await track({
            name: 'cartgain_recommendation_requested',
            storeId: bargainSession.storeId,
            properties: {
              reason: recoReason,
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
              truncated: outcome.truncated,
            },
          })
        }
      }
    }

    const [customerMsg, aiMsg, updatedSession] = await prisma.$transaction([
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id, role: 'customer', content: data.message,
          offeredPrice: customerOffer ?? null,
          metadata: {
            ...(bulkQuantity ? { bulkQuantity } : {}),
            ...(couponMentioned ? { couponMentioned: true } : {}),
          } as any,
        },
      }),
      prisma.bargainMessage.create({
        data: {
          sessionId: bargainSession.id, role: 'ai', content: result.reply,
          // Financial safety: a pure-chat reply (no AI counter) must NOT
          // persist `offeredPrice` — otherwise `minPrice` would be written as an
          // accept-able offer and the customer could lock the floor without the
          // AI ever offering it. Only real counters (decision counter/accept)
          // carry an offeredPrice.
          offeredPrice: safeCounter,
          metadata: { decision: result.decision, tactic: result.tactic, sentiment: result.sentiment, ...(result.metadata ?? {}) } as any,
        },
      }),
      prisma.bargainSession.update({
        where: { id: bargainSession.id },
        data: {
          currentOffer: customerOffer ?? bargainSession.currentOffer,
          status: sessionStatus,
          finalPrice: result.decision === 'accept' ? (safeCounter ?? customerOffer ?? bargainSession.currentOffer) : null,
        },
      }),
    ])

    return NextResponse.json({
      reply: result.reply,
      decision: result.decision,
      counterOffer: safeCounter,
      sessionStatus,
      finalPrice: updatedSession.finalPrice,
      sessionId: bargainSession.id,
      // §10 floor-reached: backend-determined, boolean-only. Tells the UI the
      // AI just presented its best (= last) price so the customer gets a
      // "Final offer" frame. NEVER carries the floor amount itself; the client
      // cannot compute or alter it.
      floorReached: result.tactic === 'final_offer',
      ...(isAbuseNoConsume ? { abuseDetected: true, abuseCategory: (result.metadata as any)?.category } : {}),
      ...(recommendations && recoReason
        ? {
            recommendations,
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
  }
}
