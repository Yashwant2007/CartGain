/**
 * Types for the real-time AI salesperson avatar.
 *
 * These are intentionally UI-only: persona/emotion/gesture are presentation
 * hints from the AI layer and NEVER influence pricing, floor protection or any
 * merchant authorization decision.
 */

export const SALESPERSON_PERSONAS = ['collaborative', 'strict', 'playful'] as const
export type SalespersonPersona = (typeof SALESPERSON_PERSONAS)[number]

export const AVATAR_EMOTIONS = [
  'idle',
  'listening',
  'thinking',
  'considering',
  'lowball',
  'counter',
  'stern',
  'disappointed',
  'happy',
  'celebrating',
] as const
export type AvatarEmotion = (typeof AVATAR_EMOTIONS)[number]

export const AVATAR_GESTURES = ['none', 'chin', 'point', 'open_palm', 'crossed_arms', 'wave', 'thumbs_up'] as const
export type AvatarGesture = (typeof AVATAR_GESTURES)[number]

/** The JSON payload the AI layer may attach to a chat turn (presentation only). */
export interface AvatarDirective {
  persona?: SalespersonPersona
  emotion?: AvatarEmotion
  gesture?: AvatarGesture
}

export interface PersonaVisualConfig {
  label: string
  /** Base aura / halo color behind the character. */
  aura: string
  /** Accent used for the apron, accessories and highlights. */
  accent: string
  /** Secondary accent for skin shading / rim light. */
  rim: string
  /** Resting body rotation in degrees. */
  posture: number
  /** Idle animation class applied when motion is enabled. */
  idleMotion: 'breathe' | 'bob' | 'sway'
  /** Short, human description of the negotiation tactic (merchant-facing). */
  tactic: string
}

export const SALESPERSON_PERSONA_CONFIG: Record<SalespersonPersona, PersonaVisualConfig> = {
  collaborative: {
    label: 'Collaborative Partner',
    aura: 'rgba(251, 191, 36, 0.28)',
    accent: '#10b981',
    rim: '#f59e0b',
    posture: -2,
    idleMotion: 'breathe',
    tactic: 'Warm, empathetic and value-focused. Opens with trust-building compromises.',
  },
  strict: {
    label: 'Strict Margin Protector',
    aura: 'rgba(220, 38, 38, 0.22)',
    accent: '#334155',
    rim: '#dc2626',
    posture: 0,
    idleMotion: 'sway',
    tactic: 'Firm, data-driven and margin-aware. Anchors on the floor price.',
  },
  playful: {
    label: 'Playful Dealmaker',
    aura: 'rgba(139, 92, 246, 0.26)',
    accent: '#06b6d4',
    rim: '#8b5cf6',
    posture: 2,
    idleMotion: 'bob',
    tactic: 'Witty and gamified. Uses playful challenges to nudge a close.',
  },
}

export function isSalespersonPersona(value: unknown): value is SalespersonPersona {
  return typeof value === 'string' && (SALESPERSON_PERSONAS as readonly string[]).includes(value)
}

export function isAvatarEmotion(value: unknown): value is AvatarEmotion {
  return typeof value === 'string' && (AVATAR_EMOTIONS as readonly string[]).includes(value)
}
