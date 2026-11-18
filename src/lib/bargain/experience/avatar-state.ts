// ─────────────────────────────────────────────────────────────────────────────
// LIVING SHOPKEEPER — animation state machine (pure, deterministic)
// ─────────────────────────────────────────────────────────────────────────────
//
// The shopkeeper is driven by REAL conversation events, never by randomness.
// This module owns the BODY layer: the eighteen animation states the character
// can be in. The FACE layer (thirteen expressions) lives in `expressions.ts`
// and is derived from the very same event, so the two can never drift apart.
//
// Rules:
//   * Every state is reachable from a named conversation event.
//   * The same event + context always yields the same state.
//   * No state may imply a price, a discount or a confirmed deal — pricing
//     authority stays entirely on the trusted backend.
//

import type { ShopkeeperPersonality } from './types'
import { analyzeIntent } from '../intent'
import { extractPrice } from '../text'

export const AVATAR_STATES = [
  'idle',
  'entering',
  'greeting',
  'listening',
  'typing',
  'thinking',
  'calculating',
  'surprised',
  'confused',
  'happy',
  'disappointed',
  'negotiating',
  'recommending',
  'pointing',
  'walking',
  'celebrating',
  'guiding_to_checkout',
  'goodbye',
] as const

export type AvatarState = (typeof AVATAR_STATES)[number]

export function isAvatarState(value: unknown): value is AvatarState {
  return typeof value === 'string' && (AVATAR_STATES as readonly string[]).includes(value)
}

/**
 * The conversation events the character reacts to. These are raised by the
 * widget from actual UI/server events — never invented by a timer.
 */
export const LIVING_EVENTS = [
  'idle',
  'widget_opened',
  'customer_typing',
  'customer_message',
  'ai_thinking',
  'ai_reply',
  'counter_offer',
  'recommendations_shown',
  'recommendation_selected',
  'deal_accepted',
  'deal_rejected',
  'checkout_started',
  'session_ended',
  'widget_closed',
] as const

export type LivingEvent = (typeof LIVING_EVENTS)[number]

export function isLivingEvent(value: unknown): value is LivingEvent {
  return typeof value === 'string' && (LIVING_EVENTS as readonly string[]).includes(value)
}

/** Everything the resolver may look at. All optional — the resolver is pure. */
export interface LivingEventContext {
  /** The shopper's latest message (raw text, analysed deterministically). */
  customerMessage?: string | null
  /** The shopkeeper's latest reply (server-issued). */
  aiReply?: string | null
  /** The counter the server put on the table. */
  counterOffer?: number | null
  /** The listed price of the product being negotiated. */
  originalPrice?: number | null
  /** Engine decision for the turn: chat | counter | accept | reject. */
  decision?: string | null
  /** Terminal status for the session, when the turn ended it. */
  ended?: string | null
  /** True when verified recommendation cards are on screen. */
  hasRecommendations?: boolean
  /** True once the shopper opened checkout. */
  checkoutStarted?: boolean
  /** True while the conversation is still in its opening beat. */
  opening?: boolean
}

function lowballRatio(message: string, originalPrice?: number | null): number | null {
  if (originalPrice == null || !Number.isFinite(originalPrice) || originalPrice <= 0) return null
  const offer = extractPrice(message)
  if (offer == null || !Number.isFinite(offer) || offer <= 0) return null
  return offer / originalPrice
}

/**
 * The BODY state for a conversation event.
 *
 * Personality only changes *how emphatic* the reaction is (strict folds their
 * arms, playful is wide-eyed) — the underlying business meaning never changes
 * and is never derived here.
 */
export function avatarStateForEvent(
  personality: ShopkeeperPersonality,
  event: LivingEvent,
  ctx: LivingEventContext = {},
): AvatarState {
  switch (event) {
    case 'widget_opened':
      return 'entering'
    case 'customer_typing':
      return 'typing'
    case 'customer_message':
      return shopperMessageState(personality, ctx)
    case 'ai_thinking':
      return 'thinking'
    case 'ai_reply':
      return replyState(ctx)
    case 'counter_offer':
      return 'negotiating'
    case 'recommendations_shown':
      return 'recommending'
    case 'recommendation_selected':
      return 'pointing'
    case 'deal_accepted':
      return 'celebrating'
    case 'deal_rejected':
      return 'disappointed'
    case 'checkout_started':
      return 'guiding_to_checkout'
    case 'session_ended':
    case 'widget_closed':
      return 'goodbye'
    case 'idle':
    default:
      return 'idle'
  }
}

