import type {
  ConcessionPosture,
  CustomerUnderstandingSnapshot,
  GoalPressure,
  IntelligenceGoalContext,
  NegotiationStrategyCode,
  ResponsePriority,
  StrategyDecision,
} from './types'

interface StrategyInput {
  customer: CustomerUnderstandingSnapshot
  goal?: IntelligenceGoalContext | null
  attemptsUsed: number
  maxAttempts: number
  recommendationsEnabled: boolean
  recommendationAvailable: boolean
  sessionStatus?: string | null
  needHumanSupport?: boolean
}

function goalPressureFor(goal?: IntelligenceGoalContext | null): GoalPressure {
  if (!goal) return 'none'
  if (goal.mode === 'behind') return 'high'
  if (goal.mode === 'ahead') return 'low'
  if (goal.mode === 'on_track') return 'moderate'
  if (typeof goal.progressPercent === 'number' && goal.progressPercent >= 85) return 'high'
  return 'none'
}

function decision(
  code: NegotiationStrategyCode,
  priority: ResponsePriority,
  concessionPosture: ConcessionPosture,
  rationaleCode: string,
  customer: CustomerUnderstandingSnapshot,
  goalPressure: GoalPressure,
): StrategyDecision {
  return {
    code,
    priority,
    concessionPosture,
    goalPressure,
    hesitationDetected: customer.urgency === 'high' || customer.intent === 'WALKOUT' || customer.intent === 'PURCHASE_HESITATION',
    urgencyDetected: customer.urgency !== 'none',
    engagement: customer.engagement,
    rationaleCode,
  }
}

export function chooseNegotiationStrategy(input: StrategyInput): StrategyDecision {
  const { customer } = input
  const goalPressure = goalPressureFor(input.goal)
  const atLimit = input.maxAttempts > 0 && input.attemptsUsed >= input.maxAttempts - 1
  const canRecommend = input.recommendationsEnabled && input.recommendationAvailable

  if (input.needHumanSupport) {
    return decision('PATIENT', 'hold_boundary', 'no_quote', 'human_support_required', customer, goalPressure)
  }
  if (customer.offerClarificationNeeded) {
    return decision('PATIENT', 'diagnose_need', 'no_quote', 'offer_basis_unclear', customer, goalPressure)
  }
  if (customer.readiness === 'committed' || input.sessionStatus === 'accepted' || input.sessionStatus === 'purchased') {
    return decision('CLOSING', 'confirm_checkout', 'close_now', 'deal_already_agreed', customer, goalPressure)
  }
  if (customer.readiness === 'ready') {
    return decision('CLOSING', 'close', 'close_now', 'purchase_ready', customer, goalPressure)
  }
  if (customer.intent === 'WALKOUT' || customer.intent === 'PURCHASE_HESITATION' || customer.urgency === 'high') {
    return decision('RECOVERY', 'recover_trust', customer.hasRealOffer ? 'bounded_step' : 'no_quote', 'exit_or_hesitation_risk', customer, goalPressure)
  }
  if (canRecommend && (customer.intent === 'RECOMMENDATION_REQUEST' || customer.intent === 'PRODUCT_MISMATCH' || customer.objection === 'AVAILABILITY')) {
    return decision('ALTERNATIVE_FOCUS', 'offer_alternative', 'no_quote', 'alternative_requested', customer, goalPressure)
  }
  if (canRecommend && customer.objection === 'BUDGET' && !customer.hasRealOffer) {
    return decision('ALTERNATIVE_FOCUS', 'offer_alternative', 'no_quote', 'budget_below_fit', customer, goalPressure)
  }
  if (customer.engagement === 'low') {
    return decision('PATIENT', 'diagnose_need', customer.hasRealOffer ? 'hold' : 'no_quote', 'low_engagement', customer, goalPressure)
  }
  if (atLimit && !customer.readiness.startsWith('ready')) {
    return decision('FIRM', 'hold_boundary', 'hold', 'attempt_budget_nearing_end', customer, goalPressure)
  }
  if (
    customer.objectionCategory === 'PRICE_OBJECTION' ||
    customer.objectionCategory === 'BUDGET_OBJECTION' ||
    customer.objectionCategory === 'COMPARISON_OBJECTION' ||
    customer.objectionCategory === 'QUALITY_OBJECTION' ||
    customer.objectionCategory === 'TRUST_OBJECTION'
  ) {
    return decision('VALUE_FOCUS', 'resolve_objection', customer.hasRealOffer && customer.engagement === 'high' ? 'small_step' : 'hold', 'objection_requires_value_first', customer, goalPressure)
  }
  if (goalPressure === 'high' && customer.engagement === 'high') {
    return decision('CLOSING', 'close', customer.hasRealOffer ? 'small_step' : 'bounded_step', 'goal_window_pressure', customer, goalPressure)
  }
  if (customer.intent === 'PRODUCT_QUESTION' || customer.intent === 'PRODUCT_DISCOVERY') {
    return decision('DISCOVERY', 'diagnose_need', 'no_quote', 'discovery_before_quote', customer, goalPressure)
  }
  if (customer.hasRealOffer) {
    return decision('VALUE_FOCUS', 'resolve_objection', 'small_step', 'real_offer_needs_value_frame', customer, goalPressure)
  }
  return decision('DISCOVERY', 'diagnose_need', 'no_quote', 'no_clear_buying_signal', customer, goalPressure)
}
