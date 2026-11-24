import type { AdaptiveContext } from '../learning/behavior-context'
import type { CustomerEmotion, SocialSignals } from '../behavior'
import type { ConversationState } from '../conversation-state'
import type { ClaimAssessment, CustomerClaimCategory, CustomerClaimStatus } from '../claims'
import type { IntentAnalysis, ObjectionCategory, ShopperIntent, ShopperObjection } from '../intent'
import type { LiveTurnAnalysis } from '../live-turn'
import type { ProductContext } from '../product-context'
import type { SessionMemory } from '../session-memory'
import type { OfferBasis, StructuredOffer } from '../offer-structure'
import type { OfferValidationReason } from '../offer-validation'

export type { OfferBasis } from '../offer-structure'

export const INTELLIGENCE_SCHEMA_VERSION = 1

export type BudgetSignal = 'none' | 'minimum' | 'approximate' | 'maximum'
export type PricePosture = 'none' | 'unclear' | 'complaint' | 'bid' | 'best_price_ask' | 'budget_cap' | 'over_list'
export type EngagementLevel = 'low' | 'medium' | 'high'
export type UrgencyLevel = 'none' | 'normal' | 'high'
export type PurchaseReadiness = 'unaware' | 'exploring' | 'evaluating' | 'ready' | 'committed'
export type ClaimRisk = 'none' | 'low' | 'medium' | 'high'
export type GoalPressure = 'none' | 'low' | 'moderate' | 'high'

export type NegotiationStrategyCode =
  | 'DISCOVERY'
  | 'VALUE_FOCUS'
  | 'PATIENT'
  | 'FIRM'
  | 'RECOVERY'
  | 'ALTERNATIVE_FOCUS'
  | 'CLOSING'

export type ResponsePriority =
  | 'answer_question'
  | 'resolve_objection'
  | 'diagnose_need'
  | 'hold_boundary'
  | 'recover_trust'
  | 'offer_alternative'
  | 'close'
  | 'confirm_checkout'

export type ConcessionPosture =
  | 'no_quote'
  | 'hold'
  | 'small_step'
  | 'bounded_step'
  | 'close_now'

export type RecommendationPosture = 'none' | 'avoid' | 'suggest_if_relevant' | 'suggest_now'

export type SpinDimension = 'situation' | 'problem' | 'implication' | 'need_payoff'

export type AgentName =
  | 'intent_agent'
  | 'product_expert_agent'
  | 'negotiation_strategist'
  | 'closer_agent'
  | 'orchestrator'

export type AiDecisionCode = 'idle' | 'chat' | 'counter' | 'accept' | 'reject' | 'unknown'

export interface CustomerUnderstandingSnapshot {
  intent: ShopperIntent
  objection: ShopperObjection
  objectionCategory: ObjectionCategory
  budgetSignal: BudgetSignal
  pricePosture: PricePosture
  emotion: CustomerEmotion
  engagement: EngagementLevel
  urgency: UrgencyLevel
  readiness: PurchaseReadiness
  repeatPattern: boolean
  hasRealOffer: boolean
  offerBasis: OfferBasis
  offerQuantity: number
  offerClarificationNeeded: boolean
  offerAmount: number | null
  offerUnitAmount: number | null
  offerTotalAmount: number | null
  secondaryIntents: ShopperIntent[]
  requirements: string[]
  references: string[]
  communicationStyle: 'brief' | 'warm' | 'playful' | 'calm' | 'detailed'
  unansweredQuestion: boolean
  productKnowledge: 'verified' | 'partial' | 'unavailable'
  claimRisk: ClaimRisk
  claimStatuses: CustomerClaimStatus[]
  claimCategories: CustomerClaimCategory[]
}

export interface StrategyDecision {
  code: NegotiationStrategyCode
  priority: ResponsePriority
  concessionPosture: ConcessionPosture
  goalPressure: GoalPressure
  hesitationDetected: boolean
  urgencyDetected: boolean
  engagement: EngagementLevel
  rationaleCode: string
}

