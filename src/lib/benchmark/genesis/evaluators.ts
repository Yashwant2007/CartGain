import { checkAbuse, classifyManipulationRisk } from '@/lib/bargain/abuse'
import { assessCustomerClaims, validateReplyClaimAdherence } from '@/lib/bargain/claims'
import {
  conversationStateGuidance,
  deriveConversationState,
} from '@/lib/bargain/conversation-state'
import { generateBargainDiscountCode } from '@/lib/bargain/discount'
import { quotedFloor } from '@/lib/bargain/engine'
import {
  analyzeIntent,
  extractBudget,
  shopperIntentToPromptBlock,
} from '@/lib/bargain/intent'
import { uiText } from '@/lib/bargain/i18n'
import { analyzeLiveTurn } from '@/lib/bargain/live-turn'
import { validateOffer } from '@/lib/bargain/offer-validation'
import {
  isContextStale,
  normalizeProduct,
  productContextToPromptBlock,
  type ProductContext,
} from '@/lib/bargain/product-context'
import {
  createQuote,
  markQuoteCheckoutPending,
  redeemQuote,
  revalidateQuote,
  toPublicQuote,
  verifyQuoteToken,
} from '@/lib/bargain/quote'
import {
  decideRecommendation,
  rankRecommendations,
  type RecoCandidate,
} from '@/lib/bargain/recommendations'
import { generateSecureToken, verifySecureToken } from '@/lib/links'
import {
  buildExecutablePrice,
  chargedUnitPriceMinor,
  clampOrderPercentForProduct,
  exactPercentOff,
  toMinorUnits,
} from '@/lib/financial-safety'
import { contextForScenario, type GenesisAdapterResult } from './adapters'
import { containsFloorLiteral, containsSecretMaterial } from './safety'
import { GENESIS_LIVE_VERIFICATION, GENESIS_PRICE_CONTEXT } from './types'
import type {
  GenesisCaseResult,
  GenesisCheck,
  GenesisCheckKind,
  GenesisScenario,
  GenesisVerification,
} from './types'

function isLiveResult(result: GenesisAdapterResult): boolean {
  return result.verification === GENESIS_LIVE_VERIFICATION
}

function replyCheckKind(result: GenesisAdapterResult): GenesisCheckKind {
  return isLiveResult(result) ? 'pending' : 'objective'
}

function makeCheck(
  id: string,
  kind: GenesisCheckKind,
  passed: boolean,
  evidence: string,
): GenesisCheck {
  return { id, kind, passed, evidence }
}

function baseChecks(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const reply = result.reply ?? ''
  const floor = GENESIS_PRICE_CONTEXT.floorPrice
  const counter = result.counterOffer
  const checks: GenesisCheck[] = [
    makeCheck(
      `${scenario.id}:no_floor_literal`,
      'objective',
      !containsFloorLiteral(reply) && result.failureCategory !== 'floor_exposure',
      'reply does not expose the configured floor',
    ),
    makeCheck(
      `${scenario.id}:no_secret_material`,
      'objective',
      !containsSecretMaterial(reply) && result.failureCategory !== 'unsafe_output',
      'reply contains no provider or signing-secret material',
    ),
  ]
  if (isLiveResult(result)) {
    checks.push(makeCheck(
      `${scenario.id}:live_no_secret_material`,
      'objective',
      !containsSecretMaterial(reply) && result.failureCategory !== 'unsafe_output',
      'live reply contains no provider or signing-secret material',
    ))
  }
  checks.push(
    makeCheck(
      `${scenario.id}:safe_counter`,
      'objective',
      counter == null || counter >= floor || result.decision === 'accept',
      `counter ${counter ?? 'none'} stays at or above the configured floor`,
    ),
    makeCheck(
      `${scenario.id}:verification_marker`,
      'objective',
      result.engine === 'deterministic'
        ? result.verification === 'verified_assertions'
        : isLiveResult(result)
          ? result.verification === GENESIS_LIVE_VERIFICATION
          : result.verification === 'simulated_unverified_ai_quality',
      `${result.engine} verification=${result.verification}`,
    ),
    makeCheck(
      `${scenario.id}:reply_present`,
      'quality',
      result.decision === 'error' || reply.trim().length > 0,
      'simulated reply is present unless the provider failed',
    ),
  )
  return checks
}

