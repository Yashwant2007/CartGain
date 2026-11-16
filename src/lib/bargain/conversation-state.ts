// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION STATE MACHINE (Master Upgrade Phase 9) — deterministic, pure
// ─────────────────────────────────────────────────────────────────────────────
// A single, explicit conversation model that sits on top of the persisted
// session lifecycle. Where `negotiation-state.ts` owns the *session status*
// (active/accepted/…), this owns the *conversational* state the shopkeeper is
// in for a given turn. It is derived deterministically from already-authoritative
// signals (session status, intent, attempt count, walkout/abuse flags) — never
// from the language model — so it can be used to:
//   1. steer the prompt with one clear instruction for the current turn,
//   2. drive the storefront avatar reaction, and
//   3. prevent loops, contradictions and false "order complete" claims.
//
// The model is a graph, not a queue: a turn may jump (e.g. OBJECTION_HANDLING →
// COUNTER_OFFER) when the shopper's message warrants it, but terminal states are
// absorbing.

import type { ShopperIntent, ShopperObjection } from './intent'
import type { ExpressionState } from './experience/expressions'

export const CONVERSATION_STATES = [
  'GREETING',
  'PRODUCT_DISCOVERY',
  'INTENT_DETECTION',
  'OBJECTION_HANDLING',
  'NEGOTIATION',
  'COUNTER_OFFER',
  'ALTERNATIVE_RECOMMENDATION',
  'DEAL_ACCEPTED',
  'SECURE_CHECKOUT',
  'PURCHASE_VERIFICATION',
  'COMPLETED',
  'CUSTOMER_HESITATION',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'HUMAN_SUPPORT_REQUIRED',
] as const

export type ConversationState = (typeof CONVERSATION_STATES)[number]

export function isConversationState(value: unknown): value is ConversationState {
  return typeof value === 'string' && (CONVERSATION_STATES as readonly string[]).includes(value)
}

/** Absorbing states — once here, the conversation only replays a result. */
const TERMINAL: ReadonlySet<ConversationState> = new Set<ConversationState>([
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
])

export function isTerminalConversationState(state: ConversationState): boolean {
  return TERMINAL.has(state)
}

