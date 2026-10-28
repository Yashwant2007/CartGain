import type { ShopkeeperPersonality } from './types'
import { analyzeIntent } from '../intent'
import { extractPrice } from '../text'

export type ExpressionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'curious'
  | 'surprised'
  | 'amused'
  | 'skeptical'
  | 'negotiating'
  | 'disappointed'
  | 'happy'
  | 'celebrating'
  | 'declining'
  | 'error'

export type AvatarEvent =
  | 'CHAT_OPENED'
  | 'CUSTOMER_MESSAGE_RECEIVED'
  | 'AI_THINKING_STARTED'
  | 'AI_RESPONSE_RECEIVED'
  | 'COUNTEROFFER_PRESENTED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_REJECTED'
  | 'CUSTOMER_DISENGAGED'
  | 'API_ERROR'
  | 'SESSION_RESTORED'

const EXPRESSION_MAP: Record<ShopkeeperPersonality, Record<AvatarEvent, ExpressionState>> = {
  friendly_shopkeeper: {
    CHAT_OPENED: 'listening',
    CUSTOMER_MESSAGE_RECEIVED: 'listening',
    AI_THINKING_STARTED: 'thinking',
    AI_RESPONSE_RECEIVED: 'happy',
    COUNTEROFFER_PRESENTED: 'negotiating',
    OFFER_ACCEPTED: 'celebrating',
    OFFER_REJECTED: 'disappointed',
    CUSTOMER_DISENGAGED: 'idle',
    API_ERROR: 'error',
    SESSION_RESTORED: 'listening',
  },
  strict_shopkeeper: {
    CHAT_OPENED: 'listening',
    CUSTOMER_MESSAGE_RECEIVED: 'listening',
    AI_THINKING_STARTED: 'thinking',
    AI_RESPONSE_RECEIVED: 'negotiating',
    COUNTEROFFER_PRESENTED: 'negotiating',
    OFFER_ACCEPTED: 'celebrating',
    OFFER_REJECTED: 'declining',
    CUSTOMER_DISENGAGED: 'idle',
    API_ERROR: 'error',
    SESSION_RESTORED: 'listening',
  },
  playful_shopkeeper: {
    CHAT_OPENED: 'curious',
    CUSTOMER_MESSAGE_RECEIVED: 'listening',
    AI_THINKING_STARTED: 'thinking',
    AI_RESPONSE_RECEIVED: 'amused',
    COUNTEROFFER_PRESENTED: 'surprised',
    OFFER_ACCEPTED: 'celebrating',
    OFFER_REJECTED: 'amused',
    CUSTOMER_DISENGAGED: 'idle',
    API_ERROR: 'error',
    SESSION_RESTORED: 'curious',
  },
}

export function expressionForEvent(
  personality: ShopkeeperPersonality,
  event: AvatarEvent,
): ExpressionState {
  return EXPRESSION_MAP[personality]?.[event] ?? 'idle'
}

export type TurnDecision = 'chat' | 'counter' | 'accept' | 'reject' | 'skipped' | null
export type TurnEnded = 'accepted' | 'rejected' | 'abandoned' | 'skipped' | null

export interface AvatarTurnContext {
  customerMessage?: string | null
  aiReply?: string | null
  counterOffer?: number | null
  originalPrice?: number | null
  decision?: string | null
  ended?: string | null
}

const DECLINE_REPLY_RE = /\b(can'?t|cannot|won'?t|not possible|impossible|below|no can do|not able|out of (?:my )?range)\b/i
const WARM_REPLY_RE = /\b(congrat|deal(?: done)?|done|agreed|accept(?:ed)?|locked|perfect|great choice|enjoy|confirmed)\b/i

function lowballRatio(message: string, originalPrice?: number | null): number | null {
  if (originalPrice == null || !Number.isFinite(originalPrice) || originalPrice <= 0) return null
  const offer = extractPrice(message)
  if (offer == null || !Number.isFinite(offer) || offer <= 0) return null
  return offer / originalPrice
}

