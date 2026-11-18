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

export interface ShopkeeperAnimation extends LivingEventContext {
  /** Body / animation state (18 states). */
  state: AvatarState
  /** Face (13 expressions). */
  expression: ExpressionState
  /** Body language for this character. */
  gesture: GestureName
  /** Where the character stands. */
  position: AvatarPosition
}

const LEGACY_EVENT: Record<LivingEvent, AvatarEvent> = {
  idle: 'CUSTOMER_DISENGAGED',
  widget_opened: 'CHAT_OPENED',
  customer_typing: 'CUSTOMER_MESSAGE_RECEIVED',
  customer_message: 'CUSTOMER_MESSAGE_RECEIVED',
  ai_thinking: 'AI_THINKING_STARTED',
  ai_reply: 'AI_RESPONSE_RECEIVED',
  counter_offer: 'COUNTEROFFER_PRESENTED',
  recommendations_shown: 'AI_RESPONSE_RECEIVED',
  recommendation_selected: 'AI_RESPONSE_RECEIVED',
  deal_accepted: 'OFFER_ACCEPTED',
  deal_rejected: 'OFFER_REJECTED',
  checkout_started: 'AI_RESPONSE_RECEIVED',
  session_ended: 'CUSTOMER_DISENGAGED',
  widget_closed: 'CUSTOMER_DISENGAGED',
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

/**
 * Resolve a conversation event into the complete character animation.
 *
 * Deterministic: the same (personality, event, context) always yields the
 * same state, face, gesture and position.
 */
export function resolveShopkeeperAnimation(
  personality: ShopkeeperPersonality,
  event: LivingEvent,
  ctx: LivingEventContext = {},
): ShopkeeperAnimation {
  const state = avatarStateForEvent(personality, event, ctx)
  const expression = expressionForLivingEvent(personality, event, ctx)
  const gesture = gestureFor(personality, state)
  const position = positionForContext({
    customerMessage: ctx.customerMessage ?? null,
    decision: ctx.decision ?? null,
    ended: ctx.ended ?? null,
    hasRecommendations: ctx.hasRecommendations,
    checkoutStarted: ctx.checkoutStarted,
    opening: ctx.opening,
  })
  return { ...ctx, state, expression, gesture, position }
}

/**
 * A timed pose change (for example returning to `idle` after a celebration)
 * still resolves through the same face table, so the face always follows the
 * body.
 */
export function animationForState(personality: ShopkeeperPersonality, state: AvatarState): ShopkeeperAnimation {
  return {
    state,
    expression: expressionForAvatarState(state),
    gesture: gestureFor(personality, state),
    position: 'conversation',
  }
}