export interface SpinInsight {
  known: Record<SpinDimension, boolean>
  nextDimension: SpinDimension | null
  question: string | null
  avoidRepetition: boolean
}

export interface AgentContribution {
  agent: AgentName
  summary: string
  priority: number
}

export interface CommercialValidationView {
  checked: boolean
  ok: boolean
  reason: OfferValidationReason | null
  floorSafe: boolean
  math: 'minor_units' | 'not_applicable'
  executable: boolean
}

export interface ContextSummary {
  historyTurns: number
  customerTurns: number
  aiTurns: number
  repeatedMessage: boolean
  lastAiDecision: AiDecisionCode
  lastKnownState: ConversationState | null
  avoidRepetition: boolean
}

export interface StateTransitionView {
  previous: ConversationState | null
  current: ConversationState
  transition: string
  valid: boolean
  terminal: boolean
}

export interface IntelligenceMetrics {
  agentCount: number
  llmCalls: 0
  promptChars: number
  historyTurns: number
  durationMs: number
  deterministic: true
}

export interface BargainIntelligenceView {
  schemaVersion: number
  customer: CustomerUnderstandingSnapshot
  state: StateTransitionView
  strategy: StrategyDecision
  spin: SpinInsight
  agents: AgentContribution[]
  validation: CommercialValidationView
  recommendation: RecommendationPosture
  context: ContextSummary
  metrics: IntelligenceMetrics
}

export interface IntelligenceMetadata {
  schemaVersion: number
  conversationState: ConversationState
  previousState: ConversationState | null
  stateTransition: string
  stateTransitionValid: boolean
  strategy: NegotiationStrategyCode
  priority: ResponsePriority
  readiness: PurchaseReadiness
  objectionCategory: ObjectionCategory
  recommendation: RecommendationPosture
  offerBasis: OfferBasis
  offerClarificationNeeded: boolean
  validationReason: OfferValidationReason | null
  floorSafe: boolean
  agentCount: number
  llmCalls: 0
  durationMs: number
}

export interface BargainIntelligenceState extends BargainIntelligenceView {
  promptBlock: string
  metadata: IntelligenceMetadata
}

export interface PublicBargainIntelligenceView {
  schemaVersion: number
  customer: Pick<CustomerUnderstandingSnapshot, 'readiness' | 'engagement' | 'urgency' | 'productKnowledge' | 'claimRisk' | 'offerBasis' | 'offerQuantity' | 'offerClarificationNeeded'>
  state: Pick<StateTransitionView, 'current' | 'terminal'>
  recommendation: RecommendationPosture
  metrics: Pick<IntelligenceMetrics, 'llmCalls' | 'deterministic'>
}

export interface IntelligenceHistoryEntry {
  role: 'customer' | 'ai'
  content: string
  offeredPrice?: number | null
  decision?: string | null
  intelligenceState?: ConversationState | null
}

export interface IntelligenceGoalContext {
  strategy?: string | null
  mode?: string | null
  progressPercent?: number | null
}

export interface IntelligenceInput {
  message: string
  history: IntelligenceHistoryEntry[]
  intent: IntentAnalysis
  claims?: ClaimAssessment | null
  product?: ProductContext | null
  signals?: SocialSignals | null
  liveTurn?: LiveTurnAnalysis | null
  adaptive?: AdaptiveContext | null
  sessionMemory?: SessionMemory | null
  customerOffer?: number | null
  offerStructure?: StructuredOffer | null
  originalPrice: number
  minPrice: number
  attemptsUsed: number
  maxAttempts: number
  sessionStatus?: string | null
  recommendationsEnabled?: boolean
  recommendationAvailable?: boolean
  goal?: IntelligenceGoalContext | null
  proposedPrice?: number | null
  dealAccepted?: boolean
  pendingAccept?: boolean
  checkoutStarted?: boolean
  needHumanSupport?: boolean
  emergencyPaused?: boolean
  campaignActive?: boolean | null
  couponMentioned?: boolean
  couponsAllowed?: boolean
  durationMs?: number
  now?: Date
}
