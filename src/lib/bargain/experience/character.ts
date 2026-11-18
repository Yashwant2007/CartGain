// ─────────────────────────────────────────────────────────────────────────────
// LIVING SHOPKEEPER — original character identities
// ─────────────────────────────────────────────────────────────────────────────
//
// Three original characters. Each has its own palette, silhouette, accessory,
// body language and conversational strategy. All artwork is original vector
// geometry rendered inline — no third-party character, sprite sheet or runtime
// animation library is involved, so the storefront pays nothing extra in
// JavaScript weight and nothing is ever "downloading an avatar".
//
// The character NEVER decides a price. It only reacts to what the trusted
// backend already did.
//

import type { CharacterStyle, ShopkeeperPersonality } from './types'
import type { AvatarState } from './avatar-state'

/** The body gestures the character can perform. */
export const GESTURES = [
  'rest',
  'wave',
  'crossed_arms',
  'point',
  'chin',
  'nod',
  'thumbs_up',
  'dance',
  'lean_in',
  'open_palms',
  'guide',
  'shrug',
  'walk',
] as const

export type GestureName = (typeof GESTURES)[number]

export function isGestureName(value: unknown): value is GestureName {
  return typeof value === 'string' && (GESTURES as readonly string[]).includes(value)
}

export interface CharacterPalette {
  /** Backdrop of the avatar disc. */
  bg: string
  /** Primary brand accent for the character. */
  accent: string
  skin: string
  skinShade: string
  hair: string
  /** Shirt / jacket. */
  outfit: string
  /** Apron or hoodie. */
  apron: string
  /** Small detail colour (tie, trim, headband). */
  detail: string
}

export interface CharacterProfile {
  id: ShopkeeperPersonality
  /** In-world role, e.g. "The Deal Master". */
  title: string
  /** One-line silhouette description for the merchant preview. */
  silhouette: string
  palette: CharacterPalette
  /** Head shape treatment. */
  hair: 'swept_fringe' | 'side_part' | 'spiky_curls'
  /** Signature accessory. */
  accessory: 'glasses' | 'headband' | 'none'
  /** Body language per animation state. */
  gestures: Record<AvatarState, GestureName>
}

const SHARED_GESTURES: Partial<Record<AvatarState, GestureName>> = {
  idle: 'rest',
  entering: 'walk',
  typing: 'rest',
  thinking: 'rest',
  calculating: 'rest',
  surprised: 'rest',
  pointing: 'point',
  walking: 'walk',
}

export const CHARACTER_PROFILES: Record<ShopkeeperPersonality, CharacterProfile> = {
  strict_shopkeeper: {
    id: 'strict_shopkeeper',
    title: 'The Deal Master',
    silhouette: 'Dark tailored suit, gold-trimmed apron, square glasses, composed posture.',
    palette: {
      bg: '#f1f5f9',
      accent: '#475569',
      skin: '#d6a37a',
      skinShade: '#b8835a',
      hair: '#242424',
      outfit: '#1e3a5f',
      apron: '#0f2a44',
      detail: '#d4a017',
    },
    hair: 'side_part',
    accessory: 'glasses',
    gestures: {
      ...SHARED_GESTURES,
      greeting: 'nod',
      listening: 'rest',
      thinking: 'chin',
      calculating: 'chin',
      confused: 'chin',
      happy: 'nod',
      disappointed: 'crossed_arms',
      negotiating: 'crossed_arms',
      recommending: 'point',
      celebrating: 'nod',
      guiding_to_checkout: 'guide',
      goodbye: 'nod',
    } as Record<AvatarState, GestureName>,
  },
  friendly_shopkeeper: {
    id: 'friendly_shopkeeper',
    title: 'Your Shopping Buddy',
    silhouette: 'Soft blue shirt, light apron, warm fringe, open welcoming posture.',
    palette: {
      bg: '#eef2ff',
      accent: '#4f46e5',
      skin: '#f2c6a8',
      skinShade: '#d99b72',
      hair: '#3b2a22',
      outfit: '#2563eb',
      apron: '#f8fafc',
      detail: '#0ea5e9',
    },
    hair: 'swept_fringe',
    accessory: 'none',
    gestures: {
      ...SHARED_GESTURES,
      entering: 'wave',
      greeting: 'wave',
      listening: 'lean_in',
      thinking: 'rest',
      calculating: 'rest',
      confused: 'shrug',
      happy: 'thumbs_up',
      disappointed: 'shrug',
      negotiating: 'open_palms',
      recommending: 'point',
      celebrating: 'dance',
      guiding_to_checkout: 'guide',
      goodbye: 'wave',
    } as Record<AvatarState, GestureName>,
  },
  playful_shopkeeper: {
    id: 'playful_shopkeeper',
    title: 'The Bargain Ninja',
    silhouette: 'Orange hoodie, yellow headband, spiky curls, restless energy.',
    palette: {
      bg: '#fef3c7',
      accent: '#d97706',
      skin: '#bd7f59',
      skinShade: '#965d3d',
      hair: '#2b1a14',
      outfit: '#f97316',
      apron: '#111827',
      detail: '#facc15',
    },
    hair: 'spiky_curls',
    accessory: 'headband',
    gestures: {
      ...SHARED_GESTURES,
      entering: 'walk',
      greeting: 'wave',
      listening: 'lean_in',
      thinking: 'rest',
      calculating: 'rest',
      confused: 'shrug',
      happy: 'thumbs_up',
      disappointed: 'shrug',
      negotiating: 'crossed_arms',
      recommending: 'point',
      celebrating: 'dance',
      guiding_to_checkout: 'guide',
      goodbye: 'wave',
    } as Record<AvatarState, GestureName>,
  },
}

export function characterProfile(personality: ShopkeeperPersonality): CharacterProfile {
  return CHARACTER_PROFILES[personality] ?? CHARACTER_PROFILES.friendly_shopkeeper
}

/** The gesture a given character performs in a given animation state. */
export function gestureFor(personality: ShopkeeperPersonality, state: AvatarState): GestureName {
  const profile = characterProfile(personality)
  return profile.gestures[state] ?? 'rest'
}

/**
 * Gestures need hands and a body. The `minimal` visual style strips them so
 * the character stays a light, flat illustration.
 */
export function supportsGestureLayer(style: CharacterStyle): boolean {
  return style === 'signature'
}
