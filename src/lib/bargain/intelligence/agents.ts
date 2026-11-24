import type { ConversationState } from '../conversation-state'
import type { AdaptiveContext } from '../learning/behavior-context'
import type { ClaimAssessment } from '../claims'
import type { LiveTurnAnalysis } from '../live-turn'
import type { ProductContext } from '../product-context'
import type { SessionMemory } from '../session-memory'
import type {
  AgentContribution,
  CommercialValidationView,
  CustomerUnderstandingSnapshot,
  RecommendationPosture,
  SpinInsight,
  StrategyDecision,
} from './types'

interface AgentInput {
  customer: CustomerUnderstandingSnapshot
  conversationState: ConversationState
  strategy: StrategyDecision
  spin: SpinInsight
  validation: CommercialValidationView
  recommendation: RecommendationPosture
  product?: ProductContext | null
  claims?: ClaimAssessment | null
  adaptive?: AdaptiveContext | null
  sessionMemory?: SessionMemory | null
  liveTurn?: LiveTurnAnalysis | null
}

export function buildAgentContributions(input: AgentInput): AgentContribution[] {
  const { customer, conversationState, strategy, spin, validation, recommendation } = input
  const contributions: AgentContribution[] = [
    {
      agent: 'intent_agent',
      summary: `intent=${customer.intent}; secondary=${customer.secondaryIntents.join(',') || 'none'}; objection=${customer.objection ?? 'none'}; category=${customer.objectionCategory}; requirements=${customer.requirements.join(',') || 'none'}; readiness=${customer.readiness}; engagement=${customer.engagement}; style=${customer.communicationStyle}`,
      priority: customer.readiness === 'committed' || customer.intent === 'WALKOUT' ? 90 : 70,
    },
    {
      agent: 'product_expert_agent',
      summary: `knowledge=${customer.productKnowledge}; claimRisk=${customer.claimRisk}; verifiedFacts=${input.product && !input.product.fetchFailed ? 'yes' : 'no'}; faq=${input.product?.merchantFaq.length ?? 0}`,
      priority: customer.productKnowledge === 'unavailable' || customer.claimRisk === 'high' ? 95 : 60,
    },
    {
      agent: 'negotiation_strategist',
      summary: `strategy=${strategy.code}; priority=${strategy.priority}; concession=${strategy.concessionPosture}; goalPressure=${strategy.goalPressure}; rationale=${strategy.rationaleCode}`,
      priority: 80,
    },
    {
      agent: 'closer_agent',
      summary: strategy.priority === 'confirm_checkout'
        ? 'confirm_existing_quote_and_checkout_only'
        : strategy.priority === 'close'
          ? 'close_with_authoritative_quote_only'
          : strategy.priority === 'recover_trust'
            ? 'reduce_one_verified_risk_then_ask'
            : spin.nextDimension
              ? `diagnose_${spin.nextDimension}`
              : 'answer_then_ask_one_decisive_question',
      priority: strategy.priority === 'confirm_checkout' || strategy.priority === 'close' ? 92 : 65,
    },
    {
      agent: 'orchestrator',
      summary: `state=${conversationState}; repetitionRisk=${customer.repeatPattern ? 'yes' : 'no'}; validation=${validation.checked ? (validation.ok ? 'safe' : 'blocked') : 'not_applicable'}; recommendation=${recommendation}; behavior=${input.adaptive?.behavior ?? 'unknown'}; tone=${input.sessionMemory?.tone ?? 'warm'}`,
      priority: 100,
    },
  ]

  return contributions.sort((a, b) => b.priority - a.priority || a.agent.localeCompare(b.agent))
}
