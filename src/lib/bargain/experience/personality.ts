import type { Persona } from '@/lib/services/bargain'
import { SHOPKEEPER_PERSONALITIES, type ShopkeeperPersonality } from './types'

export const SHOPKEEPER_PERSONALITY_GUIDANCE: Record<ShopkeeperPersonality, string> = {
  friendly_shopkeeper:
    'SHOPKEEPER PERSONALITY: Friendly. Be warm, patient and helpful. Respond positively to reasonable offers, explain value, and offer alternatives when a price is not possible. Never use fake urgency or aggressive pressure.',
  strict_shopkeeper:
    'SHOPKEEPER PERSONALITY: Strict. Be confident, composed and commercially disciplined. Give concise counters and clear reasons. Never become hostile, insulting or argumentative. Merchant pricing limits do not relax under pressure.',
  playful_shopkeeper:
    'SHOPKEEPER PERSONALITY: Playful. Be witty, expressive and energetic with restrained humor and tasteful emoji. You may tease unrealistic offers without embarrassing the shopper and celebrate successful negotiations. Avoid spammy memes, forced jokes and excessive emoji.',
}

export function isShopkeeperPersonality(value: unknown): value is ShopkeeperPersonality {
  return typeof value === 'string' && (SHOPKEEPER_PERSONALITIES as readonly string[]).includes(value)
}

export function enginePersonaFor(shopkeeper: ShopkeeperPersonality): Persona {
  if (shopkeeper === 'strict_shopkeeper') return 'strict_negotiator'
  if (shopkeeper === 'playful_shopkeeper') return 'playful_friend'
  return 'friendly_shopkeeper'
}

export function legacyPersonaFor(shopkeeper: ShopkeeperPersonality): Persona {
  return enginePersonaFor(shopkeeper)
}

export function resolveShopkeeperPersonality(
  configured: unknown,
  legacyPersona?: unknown,
): ShopkeeperPersonality {
  if (isShopkeeperPersonality(configured)) return configured
  if (legacyPersona === 'strict_negotiator') return 'strict_shopkeeper'
  if (legacyPersona === 'playful_friend') return 'playful_shopkeeper'
  return 'friendly_shopkeeper'
}
