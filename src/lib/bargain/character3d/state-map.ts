import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
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
  happy: 'celebrate',
  disappointed: 'disappointed',
  negotiating: 'explain',
  recommending: 'explain',
  pointing: 'point',
  walking: 'walk',
  celebrating: 'celebrate',
  guiding_to_checkout: 'guide',
  goodbye: 'exit',
}

/**
 * Presentation-only bridge from the conversation-driven 2D avatar state to the
 * skeletal 3D state. It carries no pricing or negotiation meaning.
 */
export function toCharacter3DState(state: AvatarState | undefined | null): Character3DState {
  if (!state) return 'idle'
  return MAP[state] ?? 'idle'
}
