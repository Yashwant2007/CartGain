import {
  CONVERSATION_STATES,
  deriveConversationState,
  conversationStateGuidance,
  conversationStateReaction,
  priorityReaction,
  canTransitionConversation,
  isTerminalConversationState,
  isNegotiableConversationState,
  isConversationState,
} from '../conversation-state'
import { SESSION_STATUS, type SessionStatus } from '../negotiation-state'

describe('conversation state machine (Phase 9)', () => {
  it('covers every spec state', () => {
    const required = [
      'GREETING', 'PRODUCT_DISCOVERY', 'INTENT_DETECTION', 'OBJECTION_HANDLING',
      'NEGOTIATION', 'COUNTER_OFFER', 'PURCHASE_READY', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED',
      'SECURE_CHECKOUT', 'PURCHASE_VERIFICATION', 'COMPLETED', 'CUSTOMER_HESITATION',
      'REJECTED', 'EXPIRED', 'CANCELLED', 'HUMAN_SUPPORT_REQUIRED',
    ]
    for (const s of required) expect(CONVERSATION_STATES).toContain(s)
  })

  it('derives terminal states from session facts first', () => {
    expect(deriveConversationState({ sessionStatus: 'purchased', attemptsUsed: 3 })).toBe('COMPLETED')
    expect(deriveConversationState({ sessionStatus: 'rejected', attemptsUsed: 3 })).toBe('REJECTED')
    expect(deriveConversationState({ sessionStatus: 'expired', attemptsUsed: 3 })).toBe('EXPIRED')
    expect(deriveConversationState({ sessionStatus: 'abandoned', attemptsUsed: 3 })).toBe('CANCELLED')
  })

  it('maps accepted → DEAL_ACCEPTED and checkoutStarted → SECURE_CHECKOUT', () => {
    expect(deriveConversationState({ sessionStatus: 'accepted', attemptsUsed: 2 })).toBe('DEAL_ACCEPTED')
    expect(deriveConversationState({ sessionStatus: 'accepted', attemptsUsed: 2, checkoutStarted: true })).toBe('SECURE_CHECKOUT')
  })

  it('treats a walkout as hesitation, never termination', () => {
    expect(deriveConversationState({ attemptsUsed: 1, walkoutTriggered: true })).toBe('CUSTOMER_HESITATION')
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'WALKOUT' })).toBe('CUSTOMER_HESITATION')
  })

  it('routes purchase hesitation to a diagnosis-first hesitation state', () => {
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PURCHASE_HESITATION' })).toBe('CUSTOMER_HESITATION')
    expect(conversationStateGuidance('CUSTOMER_HESITATION')).toMatch(/NAME the hesitation/i)
    expect(conversationStateGuidance('CUSTOMER_HESITATION')).toMatch(/Do NOT discount/i)
  })

  it('opens in GREETING before any attempt', () => {
    expect(deriveConversationState({ attemptsUsed: 0 })).toBe('GREETING')
  })

  it('routes a price bid to COUNTER_OFFER and a non-price objection to OBJECTION_HANDLING', () => {
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PRICE_ONLY', offersPriceSignal: true })).toBe('COUNTER_OFFER')
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PRODUCT_QUESTION', objection: 'TRUST' })).toBe('OBJECTION_HANDLING')
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PRODUCT_QUESTION', objection: 'QUALITY' })).toBe('OBJECTION_HANDLING')
  })

  it('does not route non-offer price numbers to COUNTER_OFFER', () => {
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PRICE_ONLY', objection: 'PRICE', offersPriceSignal: false })).toBe('OBJECTION_HANDLING')
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'BUDGET_CONSTRAINT', objection: 'BUDGET', offersPriceSignal: false })).toBe('OBJECTION_HANDLING')
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PRICE_ONLY', offersPriceSignal: false })).toBe('NEGOTIATION')
    expect(conversationStateGuidance('NEGOTIATION')).toContain('has not named a real bid')
  })

  it('does not claim a deal just because the shopper says they are ready to buy', () => {
    const state = deriveConversationState({ attemptsUsed: 1, intent: 'PURCHASE_READY' })
    expect(state).toBe('PURCHASE_READY')
    expect(conversationStateGuidance(state)).not.toContain('deal is agreed')
    expect(conversationStateReaction(state)).toBe('curious')
  })

  it('routes discovery/recommendation intents', () => {
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'PRODUCT_DISCOVERY' })).toBe('PRODUCT_DISCOVERY')
    expect(deriveConversationState({ attemptsUsed: 1, intent: 'RECOMMENDATION_REQUEST', recommendationsEnabled: true })).toBe('ALTERNATIVE_RECOMMENDATION')
  })

  it('hands off to a human when flagged', () => {
    expect(deriveConversationState({ attemptsUsed: 1, needHumanSupport: true })).toBe('HUMAN_SUPPORT_REQUIRED')
  })

  it('never allows a terminal state to move (except human handoff from a few)', () => {
    expect(isTerminalConversationState('COMPLETED')).toBe(true)
    expect(canTransitionConversation('COMPLETED', 'NEGOTIATION')).toBe(false)
    expect(canTransitionConversation('REJECTED', 'NEGOTIATION')).toBe(false)
    expect(canTransitionConversation('EXPIRED', 'NEGOTIATION')).toBe(false)
    expect(canTransitionConversation('PURCHASE_READY', 'DEAL_ACCEPTED')).toBe(true)
    expect(canTransitionConversation('DEAL_ACCEPTED', 'SECURE_CHECKOUT')).toBe(true)
    expect(canTransitionConversation('GREETING', 'NEGOTIATION')).toBe(true)
  })

  it('has guidance and a reaction for every state', () => {
    for (const s of CONVERSATION_STATES) {
      expect(conversationStateGuidance(s).length).toBeGreaterThan(10)
      expect(typeof conversationStateReaction(s)).toBe('string')
    }
  })

  it('validates state strings', () => {
    expect(isConversationState('NEGOTIATION')).toBe(true)
    expect(isConversationState('nope')).toBe(false)
  })

  it('keeps a purchased session COMPLETED even with conflicting negotiation flags', () => {
    const purchased = {
      sessionStatus: SESSION_STATUS.PURCHASED,
      attemptsUsed: 4,
      dealAccepted: true,
      checkoutStarted: true,
      walkoutTriggered: true,
      needHumanSupport: true,
      intent: 'PRICE_ONLY' as const,
      offersPriceSignal: true,
    }
    const state = deriveConversationState(purchased)
    expect(state).toBe('COMPLETED')
    expect(isTerminalConversationState(state)).toBe(true)
    expect(isNegotiableConversationState(state)).toBe(false)
    expect(canTransitionConversation(state, 'NEGOTIATION')).toBe(false)
    expect(priorityReaction(state)).toBe('celebrating')
  })

  it('never derives a negotiable state from a terminal session status', () => {
    const terminal: SessionStatus[] = [
      SESSION_STATUS.ACCEPTED,
      SESSION_STATUS.REJECTED,
      SESSION_STATUS.EXPIRED,
      SESSION_STATUS.ABANDONED,
      SESSION_STATUS.PURCHASED,
    ]
    for (const sessionStatus of terminal) {
      const state = deriveConversationState({ sessionStatus, attemptsUsed: 3, intent: 'PRICE_ONLY', offersPriceSignal: true })
      expect(isNegotiableConversationState(state)).toBe(false)
      expect(canTransitionConversation(state, 'NEGOTIATION')).toBe(false)
    }
  })
})

describe('priorityReaction', () => {
  it('lets unambiguous terminal/hesitation states win the avatar face', () => {
    expect(priorityReaction('COMPLETED')).toBe('celebrating')
    expect(priorityReaction('REJECTED')).toBe('disappointed')
    expect(priorityReaction('EXPIRED')).toBe('disappointed')
    expect(priorityReaction('CUSTOMER_HESITATION')).toBe('skeptical')
    expect(priorityReaction('HUMAN_SUPPORT_REQUIRED')).toBe('error')
  })

  it('leaves mid-negotiation states to the finer-grained reaction logic', () => {
    expect(priorityReaction('NEGOTIATION')).toBeNull()
    expect(priorityReaction('COUNTER_OFFER')).toBeNull()
    expect(priorityReaction('DEAL_ACCEPTED')).toBeNull()
  })
})
