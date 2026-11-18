// ─────────────────────────────────────────────────────────────────────────────
// LIVING SHOPKEEPER — intelligent personality engine
// ─────────────────────────────────────────────────────────────────────────────
//
// The three shopkeepers are not the same sentence in three costumes. Each has
// a distinct negotiating STRATEGY that changes how the agent reasons about the
// turn: what it leads with, what it concedes, and whether it looks for another
// product instead of another discount.
//
// IMPORTANT: a strategy is a conversational policy only. It never touches the
// price floor, the concession schedule or any merchant business rule — those
// stay in the trusted backend (computeMinPrice / negotiateStep / the accept
// route). The strategy is injected into the system prompt as guidance, and the
// backend clamps anything the model returns regardless.
//

import type { ShopkeeperPersonality } from './types'
import type { ObjectionCategory, ShopperIntent } from '../intent'

export const PERSONALITY_STRATEGY_IDS = [
  'evidence_first',
  'explore_alternatives',
  'engage_playfully',
] as const

export type PersonalityStrategyId = (typeof PERSONALITY_STRATEGY_IDS)[number]

export interface PersonalityStrategy {
  id: PersonalityStrategyId
  label: string
  /** What this personality leads with. */
  leadWith: string
  /** How it concedes, in words. */
  concede: string
  /** Whether it should look for another product when the number will not work. */
  exploresAlternatives: boolean
  /** Whether it should keep the reply short and snappy. */
  concise: boolean
}

export const PERSONALITY_STRATEGIES: Record<ShopkeeperPersonality, PersonalityStrategy> = {
  strict_shopkeeper: {
    id: 'evidence_first',
    label: 'Evidence first',
    leadWith:
      'Lead with the verified product value and the price logic. State one clear position, then one clear reason for it.',
    concede:
      'Concede only what the offer actually earned. Never soften the floor, never stack extra concessions, and never soften a rejection into an invitation.',
    exploresAlternatives: false,
    concise: true,
  },
  friendly_shopkeeper: {
    id: 'explore_alternatives',
    label: 'Find a way that works',
    leadWith:
      'Name the shopper\'s real concern first, reassure them with verified facts, and treat the price as one part of a workable solution.',
    concede:
      'Concede warmly and explain what you can do. When a price will not work, look for a genuinely relevant alternative or a different option in this store before giving up on the sale.',
    exploresAlternatives: true,
    concise: false,
  },
  playful_shopkeeper: {
    id: 'engage_playfully',
    label: 'Make it fun',
    leadWith:
      'Keep the reply short, warm and energetic. React to what the shopper just did, then move the deal forward.',
    concede:
      'Reward a genuine, clever offer with real energy and a real step. Keep the humour light and the price firm.',
    exploresAlternatives: true,
    concise: true,
  },
}

export function strategyForPersonality(personality: ShopkeeperPersonality): PersonalityStrategy {
  return PERSONALITY_STRATEGIES[personality] ?? PERSONALITY_STRATEGIES.friendly_shopkeeper
}

/**
 * The strategy block injected into the bargain system prompt.
 *
 * It describes HOW to behave. It never contains or implies a price, a floor
 * or a discount amount.
 */
export function strategyPromptBlock(personality: ShopkeeperPersonality): string {
  const strategy = strategyForPersonality(personality)
  const lines = [
    `NEGOTIATION STRATEGY (${strategy.label}): ${strategy.leadWith} ${strategy.concede}`,
    `This strategy shapes your TONE and TACTICS only. It never changes what the shopper can be charged: the merchant's hidden minimum, the maximum discount and every other business rule are enforced by the backend and are identical for all three shopkeepers.`,
  ]
  if (strategy.exploresAlternatives) {
    lines.push(
      `When the current number genuinely will not work, ONE real alternative from this store's own catalogue is a better answer than a dead end — but only when the shopper asked for options or the current product cannot serve their need.`,
    )
  } else {
    lines.push(
      `Do not redirect the shopper to another product as a way out of a price that will not move; answer the number they gave and keep the negotiation on this product.`,
    )
  }
  if (strategy.concise) {
    lines.push(`Keep each reply to two or three sentences. No speeches.`)
  }
  return lines.join('\n')
}

