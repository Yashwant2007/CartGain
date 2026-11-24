import {
  canTransitionConversation,
  deriveConversationState,
  isConversationState,
  isTerminalConversationState,
  type ConversationState,
} from '../conversation-state'
import type { IntentAnalysis } from '../intent'
import type { AiDecisionCode, ContextSummary, IntelligenceHistoryEntry, StateTransitionView } from './types'

interface StateInput {
  history: IntelligenceHistoryEntry[]
  intent: IntentAnalysis
  sessionStatus?: string | null
  attemptsUsed: number
  walkoutTriggered?: boolean
  dealAccepted?: boolean
  pendingAccept?: boolean
  checkoutStarted?: boolean
  purchaseVerified?: boolean
  recommendationsEnabled?: boolean
  needHumanSupport?: boolean
}

const AI_DECISIONS = new Set(['idle', 'chat', 'counter', 'accept', 'reject'])

function aiDecisionFor(value?: string | null): AiDecisionCode {
  return value && AI_DECISIONS.has(value) ? value as AiDecisionCode : 'unknown'
}

export function resolveIntelligenceState(input: StateInput): { transition: StateTransitionView; context: ContextSummary } {
  let current = deriveConversationState({
    sessionStatus: input.sessionStatus,
    attemptsUsed: input.attemptsUsed,
    walkoutTriggered: input.walkoutTriggered || input.intent.intent === 'WALKOUT',
    dealAccepted: input.dealAccepted,
    checkoutStarted: input.checkoutStarted,
    purchaseVerified: input.purchaseVerified,
    intent: input.intent.intent,
    objection: input.intent.objection,
    offersPriceSignal: input.intent.offersPriceSignal,
    recommendationsEnabled: input.recommendationsEnabled,
    needHumanSupport: input.needHumanSupport,
  })
  if (input.pendingAccept === true && (input.sessionStatus == null || input.sessionStatus === 'active')) {
    current = 'PURCHASE_READY'
  }

  const aiHistory = input.history.filter((entry) => entry.role === 'ai')
  const lastAi = aiHistory[aiHistory.length - 1]
  const previous = lastAi && isConversationState(lastAi.intelligenceState) ? lastAi.intelligenceState : null
  const valid = previous == null || previous === current || canTransitionConversation(previous, current)
  const transition: StateTransitionView = {
    previous,
    current,
    transition: `${previous ?? 'START'}->${current}`,
    valid,
    terminal: isTerminalConversationState(current),
  }

  const customerTurns = input.history.filter((entry) => entry.role === 'customer').length
  const aiTurns = aiHistory.length
  const lastCustomer = input.history.filter((entry) => entry.role === 'customer').slice(-2)
  const repeatedMessage = lastCustomer.length === 2 && lastCustomer[0].content.trim() === lastCustomer[1].content.trim()

  const context: ContextSummary = {
    historyTurns: input.history.length,
    customerTurns,
    aiTurns,
    repeatedMessage,
    lastAiDecision: aiDecisionFor(lastAi?.decision),
    lastKnownState: previous,
    avoidRepetition: repeatedMessage || aiTurns > 0,
  }

  return { transition, context }
}

export function conversationStateFromMetadata(value: unknown): ConversationState | null {
  return isConversationState(value) ? value : null
}