function shopperMessageState(
  personality: ShopkeeperPersonality,
  ctx: LivingEventContext,
): AvatarState {
  const text = (ctx.customerMessage ?? '').trim()
  if (!text) return 'listening'

  const intent = analyzeIntent(text)
  const ratio = lowballRatio(text, ctx.originalPrice)

  if (intent.intent === 'WALKOUT') {
    return personality === 'playful_shopkeeper' ? 'confused' : 'disappointed'
  }

  if (intent.intent === 'PURCHASE_READY') return 'happy'

  if (ratio != null && ratio <= 0.6) {
    if (personality === 'playful_shopkeeper') return 'surprised'
    if (personality === 'friendly_shopkeeper') return 'confused'
    return 'disappointed'
  }

  if (
    intent.intent === 'PRODUCT_QUESTION' ||
    intent.intent === 'RECOMMENDATION_REQUEST' ||
    intent.intent === 'PRODUCT_DISCOVERY' ||
    intent.intent === 'VALUE_UNCLEAR'
  ) {
    return 'recommending'
  }

  if (
    intent.intent === 'PRICE_ONLY' ||
    intent.intent === 'BUDGET_CONSTRAINT' ||
    intent.intent === 'COMPARISON' ||
    intent.priceComplaint
  ) {
    return 'negotiating'
  }

  if (intent.intent === 'PURCHASE_HESITATION') {
    return personality === 'strict_shopkeeper' ? 'disappointed' : 'confused'
  }

  return 'listening'
}

function replyState(ctx: LivingEventContext): AvatarState {
  const decision = (ctx.decision ?? '').toLowerCase()
  const ended = (ctx.ended ?? '').toLowerCase()
  if (ended === 'accepted' || decision === 'accept') return 'celebrating'
  if (ended === 'rejected' || ended === 'abandoned' || decision === 'reject') return 'disappointed'
  if (decision === 'counter' || (ctx.counterOffer != null && Number.isFinite(ctx.counterOffer))) {
    return 'calculating'
  }
  return 'listening'
}

/**
 * A deterministic transition table: what the character may do NEXT.
 *
 * Used by the widget to decide whether a one-shot animation may replay and to
 * keep the character from flickering between incompatible poses.
 */
export const AVATAR_TRANSITIONS: Record<AvatarState, readonly AvatarState[]> = {
  idle: ['entering', 'listening', 'goodbye'],
  entering: ['greeting', 'listening', 'idle', 'goodbye'],
  greeting: ['listening', 'typing', 'thinking', 'recommending', 'goodbye'],
  listening: ['typing', 'thinking', 'recommending', 'negotiating', 'goodbye', 'idle'],
  typing: ['listening', 'thinking', 'goodbye'],
  thinking: ['calculating', 'negotiating', 'recommending', 'listening', 'happy', 'disappointed', 'surprised', 'confused'],
  calculating: ['negotiating', 'celebrating', 'disappointed', 'listening'],
  surprised: ['listening', 'negotiating', 'recommending', 'confused', 'idle'],
  confused: ['listening', 'recommending', 'negotiating', 'disappointed', 'idle'],
  happy: ['listening', 'celebrating', 'guiding_to_checkout', 'idle'],
  disappointed: ['listening', 'negotiating', 'recommending', 'goodbye', 'idle'],
  negotiating: ['calculating', 'thinking', 'celebrating', 'disappointed', 'listening'],
  recommending: ['pointing', 'listening', 'negotiating', 'goodbye'],
  pointing: ['listening', 'recommending', 'guiding_to_checkout'],
  walking: ['listening', 'recommending', 'guiding_to_checkout', 'idle'],
  celebrating: ['guiding_to_checkout', 'goodbye', 'idle'],
  guiding_to_checkout: ['celebrating', 'goodbye', 'idle'],
  goodbye: ['idle', 'entering'],
}

export function canTransitionAvatarState(from: AvatarState, to: AvatarState): boolean {
  if (from === to) return true
  return (AVATAR_TRANSITIONS[from] ?? []).includes(to)
}

/**
 * The FACE that belongs to a body state.
 *
 * Used when the character changes pose without a conversation event (for
 * example a timed return to `idle` after a celebration).
 */
export function expressionForAvatarState(state: AvatarState): import('./expressions').ExpressionState {
  switch (state) {
    case 'entering':
    case 'greeting':
    case 'listening':
    case 'typing':
    case 'walking':
      return 'listening'
    case 'thinking':
      return 'thinking'
    case 'calculating':
    case 'negotiating':
      return 'negotiating'
    case 'surprised':
      return 'surprised'
    case 'confused':
      return 'curious'
    case 'happy':
      return 'happy'
    case 'disappointed':
      return 'disappointed'
    case 'recommending':
    case 'pointing':
      return 'curious'
    case 'celebrating':
      return 'celebrating'
    case 'guiding_to_checkout':
      return 'happy'
    case 'goodbye':
    case 'idle':
    default:
      return 'idle'
  }
}
