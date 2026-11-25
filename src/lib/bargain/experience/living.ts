// ─────────────────────────────────────────────────────────────────────────────
// LIVING SHOPKEEPER — the single resolver
// ─────────────────────────────────────────────────────────────────────────────
//
// One pure function turns a conversation event into everything the character
// needs: body state, face, gesture and position. Because there is exactly ONE
// resolver, the face, the body and the placement can never disagree with the
// conversation that actually happened.
//

import type { ShopkeeperPersonality } from './types'
import {
  avatarStateForEvent,
  expressionForAvatarState,
  type AvatarState,
  type LivingEvent,
  type LivingEventContext,
} from './avatar-state'
import { expressionForEvent, expressionForShopperMessage, expressionForTurn, type AvatarEvent, type ExpressionState } from './expressions'
import { gestureFor, type GestureName } from './character'
import { positionForContext, type AvatarPosition } from './positions'
import { isConversationState, priorityReaction } from '../conversation-state'
import type { ConversationState } from '../conversation-state'
import { reactionForAnimation, type BargainReaction } from './reactions'

export interface FireAvatarContext extends LivingEventContext {
  /** True when verified product cards are on screen. */
  hasRecommendations?: boolean
  /** True once the shopper opened checkout. */
  checkoutStarted?: boolean
  /** True while the conversation is still in its opening beat. */
  opening?: boolean
  /** The server's conversational state for this turn, when it reported one. */
  conversationState?: string | null
}

export interface ShopkeeperAnimation extends FireAvatarContext {
  /** The real UI/server event that produced this pose. */
  event?: LivingEvent
  /** Monotonic token so consecutive identical events still animate once each. */
  eventSequence?: number
  /** Body / animation state (18 states). */
  state: AvatarState
  /** Face (13 expressions). */
  expression: ExpressionState
  /** Body language for this character. */
  gesture: GestureName
  /** Where the character stands. */
  position: AvatarPosition
  /** Sprite reaction chosen from the shopper's latest chat, for V2 avatars. */
  reaction?: BargainReaction | null
}

let livingEventSequence = 0

const LEGACY_EVENT: Record<LivingEvent, AvatarEvent> = {
  idle: 'CUSTOMER_DISENGAGED',
  widget_opened: 'CHAT_OPENED',
  greeting: 'CHAT_OPENED',
  customer_typing: 'CUSTOMER_MESSAGE_RECEIVED',
  customer_message: 'CUSTOMER_MESSAGE_RECEIVED',
  ai_thinking: 'AI_THINKING_STARTED',
  ai_typing: 'AI_THINKING_STARTED',
  ai_reply: 'AI_RESPONSE_RECEIVED',
  counter_offer: 'COUNTEROFFER_PRESENTED',
  recommendations_shown: 'AI_RESPONSE_RECEIVED',
  recommendation_selected: 'AI_RESPONSE_RECEIVED',
  deal_accepted: 'OFFER_ACCEPTED',
  deal_rejected: 'OFFER_REJECTED',
  checkout_started: 'AI_RESPONSE_RECEIVED',
  session_ended: 'CUSTOMER_DISENGAGED',
  widget_closed: 'CUSTOMER_DISENGAGED',
  error: 'API_ERROR',
}

function expressionForLivingEvent(
  personality: ShopkeeperPersonality,
  event: LivingEvent,
  ctx: LivingEventContext,
): ExpressionState {
  if (event === 'customer_message' && ctx.customerMessage) {
    return expressionForShopperMessage(personality, ctx.customerMessage, ctx.originalPrice ?? null)
  }
  if (event === 'ai_reply' || event === 'counter_offer') {
    return expressionForTurn(personality, ctx)
  }
  if (event === 'customer_message') {
    return expressionForEvent(personality, 'CUSTOMER_MESSAGE_RECEIVED')
  }
  return expressionForEvent(personality, LEGACY_EVENT[event] ?? 'CUSTOMER_DISENGAGED')
}

const PRIORITY_BODY: Partial<Record<ConversationState, AvatarState>> = {
  COMPLETED: 'celebrating',
  REJECTED: 'disappointed',
  EXPIRED: 'disappointed',
  CANCELLED: 'goodbye',
  CUSTOMER_HESITATION: 'confused',
  HUMAN_SUPPORT_REQUIRED: 'confused',
}

const PRIORITY_POSITION: Partial<Record<ConversationState, AvatarPosition>> = {
  COMPLETED: 'celebration',
  REJECTED: 'conversation',
  EXPIRED: 'conversation',
  CANCELLED: 'conversation',
  CUSTOMER_HESITATION: 'conversation',
  HUMAN_SUPPORT_REQUIRED: 'conversation',
}

export function priorityAnimationForConversationState(
  personality: ShopkeeperPersonality,
  state: string | null | undefined,
): Pick<ShopkeeperAnimation, 'state' | 'expression' | 'gesture' | 'position'> | null {
  if (!isConversationState(state)) return null
  const expression = priorityReaction(state)
  const body = PRIORITY_BODY[state]
  const position = PRIORITY_POSITION[state]
  if (!expression || !body || !position) return null
  return { state: body, expression, gesture: gestureFor(personality, body), position }
}

/**
 * Resolve a conversation event into the complete character animation.
 *
 * Deterministic: the same (personality, event, context) always yields the
 * same state, face, gesture and position.
 */
export function resolveShopkeeperAnimation(
  personality: ShopkeeperPersonality,
  event: LivingEvent,
  ctx: FireAvatarContext = {},
): ShopkeeperAnimation {
  const freshTurn = event === 'customer_message' || event === 'customer_typing'
    || event === 'ai_thinking' || event === 'ai_typing'
    || event === 'widget_opened' || event === 'greeting'
  const turnCtx: FireAvatarContext = freshTurn
    ? { ...ctx, ended: null, decision: null }
    : ctx
  const state = avatarStateForEvent(personality, event, turnCtx)
  const expression = expressionForLivingEvent(personality, event, turnCtx)
  const gesture = gestureFor(personality, state)
  const position = positionForContext({
    customerMessage: turnCtx.customerMessage ?? null,
    decision: turnCtx.decision ?? null,
    ended: turnCtx.ended ?? null,
    hasRecommendations: turnCtx.hasRecommendations,
    checkoutStarted: turnCtx.checkoutStarted,
    opening: turnCtx.opening,
  })
  const override = priorityAnimationForConversationState(personality, turnCtx.conversationState)
  return {
    ...turnCtx,
    event,
    eventSequence: ++livingEventSequence,
    state: override?.state ?? state,
    expression: override?.expression ?? expression,
    gesture: override?.gesture ?? gesture,
    position: override?.position ?? position,
    reaction: reactionForAnimation(event, turnCtx, personality) ?? undefined,
  }
}

/**
 * A timed pose change (for example returning to `idle` after a celebration)
 * still resolves through the same face table, so the face always follows the
 * body.
 */
export function animationForState(personality: ShopkeeperPersonality, state: AvatarState): ShopkeeperAnimation {
  return {
    event: 'idle',
    eventSequence: ++livingEventSequence,
    state,
    expression: expressionForAvatarState(state),
    gesture: gestureFor(personality, state),
    position: 'conversation',
  }
}