/**
 * Intent-aware strategy nudge.
 *
 * A shopper who only wants to know the material of a product must never be
 * answered with a discount. This returns an explicit instruction for that
 * case, and is applied on top of the existing deterministic intent routing.
 */
export function strategyIntentInstruction(
  personality: ShopkeeperPersonality,
  intent: ShopperIntent | null | undefined,
  category: ObjectionCategory | null | undefined,
): string | null {
  if (intent === 'PRODUCT_QUESTION' || category === 'PRODUCT_INFORMATION' || category === 'QUALITY_OBJECTION') {
    return `The shopper is asking for PRODUCT INFORMATION, not for a discount. Answer the question from verified product facts first. Do NOT open with an offer, do NOT volunteer a discount, and do NOT treat this turn as a negotiation round.`
  }
  if (category === 'SHIPPING_OBJECTION') {
    return `The shopper is asking about delivery. Explain the real shipping options and any real free-shipping threshold. Do NOT discount the product to compensate for shipping.`
  }
  if (category === 'TRUST_OBJECTION') {
    return `The shopper is asking whether the product is genuine. Use only verified store facts (policies, guarantees the merchant actually publishes). Never invent certifications or credentials.`
  }
  if (category === 'COMPARISON_OBJECTION') {
    return `The shopper compared this product elsewhere. Explain factual, verified differentiators. Never invent a competitor price or claim to know what another store charges.`
  }
  if (intent === 'PURCHASE_HESITATION') {
    return `The shopper is hesitating, not rejecting and not bidding. Reduce friction and answer the hesitation. Do NOT lead with a discount.`
  }
  if (strategyForPersonality(personality).exploresAlternatives && (intent === 'BUDGET_CONSTRAINT' || category === 'BUDGET_OBJECTION')) {
    return `The shopper has a stated ceiling. If that ceiling is genuinely below what the backend will allow, ONE relevant alternative from this store's catalogue is the helpful answer — never a price the backend would refuse.`
  }
  return null
}

/**
 * A short, SAFE reaction line the character can show while the real reply is
 * still being computed.
 *
 * Deliberately neutral: it never names a price, never claims a discount and
 * never states an outcome. The real, server-authored reply replaces it as
 * soon as it arrives — the character is never allowed to announce a price the
 * backend has not issued.
 */
export function reactionLine(personality: ShopkeeperPersonality, situation: 'low_offer' | 'question' | 'counter' | 'deal' | 'greeting'): string {
  const lines: Record<typeof situation, Record<ShopkeeperPersonality, string>> = {
    low_offer: {
      strict_shopkeeper: 'Let me work through that one.',
      friendly_shopkeeper: 'Let me see what we can do here.',
      playful_shopkeeper: 'Ooh, bold move — let me look at this one.',
    },
    question: {
      strict_shopkeeper: 'Good question — let me check the details.',
      friendly_shopkeeper: 'Great question! Let me look that up for you.',
      playful_shopkeeper: 'Now that is a good question. Let me dig it up.',
    },
    counter: {
      strict_shopkeeper: 'Here is where I can take it.',
      friendly_shopkeeper: 'Here is what I can do for you.',
      playful_shopkeeper: 'Okay, here is my move.',
    },
    deal: {
      strict_shopkeeper: 'That works. Let me lock it in.',
      friendly_shopkeeper: 'That is a deal! Let me get your code ready.',
      playful_shopkeeper: 'We have a deal! Let me wrap this up.',
    },
    greeting: {
      strict_shopkeeper: 'Welcome. Make me an offer.',
      friendly_shopkeeper: 'Hi there! What are we looking at?',
      playful_shopkeeper: 'Hey! Ready to bargain?',
    },
  }
  return lines[situation][personality] ?? lines[situation].friendly_shopkeeper
}
