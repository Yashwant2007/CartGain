import type { AvatarState } from './avatar-state'
import type { ExpressionState } from './expressions'

export const V2_AVATAR_VARIANTS = ['morgan', 'riley', 'alex'] as const
export type V2AvatarVariant = (typeof V2_AVATAR_VARIANTS)[number]

export type V2ExpressionCell = 'listening' | 'thinking' | 'countering' | 'celebrating'

export interface V2AvatarMeta {
  name: string
  role: string
  characterSheet: string
  expressionSheet: string
  accent: string
  motion: 'soft' | 'bouncy' | 'precise'
}

export const V2_AVATARS: Record<V2AvatarVariant, V2AvatarMeta> = {
  morgan: {
    name: 'Morgan',
    role: 'The Friendly Shopkeeper',
    characterSheet: '/assets/shopkeepers/v2/morgan-character.png',
    expressionSheet: '/assets/shopkeepers/v2/morgan-expressions.png',
    accent: '#14b8a6',
    motion: 'soft',
  },
  riley: {
    name: 'Riley',
    role: 'The Playful Shopkeeper',
    characterSheet: '/assets/shopkeepers/v2/riley-character.png',
    expressionSheet: '/assets/shopkeepers/v2/riley-expressions.png',
    accent: '#06b6d4',
    motion: 'bouncy',
  },
  alex: {
    name: 'Alex',
    role: 'The Strict Shopkeeper',
    characterSheet: '/assets/shopkeepers/v2/alex-character.png',
    expressionSheet: '/assets/shopkeepers/v2/alex-expressions.png',
    accent: '#334155',
    motion: 'precise',
  },
}

const CELL_BY_EXPRESSION: Record<ExpressionState, V2ExpressionCell> = {
  idle: 'listening',
  listening: 'listening',
  thinking: 'thinking',
  curious: 'thinking',
  surprised: 'countering',
  amused: 'countering',
  skeptical: 'countering',
  negotiating: 'countering',
  disappointed: 'listening',
  happy: 'celebrating',
  celebrating: 'celebrating',
  declining: 'countering',
  error: 'countering',
  focused: 'thinking',
  concerned: 'thinking',
  uncertain: 'thinking',
  determined: 'countering',
  encouraging: 'celebrating',
  impressed: 'celebrating',
  relieved: 'celebrating',
  warning: 'countering',
}

export const V2_CELL_POSITIONS: Record<V2ExpressionCell, string> = {
  listening: '0% 0%',
  thinking: '100% 0%',
  countering: '0% 100%',
  celebrating: '100% 100%',
}

export function isV2AvatarVariant(value: unknown): value is V2AvatarVariant {
  return typeof value === 'string' && (V2_AVATAR_VARIANTS as readonly string[]).includes(value)
}

export function v2CellForExpression(expression: ExpressionState): V2ExpressionCell {
  return CELL_BY_EXPRESSION[expression] ?? 'listening'
}

export function v2MotionForState(state?: AvatarState): 'listen' | 'enter' | 'think' | 'present' | 'celebrate' | 'guide' | 'recede' {
  switch (state) {
    case 'entering':
    case 'greeting':
    case 'walking':
      return 'enter'
    case 'thinking':
    case 'calculating':
    case 'confused':
      return 'think'
    case 'negotiating':
    case 'recommending':
    case 'pointing':
      return 'present'
    case 'celebrating':
    case 'happy':
      return 'celebrate'
    case 'guiding_to_checkout':
      return 'guide'
    case 'disappointed':
    case 'goodbye':
      return 'recede'
    default:
      return 'listen'
  }
}
