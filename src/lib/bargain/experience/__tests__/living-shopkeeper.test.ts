import { describe, expect, it } from '@jest/globals'
import {
  AVATAR_STATES,
  avatarStateForEvent,
  canTransitionAvatarState,
  expressionForAvatarState,
  isAvatarState,
  LIVING_EVENTS,
  type AvatarState,
  type LivingEvent,
} from '../avatar-state'
import { CHARACTER_PROFILES, gestureFor, supportsGestureLayer } from '../character'
import { avatarStateForEvent as stateForEvent } from '../avatar-state'
import { AVATAR_POSITIONS, asksAboutProduct, isAvatarPosition, positionForContext } from '../positions'
import { resolveShopkeeperAnimation } from '../living'
import {
  PERSONALITY_STRATEGIES,
  reactionLine,
  strategyIntentInstruction,
  strategyPromptBlock,
} from '../strategy'
import type { ShopkeeperPersonality } from '../types'

const PERSONALITIES: ShopkeeperPersonality[] = [
  'friendly_shopkeeper',
  'strict_shopkeeper',
  'playful_shopkeeper',
]

describe('living shopkeeper animation states', () => {
  it('defines exactly the eighteen required states', () => {
    expect(AVATAR_STATES).toHaveLength(18)
    expect([...AVATAR_STATES].sort()).toEqual([
      'calculating', 'celebrating', 'confused', 'disappointed', 'entering',
      'greeting', 'guiding_to_checkout', 'happy', 'idle', 'listening',
      'negotiating', 'pointing', 'recommending', 'surprised', 'thinking',
      'typing', 'walking', 'goodbye',
    ].sort())
    for (const state of AVATAR_STATES) expect(isAvatarState(state)).toBe(true)
    expect(isAvatarState('dancing')).toBe(false)
  })

  it('maps every conversation event to a state deterministically', () => {
    for (const event of LIVING_EVENTS) {
      const a = avatarStateForEvent('friendly_shopkeeper', event)
      const b = avatarStateForEvent('friendly_shopkeeper', event)
      expect(a).toBe(b)
      expect(isAvatarState(a)).toBe(true)
    }
  })

  it('drives the character from real events, never at random', () => {
    expect(avatarStateForEvent('friendly_shopkeeper', 'widget_opened')).toBe('entering')
    expect(avatarStateForEvent('friendly_shopkeeper', 'greeting')).toBe('greeting')
    expect(avatarStateForEvent('friendly_shopkeeper', 'customer_typing')).toBe('listening')
    expect(avatarStateForEvent('friendly_shopkeeper', 'ai_thinking')).toBe('thinking')
    expect(avatarStateForEvent('friendly_shopkeeper', 'ai_typing')).toBe('typing')
    expect(avatarStateForEvent('friendly_shopkeeper', 'counter_offer')).toBe('negotiating')
    expect(avatarStateForEvent('friendly_shopkeeper', 'recommendations_shown')).toBe('recommending')
    expect(avatarStateForEvent('friendly_shopkeeper', 'recommendation_selected')).toBe('pointing')
    expect(avatarStateForEvent('friendly_shopkeeper', 'deal_accepted')).toBe('celebrating')
    expect(avatarStateForEvent('friendly_shopkeeper', 'deal_rejected')).toBe('disappointed')
    expect(avatarStateForEvent('friendly_shopkeeper', 'checkout_started')).toBe('guiding_to_checkout')
    expect(avatarStateForEvent('friendly_shopkeeper', 'widget_closed')).toBe('goodbye')
  })

  it('reacts to a low offer with a personality-appropriate body language', () => {
    expect(stateForEvent('strict_shopkeeper', 'customer_message', { customerMessage: '₹200', originalPrice: 1000 })).toBe('disappointed')
    expect(stateForEvent('friendly_shopkeeper', 'customer_message', { customerMessage: '₹200', originalPrice: 1000 })).toBe('confused')
    expect(stateForEvent('playful_shopkeeper', 'customer_message', { customerMessage: '₹200', originalPrice: 1000 })).toBe('surprised')
  })

  it('reacts to a reasonable offer without treating it as a question', () => {
    expect(stateForEvent('friendly_shopkeeper', 'customer_message', { customerMessage: '₹900', originalPrice: 1000 })).toBe('negotiating')
    expect(stateForEvent('friendly_shopkeeper', 'customer_message', { customerMessage: 'I will take it, let us do it.', originalPrice: 1000 })).toBe('happy')
  })

  it('does not strike a bargaining pose for non-offer numbers', () => {
    expect(stateForEvent('friendly_shopkeeper', 'customer_message', { customerMessage: 'I need 2 items', originalPrice: 1000 })).toBe('listening')
    expect(stateForEvent('strict_shopkeeper', 'customer_message', { customerMessage: 'my order #1234', originalPrice: 1000 })).toBe('listening')
    expect(stateForEvent('playful_shopkeeper', 'customer_message', { customerMessage: 'model 2024', originalPrice: 1000 })).toBe('listening')
    expect(stateForEvent('friendly_shopkeeper', 'customer_message', { customerMessage: '999 is too much', originalPrice: 1000 })).toBe('thinking')
  })

  it('switches to salesperson mode for product questions instead of bargaining', () => {
    for (const personality of PERSONALITIES) {
      expect(stateForEvent(personality, 'customer_message', { customerMessage: 'What material is this made of?', originalPrice: 1000 })).toBe('recommending')
      expect(stateForEvent(personality, 'customer_message', { customerMessage: 'Do you have a cheaper alternative?', originalPrice: 1000 })).toBe('recommending')
    }
  })

  it('keeps a legal transition table', () => {
    expect(canTransitionAvatarState('idle', 'entering')).toBe(true)
    expect(canTransitionAvatarState('celebrating', 'guiding_to_checkout')).toBe(true)
    expect(canTransitionAvatarState('idle', 'celebrating')).toBe(false)
  })

  it('always has a face for every body state', () => {
    for (const state of AVATAR_STATES) {
      expect(expressionForAvatarState(state)).toBeTruthy()
    }
  })
})

