import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { LivingEvent, LivingEventContext } from '@/lib/bargain/experience/avatar-state'
import { analyzeIntent } from '@/lib/bargain/intent'
import { extractPrice } from '@/lib/bargain/text'
import type { Character3DState } from './types'

/**
 * The 3D animation state machine.
 *
 * It maps the real conversation events onto the twenty-one skeletal states and
 * returns an ORDERED PLAN of states, so a single event can play a short
 * sequence (the playful character peeks over the frame, then greets).
 *
 * Rules:
 *   * A plan never contains a state twice.
 *   * Frame-gripping states are only ever produced for characters that are
 *     allowed to use the frame.
 *   * Ambient (idle) behaviour is separate from event behaviour and can only
 *     start from `idle`.
 */

export interface Character3DContext extends LivingEventContext {
  /** True when the chat frame has been measured and the stage is ready. */
  frameReady?: boolean
}

function lowballRatio(message: string, originalPrice?: number | null): number | null {
  if (originalPrice == null || !Number.isFinite(originalPrice) || originalPrice <= 0) return null
  const offer = extractPrice(message)
  if (offer == null || !Number.isFinite(offer) || offer <= 0) return null
  return offer / originalPrice
}

/**
 * The ordered states for a conversation event.
 */
export function planForEvent(
  personality: ShopkeeperPersonality,
  event: LivingEvent,
  ctx: Character3DContext = {},
): Character3DState[] {
  const playful = personality === 'playful_shopkeeper'
  const friendly = personality === 'friendly_shopkeeper'

  switch (event) {
    case 'widget_opened':
      return ['enter']

    case 'greeting':
      if (playful) return ['peek', 'wave']
      if (friendly) return ['wave']
      return ['greet']

    case 'customer_typing':
      return ['look_at_customer']

    case 'customer_message':
      return planForCustomerMessage(personality, ctx)

    case 'ai_thinking':
      return ['think']

    case 'ai_typing':
      return ['look_at_customer']

    case 'ai_reply':
      return planForReply(ctx)

    case 'counter_offer':
      if (friendly) return ['explain', 'point']
      return ['point']

    case 'recommendations_shown':
      if (playful) return ['climb', 'point']
      return ['explain', 'point']

    case 'recommendation_selected':
      return ['point']

    case 'deal_accepted':
      if (playful) return ['jump', 'celebrate']
      return ['celebrate']

    case 'deal_rejected':
      return ['disappointed']

    case 'checkout_started':
      return ['guide']

    case 'session_ended':
    case 'widget_closed':
      return ['exit']

    case 'error':
      return ['surprised']

    case 'idle':
    default:
      return ['idle']
  }
}

function planForCustomerMessage(
  personality: ShopkeeperPersonality,
  ctx: Character3DContext,
): Character3DState[] {
  const playful = personality === 'playful_shopkeeper'
  const friendly = personality === 'friendly_shopkeeper'
  const text = (ctx.customerMessage ?? '').trim()
  if (!text) return ['look_at_customer']

  const intent = analyzeIntent(text)
  const ratio = lowballRatio(text, ctx.originalPrice)

  if (intent.intent === 'WALKOUT') {
    return ['disappointed']
  }

  if (ratio != null && ratio <= 0.6) {
    // An unexpectedly low offer gets a physical reaction, not a shrug.
    return playful ? ['surprised'] : friendly ? ['surprised'] : ['disappointed']
  }

  if (
    intent.intent === 'PRODUCT_QUESTION' ||
    intent.intent === 'RECOMMENDATION_REQUEST' ||
    intent.intent === 'PRODUCT_DISCOVERY' ||
    intent.intent === 'VALUE_UNCLEAR'
  ) {
    // A feature question puts the character into salesperson mode.
    return playful ? ['jump', 'point'] : ['explain', 'point']
  }

  if (
    intent.intent === 'PRICE_ONLY' ||
    intent.intent === 'BUDGET_CONSTRAINT' ||
    intent.intent === 'COMPARISON' ||
    intent.priceComplaint
  ) {
    return ['think']
  }

  if (intent.intent === 'PURCHASE_HESITATION') {
    return personality === 'strict_shopkeeper' ? ['disappointed'] : ['think']
  }

  if (intent.intent === 'PURCHASE_READY') {
    return ['point']
  }

  return ['look_at_customer']
}

function planForReply(ctx: Character3DContext): Character3DState[] {
  const decision = (ctx.decision ?? '').toLowerCase()
  const ended = (ctx.ended ?? '').toLowerCase()
  if (ended === 'accepted' || decision === 'accept') return ['celebrate']
  if (ended === 'rejected' || ended === 'abandoned' || decision === 'reject') return ['disappointed']
  if (decision === 'counter' || (ctx.counterOffer != null && Number.isFinite(ctx.counterOffer))) {
    return ['point']
  }
  return ['look_at_customer']
}

/**
 * Ambient behaviour: what a character does when nothing is happening.
 *
 * Strict stays put. Friendly strolls inside the stage gutter. The playful
 * character lives on the chat frame and cycles through it.
 */
export const AMBIENT_CYCLES: Record<ShopkeeperPersonality, Character3DState[]> = {
  strict_shopkeeper: [],
  friendly_shopkeeper: ['walk', 'idle'],
  playful_shopkeeper: ['peek', 'sit', 'hang', 'climb', 'walk', 'idle'],
}

export function ambientCycleFor(personality: ShopkeeperPersonality): Character3DState[] {
  return AMBIENT_CYCLES[personality] ?? []
}

/**
 * The ambient states that require a measured chat frame. Without a frame the
 * character must not try to grip anything.
 */
export const FRAME_STATES: readonly Character3DState[] = ['sit', 'hang', 'peek', 'climb']

export function requiresFrame(state: Character3DState): boolean {
  return FRAME_STATES.includes(state)
}

/**
 * A plan is valid only if every state in it is allowed for the character and
 * the frame requirements are satisfied.
 */
export function isPlanAllowed(
  personality: ShopkeeperPersonality,
  plan: Character3DState[],
  ctx: Character3DContext = {},
): boolean {
  if (plan.length === 0) return false
  if (plan.some((state) => requiresFrame(state) && !ctx.frameReady)) return false
  if (plan.some((state) => state === 'sit' || state === 'hang' || state === 'climb')) {
    if (personality !== 'playful_shopkeeper') return false
  }
  return true
}

/**
 * Filters a plan so it only contains states this character may perform.
 */
export function sanitizePlan(
  personality: ShopkeeperPersonality,
  plan: Character3DState[],
  ctx: Character3DContext = {},
): Character3DState[] {
  const allowed = plan.filter((state) => {
    if (requiresFrame(state) && !ctx.frameReady) return false
    if ((state === 'sit' || state === 'hang' || state === 'climb') && personality !== 'playful_shopkeeper') {
      return false
    }
    return true
  })
  return allowed.length > 0 ? allowed : ['idle']
}
