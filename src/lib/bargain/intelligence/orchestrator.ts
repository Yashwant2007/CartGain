import { buildAgentContributions } from './agents'
import { validateCommercialTurn } from './commercial-validation'
import { buildCustomerUnderstanding } from './customer-understanding'
import { conversationStateFromMetadata, resolveIntelligenceState } from './state'
import { chooseNegotiationStrategy } from './strategy'
import { buildSpinInsight } from './spin'
import { buildIntelligencePromptBlock } from './prompt'
import {
  INTELLIGENCE_SCHEMA_VERSION,
  type BargainIntelligenceState,
  type BargainIntelligenceView,
  type IntelligenceInput,
  type PublicBargainIntelligenceView,
  type RecommendationPosture,
} from './types'

function recommendationPostureFor(input: IntelligenceInput): RecommendationPosture {
  if (!input.recommendationsEnabled || !input.recommendationAvailable) return 'none'
  if (
    input.intent.intent === 'RECOMMENDATION_REQUEST' ||
    input.intent.intent === 'PRODUCT_MISMATCH' ||
    input.intent.objection === 'AVAILABILITY' ||
    (input.intent.objection === 'BUDGET' && input.customerOffer == null)
  ) {
    return 'suggest_now'
  }
  if (
    input.intent.category === 'QUALITY_OBJECTION' ||
    input.intent.category === 'TRUST_OBJECTION' ||
    input.intent.category === 'COMPARISON_OBJECTION'
  ) {
    return 'suggest_if_relevant'
  }
  return 'none'
}

export function buildBargainIntelligence(input: IntelligenceInput): BargainIntelligenceState {
  const history = Array.isArray(input.history) ? input.history.slice(-16) : []
  const customer = buildCustomerUnderstanding({
    message: input.message,
    intent: input.intent,
    claims: input.claims,
    product: input.product,
    signals: input.signals,
    liveTurn: input.liveTurn,
    adaptive: input.adaptive,
    sessionMemory: input.sessionMemory,
    customerOffer: input.customerOffer,
    offerStructure: input.offerStructure,
    originalPrice: input.originalPrice,
    history,
    sessionStatus: input.sessionStatus,
    dealAccepted: input.dealAccepted,
    pendingAccept: input.pendingAccept,
    checkoutStarted: input.checkoutStarted,
    couponMentioned: input.couponMentioned,
  })

  const { transition, context } = resolveIntelligenceState({
    history,
    intent: input.intent,
    sessionStatus: input.sessionStatus,
    attemptsUsed: input.attemptsUsed,
    walkoutTriggered: input.intent.intent === 'WALKOUT' || input.liveTurn?.mode === 'walkout',
    dealAccepted: input.dealAccepted,
    pendingAccept: input.pendingAccept,
    checkoutStarted: input.checkoutStarted,
    purchaseVerified: input.sessionStatus === 'purchased',
    recommendationsEnabled: input.recommendationsEnabled === true,
    needHumanSupport: input.needHumanSupport,
  })

  const strategy = chooseNegotiationStrategy({
    customer,
    goal: input.goal,
    attemptsUsed: input.attemptsUsed,
    maxAttempts: input.maxAttempts,
    recommendationsEnabled: input.recommendationsEnabled === true,
    recommendationAvailable: input.recommendationAvailable === true,
    sessionStatus: input.sessionStatus,
    needHumanSupport: input.needHumanSupport,
  })

  const spin = buildSpinInsight({
    customer,
    intent: input.intent,
    product: input.product,
    history,
    strategy,
  })

  const validation = validateCommercialTurn({
    customerOffer: input.customerOffer,
    proposedPrice: input.proposedPrice,
    originalPrice: input.originalPrice,
    minPrice: input.minPrice,
    attemptsUsed: input.attemptsUsed,
    maxAttempts: input.maxAttempts,
    product: input.product,
    sessionStatus: input.sessionStatus,
    emergencyPaused: input.emergencyPaused,
    campaignActive: input.campaignActive,
    offerQuantity: input.offerStructure?.quantity ?? null,
    couponMentioned: input.couponMentioned,
    couponsAllowed: input.couponsAllowed,
    dealAccepted: input.dealAccepted,
    offerClarificationNeeded: input.offerStructure?.needsClarification ?? input.intent.offerClarificationNeeded,
  })

  const recommendation = recommendationPostureFor(input)
  const agents = buildAgentContributions({
    customer,
    conversationState: transition.current,
    strategy,
    spin,
    validation,
    recommendation,
    product: input.product,
    claims: input.claims,
    adaptive: input.adaptive,
    sessionMemory: input.sessionMemory,
    liveTurn: input.liveTurn,
  })

  const view: BargainIntelligenceView = {
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    customer,
    state: transition,
    strategy,
    spin,
    agents,
    validation,
    recommendation,
    context,
    metrics: {
      agentCount: agents.length,
      llmCalls: 0,
      promptChars: 0,
      historyTurns: history.length,
      durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs as number)) : 0,
      deterministic: true,
    },
  }

  const promptBlock = buildIntelligencePromptBlock(view)
  view.metrics.promptChars = promptBlock.length

  return {
    ...view,
    promptBlock,
    metadata: {
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      conversationState: transition.current,
      previousState: transition.previous,
      stateTransition: transition.transition,
      stateTransitionValid: transition.valid,
      strategy: strategy.code,
      priority: strategy.priority,
      readiness: customer.readiness,
      objectionCategory: customer.objectionCategory,
      recommendation,
      offerBasis: customer.offerBasis,
      offerClarificationNeeded: customer.offerClarificationNeeded,
      validationReason: validation.reason,
      floorSafe: validation.floorSafe,
      agentCount: agents.length,
      llmCalls: 0,
      durationMs: view.metrics.durationMs,
    },
  }
}

