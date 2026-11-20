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
    title: 'The Strict Shopkeeper',
    silhouette: 'Upright angular posture, combed-back salt-and-pepper hair, charcoal waistcoat, teal tie, squared shoulders.',
    palette: {
      bg: '#f1f5f9',
      accent: '#334155',
      skin: '#c98d63',
      skinShade: '#a66f4a',
      hair: '#3f3f46',
      outfit: '#ffffff',
      apron: '#334155',
      detail: '#0f766e',
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
    title: 'The Friendly Shopkeeper',
    silhouette: 'Soft rounded face, short wavy auburn hair, teal glasses, teal cardigan, open welcoming posture.',
    palette: {
      bg: '#f0fdfa',
      accent: '#14b8a6',
      skin: '#f2c6a8',
      skinShade: '#d99b72',
      hair: '#7c3f2b',
      outfit: '#ccfbf1',
      apron: '#0f766e',
      detail: '#0d9488',
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
    title: 'The Playful Shopkeeper',
    silhouette: 'Lean energetic stance, short spiky hair with teal streak, cropped teal vest, quick precise gestures.',
    palette: {
      bg: '#ecfeff',
      accent: '#06b6d4',
      skin: '#bd7f59',
      skinShade: '#965d3d',
      hair: '#18181b',
      outfit: '#334155',
      apron: '#0d9488',
      detail: '#14b8a6',
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
      negotiating: 'wave',
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