// Legal forward transitions. Broad on purpose (a shopkeeper can move between
// objection handling and negotiation freely), but it encodes the rules that
// matter: you cannot re-negotiate a completed/rejected/expired deal, and you
// cannot reach SECURE_CHECKOUT/COMPLETED without passing through DEAL_ACCEPTED.
export const CONVERSATION_TRANSITIONS: Record<ConversationState, readonly ConversationState[]> = {
  GREETING: ['PRODUCT_DISCOVERY', 'INTENT_DETECTION', 'OBJECTION_HANDLING', 'NEGOTIATION', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'CANCELLED'],
  PRODUCT_DISCOVERY: ['INTENT_DETECTION', 'OBJECTION_HANDLING', 'NEGOTIATION', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'CANCELLED'],
  INTENT_DETECTION: ['PRODUCT_DISCOVERY', 'OBJECTION_HANDLING', 'NEGOTIATION', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'CANCELLED'],
  OBJECTION_HANDLING: ['INTENT_DETECTION', 'NEGOTIATION', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'REJECTED', 'CANCELLED'],
  NEGOTIATION: ['OBJECTION_HANDLING', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  COUNTER_OFFER: ['OBJECTION_HANDLING', 'NEGOTIATION', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  ALTERNATIVE_RECOMMENDATION: ['OBJECTION_HANDLING', 'NEGOTIATION', 'COUNTER_OFFER', 'DEAL_ACCEPTED', 'CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED', 'REJECTED', 'CANCELLED'],
  DEAL_ACCEPTED: ['SECURE_CHECKOUT', 'PURCHASE_VERIFICATION', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
  SECURE_CHECKOUT: ['PURCHASE_VERIFICATION', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
  PURCHASE_VERIFICATION: ['COMPLETED', 'CANCELLED', 'HUMAN_SUPPORT_REQUIRED'],
  COMPLETED: [],
  CUSTOMER_HESITATION: ['OBJECTION_HANDLING', 'NEGOTIATION', 'COUNTER_OFFER', 'ALTERNATIVE_RECOMMENDATION', 'DEAL_ACCEPTED', 'REJECTED', 'CANCELLED', 'HUMAN_SUPPORT_REQUIRED'],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  HUMAN_SUPPORT_REQUIRED: ['NEGOTIATION', 'DEAL_ACCEPTED', 'CANCELLED'],
}

export function canTransitionConversation(from: ConversationState, to: ConversationState): boolean {
  return (CONVERSATION_TRANSITIONS[from] ?? []).includes(to)
}

export interface ConversationStateInput {
  /** Persisted session status (active|accepting|accepted|rejected|expired|abandoned|purchased). */
  sessionStatus?: string | null
  attemptsUsed: number
  walkoutTriggered?: boolean
  dealAccepted?: boolean
  /** True once a quote/order is being verified or completed (Phase 4 lifecycle). */
  purchaseVerified?: boolean
  checkoutStarted?: boolean
  intent?: ShopperIntent | null
  objection?: ShopperObjection
  offersPriceSignal?: boolean
  recommendationsEnabled?: boolean
  /** Set by the abuse classifier when the turn must be handed to a human. */
  needHumanSupport?: boolean
}

/**
 * Derive the current conversational state. Pure and deterministic — the same
 * inputs always produce the same state, and the language model never decides it.
 */
export function deriveConversationState(input: ConversationStateInput): ConversationState {
  const status = input.sessionStatus ?? 'active'

  // Terminal session facts win over everything else.
  if (status === 'purchased' || input.purchaseVerified) return 'COMPLETED'
  if (status === 'rejected') return 'REJECTED'
  if (status === 'expired') return 'EXPIRED'
  if (status === 'abandoned') return 'CANCELLED'
  if (input.needHumanSupport) return 'HUMAN_SUPPORT_REQUIRED'
  if (status === 'accepted' || input.dealAccepted) {
    return input.checkoutStarted ? 'SECURE_CHECKOUT' : 'DEAL_ACCEPTED'
  }

  // Walkout is a hesitation/retention moment, never an immediate termination.
  if (input.walkoutTriggered || input.intent === 'WALKOUT') return 'CUSTOMER_HESITATION'
  if (input.intent === 'PURCHASE_READY') return 'DEAL_ACCEPTED'

  if (input.intent === 'PRODUCT_DISCOVERY') return 'PRODUCT_DISCOVERY'
  if (input.intent === 'RECOMMENDATION_REQUEST') {
    return input.recommendationsEnabled === false ? 'INTENT_DETECTION' : 'ALTERNATIVE_RECOMMENDATION'
  }

  if (input.attemptsUsed <= 0) return 'GREETING'

  // A non-price objection answered before any bid is objection handling.
  if (input.objection && !input.offersPriceSignal && input.intent !== 'PRICE_ONLY' && input.intent !== 'BUDGET_CONSTRAINT') {
    return 'OBJECTION_HANDLING'
  }

  if (input.intent === 'PRODUCT_QUESTION') return 'INTENT_DETECTION'

  if (input.intent === 'PRICE_ONLY' || input.intent === 'BUDGET_CONSTRAINT' || input.offersPriceSignal) {
    return 'COUNTER_OFFER'
  }

  return 'NEGOTIATION'
}

/** One concise prompt instruction for the current conversational state. */
export function conversationStateGuidance(state: ConversationState): string {
  switch (state) {
    case 'GREETING':
      return 'You are opening the conversation. Warm, short, name the product once. Do not offer a discount yet — invite them to talk.'
    case 'PRODUCT_DISCOVERY':
      return 'The shopper is exploring. Help them find the right item; ask ONE short question if needed. Do not discount before there is a product in view.'
    case 'INTENT_DETECTION':
      return 'Answer the shopper\'s question factually from verified product facts, then ask ONE short question to learn what matters. Do not jump to a discount.'
    case 'OBJECTION_HANDLING':
      return 'The shopper has a concern that is NOT primarily price. Address it honestly (value, fit, trust, shipping, quality) BEFORE any concession. Only counter if they then ask for price.'
    case 'NEGOTIATION':
      return 'You are mid-negotiation. Move deliberately; reward real movement with a small step, hold firm against testing. Never reveal or cross the floor.'
    case 'COUNTER_OFFER':
      return 'The shopper named a number. Respond with a concrete counter and a one-line reason. Never accept below the floor; never repeat a rejected number.'
    case 'ALTERNATIVE_RECOMMENDATION':
      return 'Offer a genuinely relevant alternative from the store\'s own catalogue (see RECOMMENDATIONS), explain WHY it fits, and let them return to the original product.'
    case 'DEAL_ACCEPTED':
      return 'The deal is agreed. Confirm the price and the secure checkout link plainly. Do not reopen negotiation or invent extra discounts.'
    case 'SECURE_CHECKOUT':
      return 'The shopper is at checkout. Be brief and reassuring; confirm the locked price and that the checkout link is secure. Do not change the price.'
    case 'PURCHASE_VERIFICATION':
      return 'Payment is being verified. Never claim the order is complete until the authoritative confirmation arrives. Reassure without inventing a status.'
    case 'COMPLETED':
      return 'The purchase is confirmed. Thank them warmly and briefly. Do not re-offer or reopen the deal.'
    case 'CUSTOMER_HESITATION':
      return 'The shopper is hesitating or hinting they may leave. De-escalate, offer ONE genuine final step or a graceful exit. Never chase desperately or fabricate urgency.'
    case 'REJECTED':
      return 'The negotiation ended without a deal. Stay gracious; leave the door open without pushing. Do not invent a new offer.'
    case 'EXPIRED':
      return 'The offer expired. Explain honestly that the price is no longer available and invite them to start a fresh negotiation. Never pretend the old price still stands.'
    case 'CANCELLED':
      return 'The conversation ended. Do not reopen it.'
    case 'HUMAN_SUPPORT_REQUIRED':
      return 'Hand this to a human. Acknowledge the concern calmly, do not argue or discount, and tell them a team member will follow up.'
  }
}

/**
 * States whose avatar reaction is unambiguous and should win over the
 * message-level heuristic (e.g. a completed purchase is always a celebration,
 * a hesitation is never "negotiating"). Mid-negotiation states are intentionally
 * excluded so the finer-grained reaction logic keeps control of the face.
 */
const PRIORITY_REACTION_STATES: ReadonlySet<ConversationState> = new Set<ConversationState>([
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'CUSTOMER_HESITATION',
  'HUMAN_SUPPORT_REQUIRED',
])

export function priorityReaction(state: ConversationState): ExpressionState | null {
  return PRIORITY_REACTION_STATES.has(state) ? conversationStateReaction(state) : null
}

/** The avatar face that matches the current conversational state. */
export function conversationStateReaction(state: ConversationState): ExpressionState {
  switch (state) {
    case 'GREETING':
      return 'listening'
    case 'PRODUCT_DISCOVERY':
    case 'INTENT_DETECTION':
    case 'ALTERNATIVE_RECOMMENDATION':
      return 'curious'
    case 'OBJECTION_HANDLING':
      return 'listening'
    case 'NEGOTIATION':
    case 'COUNTER_OFFER':
      return 'negotiating'
    case 'DEAL_ACCEPTED':
    case 'SECURE_CHECKOUT':
    case 'COMPLETED':
      return 'celebrating'
    case 'PURCHASE_VERIFICATION':
      return 'thinking'
    case 'CUSTOMER_HESITATION':
      return 'skeptical'
    case 'REJECTED':
    case 'EXPIRED':
      return 'disappointed'
    case 'CANCELLED':
      return 'idle'
    case 'HUMAN_SUPPORT_REQUIRED':
      return 'error'
  }
}