describe('living shopkeeper characters', () => {
  it('gives every personality its own silhouette and title', () => {
    expect(CHARACTER_PROFILES.strict_shopkeeper.title).toBe('The Strict Shopkeeper')
    expect(CHARACTER_PROFILES.friendly_shopkeeper.title).toBe('The Friendly Shopkeeper')
    expect(CHARACTER_PROFILES.playful_shopkeeper.title).toBe('The Playful Shopkeeper')
    const silhouettes = new Set(PERSONALITIES.map((p) => CHARACTER_PROFILES[p].silhouette))
    expect(silhouettes.size).toBe(3)
  })

  it('gives every personality a distinct body language in the same state', () => {
    const gestures = PERSONALITIES.map((p) => gestureFor(p, 'negotiating'))
    expect(new Set(gestures).size).toBe(3)
  })

  it('keeps the gesture layer only for the signature visual style', () => {
    expect(supportsGestureLayer('signature')).toBe(true)
    expect(supportsGestureLayer('minimal')).toBe(false)
  })
})

describe('living shopkeeper position manager', () => {
  it('defines the six contextual positions', () => {
    expect(AVATAR_POSITIONS).toHaveLength(6)
    for (const p of AVATAR_POSITIONS) expect(isAvatarPosition(p)).toBe(true)
    expect(isAvatarPosition('floating')).toBe(false)
  })

  it('puts the character in the conversation by default', () => {
    expect(positionForContext({})).toBe('conversation')
    expect(positionForContext({ opening: true })).toBe('product_intro')
  })

  it('moves the character to the recommendation area when cards are shown', () => {
    expect(positionForContext({ hasRecommendations: true })).toBe('recommendation')
  })

  it('moves the character beside the product when the shopper asks a question', () => {
    expect(positionForContext({ customerMessage: 'What material is it?' })).toBe('product_explanation')
    expect(asksAboutProduct('What material is it?')).toBe(true)
    expect(asksAboutProduct('Can you do 800?')).toBe(false)
  })

  it('moves the character to the celebration and checkout slots at the right moments', () => {
    expect(positionForContext({ decision: 'accept', ended: 'accepted' })).toBe('celebration')
    expect(positionForContext({ checkoutStarted: true })).toBe('checkout')
  })
})