export function applyFinalCommercialValidation(
  state: BargainIntelligenceState,
  input: IntelligenceInput,
): BargainIntelligenceState {
  const validation = validateCommercialTurn({
    customerOffer: input.customerOffer,
    proposedPrice: input.proposedPrice,
    originalPrice: input.originalPrice,
    minPrice: input.minPrice,
    attemptsUsed: input.attemptsUsed,
    maxAttempts: input.maxAttempts,
    product: input.product,
    sessionStatus: input.sessionStatus,
    emergencyPaused: input.emergencyPaused,
    campaignActive: input.campaignActive,
    offerQuantity: input.offerStructure?.quantity ?? null,
    couponMentioned: input.couponMentioned,
    couponsAllowed: input.couponsAllowed,
    dealAccepted: input.dealAccepted,
    offerClarificationNeeded: input.offerStructure?.needsClarification ?? input.intent.offerClarificationNeeded,
  })
  return {
    ...state,
    validation,
    metadata: {
      ...state.metadata,
      validationReason: validation.reason,
      floorSafe: validation.floorSafe,
    },
  }
}

export { conversationStateFromMetadata }
export { INTELLIGENCE_SCHEMA_VERSION } from './types'
export type { BargainIntelligenceState, BargainIntelligenceView, IntelligenceInput, IntelligenceMetadata } from './types'

export function intelligenceView(state: BargainIntelligenceState): BargainIntelligenceView {
  const { promptBlock, metadata, ...view } = state
  return view
}

export function publicIntelligenceView(state: BargainIntelligenceState): PublicBargainIntelligenceView {
  return {
    schemaVersion: state.schemaVersion,
    customer: {
      readiness: state.customer.readiness,
      engagement: state.customer.engagement,
      urgency: state.customer.urgency,
      productKnowledge: state.customer.productKnowledge,
      claimRisk: state.customer.claimRisk,
      offerBasis: state.customer.offerBasis,
      offerQuantity: state.customer.offerQuantity,
      offerClarificationNeeded: state.customer.offerClarificationNeeded,
    },
    state: {
      current: state.state.current,
      terminal: state.state.terminal,
    },
    recommendation: state.recommendation,
    metrics: {
      llmCalls: state.metrics.llmCalls,
      deterministic: state.metrics.deterministic,
    },
  }
}
