import type { IntentAnalysis } from '../intent'
import type { ProductContext } from '../product-context'
import type { CustomerUnderstandingSnapshot, IntelligenceHistoryEntry, SpinDimension, SpinInsight, StrategyDecision } from './types'

interface SpinInput {
  customer: CustomerUnderstandingSnapshot
  intent: IntentAnalysis
  product?: ProductContext | null
  history: IntelligenceHistoryEntry[]
  strategy: StrategyDecision
}

const QUESTIONS: Record<SpinDimension, string> = {
  situation: 'What are you hoping this will help with?',
  problem: 'What is the main thing you want to get right?',
  implication: 'What would that change for you if we got it right?',
  need_payoff: 'If we solve that, what would make this an easy yes?',
}

const ORDER: SpinDimension[] = ['situation', 'problem', 'implication', 'need_payoff']

export function buildSpinInsight(input: SpinInput): SpinInsight {
  const { customer, intent, product, history, strategy } = input
  const customerTurns = history.filter((entry) => entry.role === 'customer').length
  const known: Record<SpinDimension, boolean> = {
    situation: Boolean(intent.need) || intent.intent === 'PRODUCT_DISCOVERY' || customerTurns >= 2,
    problem: customer.objection != null || customer.emotion === 'frustrated' || intent.priceComplaint,
    implication: customer.budgetSignal !== 'none' || customer.urgency === 'high' || customer.hasRealOffer || customer.repeatPattern,
    need_payoff: customer.readiness === 'ready' || customer.readiness === 'committed' || intent.asksBestPrice,
  }

  if (product?.selectedVariant && customer.productKnowledge === 'verified') known.situation = true

  const blockQuestion = strategy.priority === 'confirm_checkout' || strategy.priority === 'close' || strategy.priority === 'hold_boundary'
  const nextDimension = blockQuestion ? null : ORDER.find((dimension) => !known[dimension]) ?? null

  return {
    known,
    nextDimension,
    question: nextDimension ? QUESTIONS[nextDimension] : null,
    avoidRepetition: customer.repeatPattern || ORDER.filter((dimension) => known[dimension]).length >= 2,
  }
}