describe('living shopkeeper resolver', () => {
  it('keeps the face, body and position in agreement', () => {
    const resolved = resolveShopkeeperAnimation('strict_shopkeeper', 'customer_message', {
      customerMessage: '₹200',
      originalPrice: 1000,
    })
    expect(resolved.state).toBe('disappointed')
    expect(resolved.expression).toBe('skeptical')
    expect(resolved.gesture).toBe('crossed_arms')
    expect(resolved.position).toBe('conversation')
  })

  it('honours an unambiguous conversation state across face, body and position', () => {
    const resolved = resolveShopkeeperAnimation('strict_shopkeeper', 'ai_reply', {
      customerMessage: 'Thanks!',
      decision: 'chat',
      conversationState: 'COMPLETED',
    })
    expect(resolved.state).toBe('celebrating')
    expect(resolved.expression).toBe('celebrating')
    expect(resolved.position).toBe('celebration')
  })

  it('keeps mid-negotiation states event-driven', () => {
    const resolved = resolveShopkeeperAnimation('friendly_shopkeeper', 'counter_offer', {
      customerMessage: 'Can you do 900?',
      counterOffer: 950,
      originalPrice: 1000,
      conversationState: 'NEGOTIATION',
    })
    expect(resolved.state).toBe('negotiating')
    expect(resolved.expression).toBe('negotiating')
  })

  it('uses the recommending body when verified cards arrive with a reply', () => {
    expect(resolveShopkeeperAnimation('friendly_shopkeeper', 'ai_reply', { hasRecommendations: true }).state).toBe('recommending')
  })

  it('never leaks a price, floor or margin into the animation payload', () => {
    const resolved = resolveShopkeeperAnimation('playful_shopkeeper', 'counter_offer', {
      counterOffer: 900,
      originalPrice: 1000,
    })
    const serialized = JSON.stringify(resolved)
    expect(serialized).not.toMatch(/minPrice|floor|margin|profit/i)
  })
})

describe('living shopkeeper personality strategy', () => {
  it('gives each personality a distinct negotiation strategy', () => {
    const ids = PERSONALITIES.map((p) => PERSONALITY_STRATEGIES[p].id)
    expect(new Set(ids).size).toBe(3)
    expect(PERSONALITY_STRATEGIES.strict_shopkeeper.exploresAlternatives).toBe(false)
    expect(PERSONALITY_STRATEGIES.friendly_shopkeeper.exploresAlternatives).toBe(true)
    expect(PERSONALITY_STRATEGIES.playful_shopkeeper.concise).toBe(true)
  })

  it('states explicitly that personality never changes what the shopper can be charged', () => {
    for (const personality of PERSONALITIES) {
      const block = strategyPromptBlock(personality)
      expect(block).toMatch(/never changes what the shopper can be charged/i)
      expect(block).not.toMatch(/\d+\s*%/)
    }
  })

  it('forbids a discount when the shopper only wants product information', () => {
    for (const personality of PERSONALITIES) {
      const instruction = strategyIntentInstruction(personality, 'PRODUCT_QUESTION', 'PRODUCT_INFORMATION')
      expect(instruction).toBeTruthy()
      expect(instruction).toMatch(/do NOT open with an offer/i)
    }
    expect(strategyIntentInstruction('friendly_shopkeeper', 'PRICE_ONLY', 'PRICE_OBJECTION')).toBeNull()
  })

  it('keeps the pre-reply reaction line free of prices and outcomes', () => {
    const situations = ['low_offer', 'question', 'counter', 'deal', 'greeting'] as const
    for (const personality of PERSONALITIES) {
      for (const situation of situations) {
        const line = reactionLine(personality, situation)
        expect(line).toBeTruthy()
        expect(line).not.toMatch(/[₹$€£]\s*\d/)
        expect(line).not.toMatch(/\b\d+(\.\d+)?\s*%/)
      }
    }
  })
})