/**
 * The shopkeeper's face while reading the shopper's latest message. This runs
 * before the reply, so the avatar reflects the customer's behaviour (lowball,
 * walkout threat, price complaint, buying signal) rather than a generic
 * "message received" pose.
 */
export function expressionForShopperMessage(
  personality: ShopkeeperPersonality,
  message: string,
  originalPrice?: number | null,
): ExpressionState {
  const text = message.trim()
  if (!text) return expressionForEvent(personality, 'CUSTOMER_MESSAGE_RECEIVED')

  const intent = analyzeIntent(text)
  const ratio = lowballRatio(text, originalPrice)

  if (intent.intent === 'WALKOUT') {
    if (personality === 'strict_shopkeeper') return 'declining'
    if (personality === 'playful_shopkeeper') return 'skeptical'
    return 'disappointed'
  }

  if (intent.intent === 'PURCHASE_READY') return 'happy'

  if (ratio != null && ratio <= 0.6) {
    if (personality === 'strict_shopkeeper') return 'skeptical'
    if (personality === 'playful_shopkeeper') return 'surprised'
    return 'skeptical'
  }

  if (intent.priceComplaint || intent.intent === 'COMPARISON') {
    if (personality === 'playful_shopkeeper') return 'amused'
    if (personality === 'strict_shopkeeper') return 'skeptical'
    return 'listening'
  }

  if (intent.intent === 'PRODUCT_QUESTION' || intent.intent === 'VALUE_UNCLEAR') {
    if (personality === 'playful_shopkeeper') return 'curious'
    return 'listening'
  }

  if (intent.intent === 'BUDGET_CONSTRAINT' || intent.intent === 'PRICE_ONLY') {
    if (personality === 'strict_shopkeeper') return 'skeptical'
    if (personality === 'playful_shopkeeper') return 'curious'
    return 'listening'
  }

  if (intent.intent === 'RECOMMENDATION_REQUEST' || intent.intent === 'PRODUCT_DISCOVERY') {
    if (personality === 'playful_shopkeeper') return 'curious'
    return 'listening'
  }

  if (intent.intent === 'GENERIC_CHAT' && personality === 'playful_shopkeeper') return 'amused'
  return 'listening'
}

/**
 * The shopkeeper's face after the reply lands. Uses the real negotiation outcome
 * plus the shopper's last message, so a friendly shopkeeper looks disappointed
 * at a walkout, a strict one looks declining, and a playful one keeps a wry
 * edge until the negotiation actually ends.
 */
export function expressionForTurn(
  personality: ShopkeeperPersonality,
  context: AvatarTurnContext = {},
): ExpressionState {
  const { decision, ended, counterOffer, aiReply, customerMessage } = context

  if (ended === 'accepted' || ended === 'skipped' || decision === 'accept') {
    return 'celebrating'
  }

  if (ended === 'rejected' || ended === 'abandoned' || decision === 'reject') {
    if (personality === 'strict_shopkeeper') return 'declining'
    return 'disappointed'
  }

  if (decision === 'counter' || (counterOffer != null && Number.isFinite(counterOffer))) {
    if (personality === 'playful_shopkeeper') return 'surprised'
    return 'negotiating'
  }

  if (aiReply && DECLINE_REPLY_RE.test(aiReply)) {
    if (personality === 'strict_shopkeeper') return 'declining'
    return 'skeptical'
  }

  if (aiReply && WARM_REPLY_RE.test(aiReply)) {
    if (personality === 'playful_shopkeeper') return 'amused'
    return 'happy'
  }

  if (customerMessage) {
    return expressionForShopperMessage(personality, customerMessage, context.originalPrice)
  }

  return expressionForEvent(personality, 'AI_RESPONSE_RECEIVED')
}

export function isExpressionState(value: unknown): value is ExpressionState {
  return typeof value === 'string' && [
    'idle', 'listening', 'thinking', 'curious', 'surprised', 'amused', 'skeptical',
    'negotiating', 'disappointed', 'happy', 'celebrating', 'declining', 'error',
  ].includes(value)
}
