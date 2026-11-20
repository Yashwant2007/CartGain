import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'

/**
 * The 3D shopkeeper system.
 *
 * The storefront builds a native Three.js articulated mesh hierarchy and
 * retargets the shared AnimationMixer clip library through this state contract.
 * The development robot is grouped geometry, not a skinned GLB.
 */

export const CHARACTER_3D_STATES = [
  'idle',
  'enter',
  'greet',
  'walk',
  'run',
  'listen',
  'talk',
  'think',
  'look_at_customer',
  'point',
  'smile',
  'wave',
  'sit',
  'climb',
  'hang',
  'peek',
  'jump',
  'celebrate',
  'disappointed',
  'surprised',
  'explain',
  'guide',
  'exit',
  'goodbye',
] as const

export type Character3DState = (typeof CHARACTER_3D_STATES)[number]

export function isCharacter3DState(value: unknown): value is Character3DState {
  return typeof value === 'string' && (CHARACTER_3D_STATES as readonly string[]).includes(value)
}

/** The names of the authored articulated animation clips. */
export type Character3DClip = Character3DState

/** Joint-pivot names for compatible authored character rigs. */
export const RIG_BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'browL',
  'browR',
  'eyeL',
  'eyeR',
  'jaw',
  'mouth',
  'shoulderL',
  'shoulderR',
  'upperArmL',
  'upperArmR',
  'forearmL',
  'forearmR',
  'handL',
  'handR',
  'fingerL1',
  'fingerL2',
  'fingerL3',
  'fingerR1',
  'fingerR2',
  'fingerR3',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
  'toeL',
  'toeR',
] as const

export type RigBoneName = (typeof RIG_BONES)[number]

export interface CharacterPalette {
  skin: number
  skinShade: number
  hair: number
  hairShade: number
  outfitPrimary: number
  outfitSecondary: number
  outfitAccent: number
  shoe: number
  eye: number
  brow: number
  mouth: number
}

export interface CharacterProportions {
  /** Overall scale multiplier applied to the rest skeleton. */
  height: number
  /** Shoulder width as a fraction of total height. */
  shoulderWidth: number
  /** Hip width as a fraction of total height. */
  hipWidth: number
  /** Head radius as a fraction of total height. */
  headSize: number
  /** Limb thickness as a fraction of total height. */
  limbThickness: number
  /** Torso depth as a fraction of total height. */
  torsoDepth: number
}

export interface CharacterSpec {
  id: 'deal_master' | 'shopping_buddy' | 'bargain_ninja'
  personality: ShopkeeperPersonality
  title: string
  tagline: string
  palette: CharacterPalette
  proportions: CharacterProportions
  /** Rest-pose bias applied on top of every clip (0..1 per channel). */
  posture: {
    /** Arms folded across the chest while resting. */
    armsCrossed: number
    /** Slight forward lean of the torso. */
    lean: number
    /** Head tilt in radians at rest. */
    headTilt: number
    /** Constant smile amount, 0..1. */
    smile: number
  }
  /** How far the character is willing to travel inside the stage gutter. */
  mobility: 'stationary' | 'strolling' | 'climbing'
  /** Character can hang from / sit on the chat frame. */
  usesFrame: boolean
  /** Preferred resting spot inside the stage gutter, 0 = left, 1 = right. */
  homeBias: number
}

export type CharacterQuality = 'low' | 'medium' | 'high'

export interface Character3DQualitySettings {
  quality: CharacterQuality
  shadows: boolean
  maxPixelRatio: number
  antialias: boolean
  /** Frames per second ceiling for the render loop. */
  fps: number
}

export function qualitySettingsFor(quality: CharacterQuality): Character3DQualitySettings {
  if (quality === 'low') {
    return { quality, shadows: false, maxPixelRatio: 1, antialias: false, fps: 30 }
  }
  if (quality === 'medium') {
    return { quality, shadows: true, maxPixelRatio: 1.5, antialias: false, fps: 45 }
  }
  return { quality, shadows: true, maxPixelRatio: 2, antialias: true, fps: 60 }
}
