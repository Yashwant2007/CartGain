import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { Character3DState } from './types'

const MAP: Record<AvatarState, Character3DState> = {
  idle: 'idle',
  entering: 'enter',
  greeting: 'greet',
  listening: 'listen',
  typing: 'listen',
  thinking: 'think',
  calculating: 'think',
  surprised: 'surprised',
  confused: 'think',
  happy: 'smile',
  disappointed: 'disappointed',
  negotiating: 'explain',
  recommending: 'explain',
  pointing: 'point',
  walking: 'walk',
  celebrating: 'celebrate',
  guiding_to_checkout: 'guide',
  goodbye: 'goodbye',
}

/**
 * Presentation-only bridge from the conversation-driven 2D avatar state to the
 * skeletal 3D state. It carries no pricing or negotiation meaning.
 */
export function toCharacter3DState(
  state: AvatarState | undefined | null,
  personality: ShopkeeperPersonality = 'friendly_shopkeeper',
): Character3DState {
  if (!state) return 'idle'
  if (state === 'entering') return personality === 'strict_shopkeeper' ? 'idle' : 'walk'
  if (state === 'greeting') return personality === 'strict_shopkeeper' ? 'greet' : 'wave'
  if (state === 'recommending') return personality === 'playful_shopkeeper' ? 'climb' : 'explain'
  if (state === 'celebrating' && personality === 'playful_shopkeeper') return 'celebrate'
  if (state === 'walking' && personality === 'strict_shopkeeper') return 'idle'
  return MAP[state] ?? 'idle'
}