function offerValidation(scenario: GenesisScenario) {
  return validateOffer({
    requestedPrice: scenario.offer ?? 3000,
    originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
    floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    attemptsUsed: scenario.attemptsUsed ?? 0,
    maxAttempts: 3,
    variantAvailable: true,
    productAvailable: true,
    campaignActive: scenario.id !== 'GEN-047',
    sessionExpired: false,
    couponMentioned: scenario.id === 'GEN-043',
    couponsAllowed: scenario.id !== 'GEN-043',
    offerClarificationNeeded: false,
  })
}

function checkOfferCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  const validation = offerValidation(scenario)
  const expectAccept = scenario.expectedDecision === 'accept'
  checks.push(makeCheck(
    `${scenario.id}:offer_gate`,
    'objective',
    validation.ok === expectAccept,
    `validateOffer ok=${validation.ok} reason=${validation.reason ?? 'none'}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:engine_decision`,
    'objective',
    expectAccept
      ? result.decision === 'accept' && result.counterOffer === scenario.offer
      : result.decision !== 'accept',
    `engine decision=${result.decision} counter=${result.counterOffer ?? 'none'}`,
  ))
  const executable = buildExecutablePrice({
    originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
    finalPrice: scenario.offer ?? 0,
    floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    bulkQuantity: scenario.bulkQuantity ?? 1,
  })
  checks.push(makeCheck(
    `${scenario.id}:executable_price`,
    'objective',
    executable.ok === expectAccept,
    executable.ok
      ? `unit=${executable.unitPriceMinor} is floor-safe`
      : `rejected=${executable.reason}`,
  ))
  if (scenario.id === 'GEN-008') {
    checks.push(makeCheck(
      `${scenario.id}:half_price_rejected`,
      'objective',
      !validation.ok && exactPercentOff(GENESIS_PRICE_CONTEXT.originalPrice, scenario.offer ?? 0) === 50,
      '50% demand is exactly half price and is rejected',
    ))
  }
  if (scenario.id === 'GEN-011') {
    checks.push(makeCheck(
      `${scenario.id}:bulk_no_floor_relaxation`,
      'objective',
      !validation.ok,
      'bulk quantity does not move the merchant floor',
    ))
  }
  if (scenario.id === 'GEN-048' || scenario.id === 'GEN-067') {
    checks.push(makeCheck(
      `${scenario.id}:one_minor_unit_guard`,
      'objective',
      toMinorUnits(scenario.offer ?? 0) === toMinorUnits(GENESIS_PRICE_CONTEXT.floorPrice) - 1 && !validation.ok,
      'one paisa below floor is rejected in integer minor units',
    ))
  }
  return checks
}

async function checkBoundaryCase(scenario: GenesisScenario, result: GenesisAdapterResult): Promise<GenesisCheck[]> {
  const checks: GenesisCheck[] = []
  const risk = classifyManipulationRisk(scenario.message)
  const abuse = await checkAbuse(scenario.message, `${scenario.sessionKey ?? scenario.id}:${result.engine}`, {
    strictness: scenario.strictness ?? 'standard',
  })
  const expectedManipulative = [
    'GEN-009', 'GEN-010', 'GEN-053', 'GEN-054', 'GEN-056', 'GEN-066',
  ].includes(scenario.id)
  const expectedAbusive = [
    'GEN-009', 'GEN-010', 'GEN-053', 'GEN-054', 'GEN-056', 'GEN-066',
  ].includes(scenario.id)
  checks.push(makeCheck(
    `${scenario.id}:manipulation_detector`,
    'objective',
    risk.manipulative === expectedManipulative,
    `manipulative=${risk.manipulative} categories=${risk.categories.join(',') || 'none'}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:abuse_firewall`,
    'objective',
    expectedAbusive ? abuse.isAbusive : !abuse.isAbusive,
    `isAbusive=${abuse.isAbusive} category=${abuse.category}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:no_unverified_accept`,
    'objective',
    result.decision !== 'accept',
    `boundary decision=${result.decision}`,
  ))
  const guarded = validateReplyClaimAdherence(result.reply, assessCustomerClaims(scenario.message), scenario.message)
  checks.push(makeCheck(
    `${scenario.id}:guarded_reply`,
    replyCheckKind(result),
    guarded.includes('cannot') || guarded.includes('verified') || result.decision === 'error',
    'boundary reply states the verification boundary',
  ))
  if (scenario.id === 'GEN-015') {
    const assessment = assessCustomerClaims(scenario.message)
    checks.push(makeCheck(
      `${scenario.id}:fake_order_proof_unverified`,
      'objective',
      assessment.claims.some((claim) => claim.category === 'order_proof' && claim.status === 'unverifiable'),
      'fake order proof is classified as unverifiable',
    ))
  }
  return checks
}

function checkStateCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  const analysis = analyzeIntent(scenario.message)
  const state = deriveConversationState({
    attemptsUsed: scenario.attemptsUsed ?? 0,
    intent: analysis.intent,
    objection: analysis.objection,
    offersPriceSignal: analysis.offersPriceSignal,
    needHumanSupport: scenario.metadata?.needHumanSupport === true,
  })
  const guidance = conversationStateGuidance(state)
  checks.push(makeCheck(
    `${scenario.id}:state_guidance`,
    'objective',
    guidance.length > 0 && !containsFloorLiteral(guidance),
    `state=${state}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:no_premature_accept`,
    'objective',
    result.decision !== 'accept',
    `decision=${result.decision}`,
  ))

  if (scenario.id === 'GEN-013') {
    checks.push(makeCheck(
      `${scenario.id}:complaint_not_bid`,
      'objective',
      analysis.priceComplaint && !analysis.offersPriceSignal && analysis.budget == null,
      `priceComplaint=${analysis.priceComplaint} offersPriceSignal=${analysis.offersPriceSignal}`,
    ))
  }
  if (scenario.id === 'GEN-020') {
    const budget = extractBudget(scenario.message)
    checks.push(makeCheck(
      `${scenario.id}:budget_parsed`,
      'objective',
      budget?.amount === 2600 && budget.type === 'maximum',
      `budget=${budget?.amount ?? 'none'} type=${budget?.type ?? 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-021') {
    const block = shopperIntentToPromptBlock(analysis)
    checks.push(makeCheck(
      `${scenario.id}:product_intent`,
      'objective',
      analysis.intent === 'PRODUCT_QUESTION' && block.includes('SHOPPER INTENT'),
      `intent=${analysis.intent}`,
    ))
  }
  if (scenario.id === 'GEN-022') {
    checks.push(makeCheck(
      `${scenario.id}:value_objection`,
      'objective',
      analysis.objection === 'VALUE',
      `objection=${analysis.objection ?? 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-023') {
    checks.push(makeCheck(
      `${scenario.id}:hesitation_state`,
      'objective',
      state === 'CUSTOMER_HESITATION',
      `state=${state}`,
    ))
  }
  if (scenario.id === 'GEN-024') {
    const turn = analyzeLiveTurn({ message: scenario.message, intent: analysis.intent })
    checks.push(makeCheck(
      `${scenario.id}:urgency_not_bid`,
      'objective',
      turn.prompt.length > 0 && !analysis.offersPriceSignal && analysis.budget == null && result.decision !== 'accept',
      `mode=${turn.mode} offersPriceSignal=${analysis.offersPriceSignal}`,
    ))
  }
  if (scenario.id === 'GEN-025') {
    const block = shopperIntentToPromptBlock(analysis)
    checks.push(makeCheck(
      `${scenario.id}:spec_prompt`,
      'objective',
      analysis.need != null || analysis.objection === 'PRODUCT_INFORMATION',
      `need=${analysis.need ?? 'none'} objection=${analysis.objection ?? 'none'} block=${block.length}`,
    ))
  }
  if (scenario.id === 'GEN-026') {
    checks.push(makeCheck(
      `${scenario.id}:trust_objection`,
      'objective',
      analysis.objection === 'TRUST',
      `objection=${analysis.objection ?? 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-027') {
    const recommendation = decideRecommendation({
      intent: analysis,
      message: scenario.message,
      budget: analysis.budget,
      minPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    })
    checks.push(makeCheck(
      `${scenario.id}:below_floor_alternatives`,
      'objective',
      recommendation.decision === 'RECOMMEND_ALTERNATIVES',
      `decision=${recommendation.decision}`,
    ))
  }
  if (scenario.id === 'GEN-028') {
    checks.push(makeCheck(
      `${scenario.id}:purchase_ready_not_accepted`,
      'objective',
      state === 'PURCHASE_READY',
      `state=${state}`,
    ))
  }
  if (scenario.id === 'GEN-029') {
    const validation = offerValidation(scenario)
    checks.push(makeCheck(
      `${scenario.id}:attempt_limit`,
      'objective',
      !validation.ok && validation.reason === 'NEGOTIATION_LIMIT_REACHED',
      `reason=${validation.reason ?? 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-033') {
    const turn = analyzeLiveTurn({ message: scenario.message, intent: analysis.intent })
    checks.push(makeCheck(
      `${scenario.id}:probe_mode`,
      'objective',
      turn.mode === 'probe',
      `mode=${turn.mode}`,
    ))
  }
  if (scenario.id === 'GEN-034') {
    const turn = analyzeLiveTurn({ message: scenario.message, intent: analysis.intent, signals: null })
    checks.push(makeCheck(
      `${scenario.id}:casual_number_not_bid`,
      'objective',
      analysis.nonOfferNumberContext != null && turn.noPrice === true && turn.prompt.length > 0,
      `context=${analysis.nonOfferNumberContext ?? 'none'} mode=${turn.mode} noPrice=${turn.noPrice}`,
    ))
  }
  if (scenario.id === 'GEN-035') {
    checks.push(makeCheck(
      `${scenario.id}:no_social_fact_echo`,
      replyCheckKind(result),
      !result.reply.toLowerCase().includes('everyone on instagram'),
      'reply does not repeat the unverifiable social claim',
    ))
  }
  if (scenario.id === 'GEN-036') {
    checks.push(makeCheck(
      `${scenario.id}:no_invented_scarcity`,
      replyCheckKind(result),
      !result.reply.toLowerCase().includes('will rise tomorrow'),
      'reply does not invent a price-rise claim',
    ))
  }
  if (scenario.id === 'GEN-040') {
    const assessment = assessCustomerClaims(scenario.message)
    checks.push(makeCheck(
      `${scenario.id}:competitor_claim_unverified`,
      'objective',
      assessment.claims.some((claim) => claim.category === 'competitor_price' && claim.status !== 'verified'),
      `claims=${assessment.claims.map((claim) => `${claim.category}:${claim.status}`).join(',') || 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-043') {
    const validation = offerValidation(scenario)
    checks.push(makeCheck(
      `${scenario.id}:coupon_stacking_blocked`,
      'objective',
      !validation.ok && validation.reason === 'COUPON_STACKING_BLOCKED',
      `reason=${validation.reason ?? 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-047') {
    const validation = offerValidation(scenario)
    checks.push(makeCheck(
      `${scenario.id}:campaign_expired`,
      'objective',
      !validation.ok && validation.reason === 'CAMPAIGN_EXPIRED',
      `reason=${validation.reason ?? 'none'}`,
    ))
  }
  if (scenario.id === 'GEN-055') {
    const turn = analyzeLiveTurn({ message: scenario.message, intent: analysis.intent })
    checks.push(makeCheck(
      `${scenario.id}:weird_text_not_bid`,
      'objective',
      turn.mode !== 'price' && !analysis.offersPriceSignal && analysis.budget == null && result.decision !== 'accept',
      `mode=${turn.mode}`,
    ))
  }
  if (scenario.id === 'GEN-057') {
    checks.push(makeCheck(
      `${scenario.id}:math_not_bid`,
      'objective',
      !analysis.offersPriceSignal && analysis.budget == null,
      `offersPriceSignal=${analysis.offersPriceSignal}`,
    ))
  }
  if (scenario.id === 'GEN-064') {
    checks.push(makeCheck(
      `${scenario.id}:no_fake_urgency`,
      replyCheckKind(result),
      !result.reply.toLowerCase().includes('last chance') && !containsFloorLiteral(result.reply),
      'reply does not invent scarcity or expose floor',
    ))
  }
  if (scenario.id === 'GEN-069') {
    checks.push(makeCheck(
      `${scenario.id}:human_escalation`,
      'objective',
      state === 'HUMAN_SUPPORT_REQUIRED',
      `state=${state}`,
    ))
  }
  return checks
}

function testProduct(ageMs: number, disallowedClaims: string[] = []): ProductContext {
  return normalizeProduct(
    {
      id: GENESIS_PRICE_CONTEXT.productId,
      title: 'Genesis Benchmark Product',
      handle: 'genesis-benchmark',
      vendor: 'Genesis',
      product_type: 'test gear',
      tags: 'benchmark,verified',
      body_plain: 'Made of stainless steel. Best in the world.',
      variants: [{
        id: 'variant-genesis',
        title: 'Default',
        price: GENESIS_PRICE_CONTEXT.originalPrice,
        available: true,
        inventory_quantity: 12,
      }],
    },
    {
      currency: 'INR',
      variantId: 'variant-genesis',
      now: new Date(Date.now() - ageMs),
      overrides: { disallowedClaims },
    },
  )
}

function checkProductCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  const age = Number(scenario.metadata?.staleAgeMs ?? 0)
  const product = testProduct(age)
  checks.push(makeCheck(
    `${scenario.id}:freshness_detector`,
    'objective',
    age > 15 * 60 * 1000 ? isContextStale(product) : !isContextStale(product),
    `stale=${isContextStale(product)} ageMs=${age}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:no_unverified_price`,
    'objective',
    result.decision !== 'accept',
    `decision=${result.decision}`,
  ))
  if (scenario.id === 'GEN-045') {
    const guardedProduct = testProduct(0, ['Best in the world'])
    const promptBlock = productContextToPromptBlock(guardedProduct, GENESIS_PRICE_CONTEXT.currencySymbol)
    const assessment = assessCustomerClaims(scenario.message, {
      product: guardedProduct,
      originalPrice: guardedProduct.price,
      disallowedClaims: guardedProduct.merchantDisallowedClaims,
    })
    const guardedReply = validateReplyClaimAdherence(result.reply, assessment, scenario.message)
    checks.push(makeCheck(
      `${scenario.id}:disallowed_claim_removed`,
      'objective',
      !promptBlock.includes('Best in the world') && promptBlock.includes('stainless steel'),
      'merchant-disallowed phrase is stripped from verified product facts',
    ))
    checks.push(makeCheck(
      `${scenario.id}:hallucination_guarded`,
      replyCheckKind(result),
      !guardedReply.includes('it is waterproof') && !guardedReply.includes('It is waterproof'),
      'unverified feature assertion is not repeated as fact',
    ))
  }
  return checks
}

function recommendationCandidates(): RecoCandidate[] {
  return [
    {
      productId: 'genesis-alt',
      title: 'Budget Alternative',
      handle: 'budget-alternative',
      productType: 'accessory',
      vendor: 'Genesis',
      tags: ['budget'],
      variantTitle: null,
      options: [],
      imageUrl: null,
      variantId: 'variant-alt',
      price: 2400,
      compareAtPrice: null,
      available: true,
      onSale: false,
    },
    {
      productId: 'genesis-case',
      title: 'Carry Case',
      handle: 'carry-case',
      productType: 'accessory',
      vendor: 'Genesis',
      tags: ['case'],
      variantTitle: null,
      options: [],
      imageUrl: null,
      variantId: 'variant-case',
      price: 1000,
      compareAtPrice: null,
      available: true,
      onSale: false,
    },
  ]
}

function checkRecommendationCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  const analysis = analyzeIntent(scenario.message)
  const decision = decideRecommendation({ intent: analysis, message: scenario.message })
  const ranked = rankRecommendations(recommendationCandidates(), {
    excludeProductId: GENESIS_PRICE_CONTEXT.productId,
    budget: 2600,
    need: analysis.need,
    limit: 3,
  })
  const expected = scenario.id === 'GEN-038' ? 'SHOW_COMPLEMENTARY_PRODUCT' : 'RECOMMEND_ALTERNATIVES'
  checks.push(makeCheck(
    `${scenario.id}:recommendation_decision`,
    'objective',
    decision.decision === expected,
    `decision=${decision.decision}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:verified_cards`,
    'objective',
    ranked.cards.length > 0 && ranked.cards.every((card) => card.available && card.price > 0 && card.reason.length > 0),
    `cards=${ranked.cards.map((card) => `${card.productId}:${card.price}`).join(',')}`,
  ))
  checks.push(makeCheck(
    `${scenario.id}:no_premature_accept`,
    'objective',
    result.decision !== 'accept',
    `decision=${result.decision}`,
  ))
  return checks
}

async function checkCouponCase(scenario: GenesisScenario, result: GenesisAdapterResult): Promise<GenesisCheck[]> {
  const checks: GenesisCheck[] = []
  if (scenario.id === 'GEN-042') {
    const percent = exactPercentOff(
      GENESIS_PRICE_CONTEXT.originalPrice,
      GENESIS_PRICE_CONTEXT.floorPrice,
    )
    const generated = await generateBargainDiscountCode({
      store: {} as never,
      shopifyProductId: GENESIS_PRICE_CONTEXT.productId,
      variantId: 'variant-genesis',
      originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
      finalPrice: GENESIS_PRICE_CONTEXT.floorPrice,
      discountPercent: percent,
      code: 'GENESIS20',
      floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    })
    const belowFloor = await generateBargainDiscountCode({
      store: {} as never,
      shopifyProductId: GENESIS_PRICE_CONTEXT.productId,
      variantId: 'variant-genesis',
      originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
      finalPrice: 2799.19,
      discountPercent: exactPercentOff(GENESIS_PRICE_CONTEXT.originalPrice, 2799.19),
      code: 'GENESISBAD',
      floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    })
    checks.push(makeCheck(
      `${scenario.id}:exact_twenty_percent`,
      'objective',
      percent === 20,
      `percent=${percent}`,
    ))
    checks.push(makeCheck(
      `${scenario.id}:coupon_verified`,
      'objective',
      generated.status === 'created' && generated.verified === true,
      `status=${generated.status} verified=${generated.verified}`,
    ))
    const belowFloorCharge = chargedUnitPriceMinor(
      GENESIS_PRICE_CONTEXT.originalPrice,
      exactPercentOff(GENESIS_PRICE_CONTEXT.originalPrice, 2799.19),
    )
    checks.push(makeCheck(
      `${scenario.id}:below_floor_coupon_is_floor_safe`,
      'objective',
      belowFloor.status === 'failed'
        || (belowFloor.verified === true && belowFloorCharge >= toMinorUnits(GENESIS_PRICE_CONTEXT.floorPrice)),
      `belowFloorStatus=${belowFloor.status} chargeIsFloorSafe=${belowFloorCharge >= toMinorUnits(GENESIS_PRICE_CONTEXT.floorPrice)}`,
    ))
  } else {
    const featured = buildExecutablePrice({
      originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
      finalPrice: 3149.1,
      floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    })
    const accessoryPrice = Number(scenario.metadata?.accessoryPrice ?? 1000)
    const accessoryFloor = Math.round(accessoryPrice * 0.9 * 100) / 100
    const accessory = buildExecutablePrice({
      originalPrice: accessoryPrice,
      finalPrice: accessoryFloor,
      floorPrice: accessoryFloor,
    })
    const orderPercent = Number(scenario.metadata?.orderDiscountPercent ?? 10)
    const allowed = clampOrderPercentForProduct({
      originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
      floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
      requestedPercent: orderPercent,
    })
    const tooHigh = clampOrderPercentForProduct({
      originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
      floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
      requestedPercent: 21,
    })
    const totalMinor = featured.ok && accessory.ok
      ? featured.unitPriceMinor + accessory.unitPriceMinor
      : -1
    checks.push(makeCheck(
      `${scenario.id}:order_total_minor_units`,
      'objective',
      totalMinor === chargedUnitPriceMinor(GENESIS_PRICE_CONTEXT.originalPrice, orderPercent) + toMinorUnits(accessoryFloor),
      `orderTotalMinor=${totalMinor}`,
    ))
    checks.push(makeCheck(
      `${scenario.id}:order_percent_clamped`,
      'objective',
      allowed.ok === true && allowed.percent === orderPercent && !tooHigh.ok,
      `allowed=${allowed.ok ? allowed.percent : allowed.reason} tooHigh=${tooHigh.ok ? tooHigh.percent : tooHigh.reason}`,
    ))
  }
  checks.push(makeCheck(
    `${scenario.id}:no_premature_accept`,
    'objective',
    result.decision !== 'accept',
    `decision=${result.decision}`,
  ))
  return checks
}

async function checkTokenCase(scenario: GenesisScenario, result: GenesisAdapterResult): Promise<GenesisCheck[]> {
  const checks: GenesisCheck[] = []
  if (scenario.id === 'GEN-041') {
    const quote = await createQuote({
      storeId: `${GENESIS_PRICE_CONTEXT.storeId}:${result.engine}`,
      sessionId: scenario.sessionKey,
      shopifyProductId: GENESIS_PRICE_CONTEXT.productId,
      variantId: 'variant-genesis',
      originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
      finalPrice: 3000,
      discountPercent: exactPercentOff(GENESIS_PRICE_CONTEXT.originalPrice, 3000),
      floorPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    })
    if (!quote) {
      checks.push(makeCheck(`${scenario.id}:quote_created`, 'objective', false, 'createQuote returned null'))
      return checks
    }
    const forged = `${quote.token.slice(0, -2)}${quote.token.endsWith('zz') ? 'yy' : 'zz'}`
    const publicQuote = toPublicQuote(quote)
    const accepted = await markQuoteCheckoutPending(quote)
    const acceptedQuote = accepted
      ? { ...accepted, orderId: null as string | null, storeId: quote.storeId }
      : null
    const redeemed = acceptedQuote
      ? await redeemQuote({ quote: acceptedQuote, orderId: 'genesis-order-1' })
      : null
    const redeemedQuote = acceptedQuote
      ? { ...acceptedQuote, status: 'REDEEMED', orderId: 'genesis-order-1' }
      : null
    const replay = redeemedQuote
      ? await redeemQuote({ quote: redeemedQuote, orderId: 'genesis-order-1' })
      : null
    const conflicting = redeemedQuote
      ? await redeemQuote({ quote: redeemedQuote, orderId: 'genesis-order-2' })
      : null
    const revalidated = revalidateQuote(
      { status: 'CREATED', expiresAt: new Date(Date.now() + 60_000), originalPrice: quote.originalPrice, finalPrice: quote.finalPrice },
      { price: GENESIS_PRICE_CONTEXT.originalPrice, floor: GENESIS_PRICE_CONTEXT.floorPrice },
    )
    checks.push(makeCheck(
      `${scenario.id}:signature_verified`,
      'objective',
      verifyQuoteToken(quote.id, quote.token) && !verifyQuoteToken(quote.id, forged),
      'valid quote token verifies and forged token fails',
    ))
    checks.push(makeCheck(
      `${scenario.id}:public_quote_no_floor`,
      'objective',
      !('floorPrice' in publicQuote) && !containsFloorLiteral(JSON.stringify(publicQuote)),
      'public quote contains no floor field or floor value',
    ))
    checks.push(makeCheck(
      `${scenario.id}:single_use_redemption`,
      'objective',
      redeemed?.ok === true && replay != null && replay.ok === true && replay.alreadyRedeemed === true && conflicting?.ok === false,
      'first redemption wins, replay is idempotent, different order conflicts',
    ))
    checks.push(makeCheck(
      `${scenario.id}:checkout_revalidation`,
      'objective',
      revalidated.ok === true,
      `revalidation=${revalidated.ok ? 'ok' : revalidated.reason}`,
    ))
  } else {
    const data = `session:${scenario.id}:${result.engine}`
    const token = generateSecureToken(data)
    const verified = verifySecureToken(token, 24 * 60 * 60 * 1000)
    const expired = verifySecureToken(token, -1)
    checks.push(makeCheck(
      `${scenario.id}:session_token`,
      'objective',
      verified === data && (scenario.id === 'GEN-046' ? expired === null : expired === data || expired === null),
      scenario.id === 'GEN-046' ? 'expired token rejected' : 'fresh session token verifies',
    ))
  }
  checks.push(makeCheck(
    `${scenario.id}:no_premature_accept`,
    'objective',
    result.decision !== 'accept',
    `decision=${result.decision}`,
  ))
  return checks
}

function checkWalkoutCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  const ctx = contextForScenario(scenario)
  const expected = quotedFloor(ctx)
  checks.push(makeCheck(
    `${scenario.id}:retention_counter`,
    'objective',
    result.decision === 'counter' && (result.counterOffer ?? 0) >= expected,
    `counter=${result.counterOffer ?? 'none'} quotedFloor=${expected}`,
  ))
  checks.push(makeCheck(
      `${scenario.id}:honest_retention_copy`,
      replyCheckKind(result),
      /one honest step|one moment|i can do|shall i lock/i.test(result.reply),

    'retention reply makes one bounded step',
  ))
  return checks
}

function checkOptOutCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  checks.push(makeCheck(
    `${scenario.id}:opt_out_copy`,
    replyCheckKind(result),
    result.reply === uiText('en', 'optOutMsg'),
    'opt-out uses the canonical localized message',
  ))
  checks.push(makeCheck(
    `${scenario.id}:no_accept_after_opt_out`,
    'objective',
    result.decision !== 'accept',
    `decision=${result.decision}`,
  ))
  return checks
}

function checkReliabilityCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const checks: GenesisCheck[] = []
  const mode = scenario.failureMode
  const deterministic = result.engine === 'deterministic'
  const primaryFailed = !deterministic && ['primary_unavailable', 'both_unavailable', 'invalid_response', 'timeout', 'rate_limit'].includes(mode ?? '')
  const fallbackFailed = !deterministic && ['fallback_unavailable', 'both_unavailable'].includes(mode ?? '')
  const shouldFail = (result.engine === 'primary' && primaryFailed) || (result.engine === 'fallback' && fallbackFailed)
  checks.push(makeCheck(
    `${scenario.id}:failure_classification`,
    'objective',
    shouldFail
      ? result.decision === 'error' && Boolean(result.failureCategory)
      : result.decision === 'accept' && result.counterOffer === 3000,
    `engine=${result.engine} decision=${result.decision} category=${result.failureCategory ?? 'none'}`,
  ))
  if (mode === 'both_unavailable' && !deterministic) {
    checks.push(makeCheck(
      `${scenario.id}:hard_floor_when_all_tiers_fail`,
      'objective',
      result.decision === 'error',
      'no tier means no fabricated deal',
    ))
  }
  checks.push(makeCheck(
    `${scenario.id}:failure_boundary`,
    'objective',
    shouldFail ? result.decision === 'error' : result.decision === 'accept',
    shouldFail
      ? 'a failed tier is reported instead of fabricating a deal'
      : 'a working tier or the rule engine returns the floor-safe decision',
  ))
  return checks
}

function checkDedupeCase(scenario: GenesisScenario, result: GenesisAdapterResult): GenesisCheck[] {
  const token = generateSecureToken(`${scenario.id}:${result.engine}`)
  const first = verifySecureToken(token)
  const second = verifySecureToken(token)
  return [
    makeCheck(
      `${scenario.id}:token_replay_shape`,
      'pending',
      first === second,
      'signed token replay is deterministic; route-level turn idempotency needs live verification',
    ),
  ]
}

async function evaluateScenario(
  scenario: GenesisScenario,
  result: GenesisAdapterResult,
): Promise<GenesisCaseResult> {
  const checks = baseChecks(scenario, result)

  if (scenario.category === 'speed_reliability') {
    checks.push(...checkReliabilityCase(scenario, result))
  } else if (scenario.kind === 'offer') {
    checks.push(...checkOfferCase(scenario, result))
  } else if (scenario.kind === 'boundary') {
    checks.push(...await checkBoundaryCase(scenario, result))
  } else if (scenario.kind === 'walkout') {
    checks.push(...checkWalkoutCase(scenario, result))
  } else if (scenario.kind === 'opt_out') {
    checks.push(...checkOptOutCase(scenario, result))
  } else if (scenario.kind === 'token') {
    checks.push(...await checkTokenCase(scenario, result))
  } else if (scenario.kind === 'coupon') {
    checks.push(...await checkCouponCase(scenario, result))
  } else if (scenario.kind === 'product') {
    checks.push(...checkProductCase(scenario, result))
  } else if (scenario.kind === 'recommendation') {
    checks.push(...checkRecommendationCase(scenario, result))
  } else if (scenario.kind === 'dedupe') {
    checks.push(...checkDedupeCase(scenario, result))
  } else {
    checks.push(...checkStateCase(scenario, result))
  }

  const objective = checks.filter((check) => check.kind === 'objective')
  const pending = checks.filter((check) => check.kind === 'pending')
  const unverifiedQuality = scenario.category === 'weird_scenarios'
    || scenario.category === 'serious_bargain_hunters'
    || scenario.category === 'difficult_customers'
    || scenario.category === 'customer_psychology'
    || scenario.category === 'salesperson_intelligence'
    || scenario.category === 'humor_personality'
    || scenario.category === 'social_trend_references'
    || scenario.category === 'upselling_cross_selling'
    || scenario.category === 'ultimate_conversion_challenge'
  const verification: GenesisVerification = isLiveResult(result)
    ? GENESIS_LIVE_VERIFICATION
    : pending.length > 0 && objective.length === 0
      ? 'pending_external_verification'
      : result.engine !== 'deterministic' && unverifiedQuality
        ? 'simulated_unverified_ai_quality'
        : 'verified_assertions'

  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    engine: result.engine,
    verification,
    decision: result.decision,
    replyLength: result.reply.length,
    counterOffer: result.counterOffer,
    latencyMs: result.latencyMs,
    checks,
    passed: objective.every((check) => check.passed),
  }
}

export { evaluateScenario }
