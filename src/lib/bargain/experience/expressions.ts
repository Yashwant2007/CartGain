import type { ShopkeeperPersonality } from './types'

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

export function isExpressionState(value: unknown): value is ExpressionState {
  return typeof value === 'string' && [
    'idle', 'listening', 'thinking', 'curious', 'surprised', 'amused', 'skeptical',
    'negotiating', 'disappointed', 'happy', 'celebrating', 'declining', 'error',
  ].includes(value)
}
