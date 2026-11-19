import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { CharacterSpec } from './types'

/**
 * Three genuinely distinct character identities.
 *
 * They are not one model with three palettes: the proportions, silhouette,
 * wardrobe construction, facial construction and movement vocabulary are
 * different. Each personality owns a different resting posture and a different
 * relationship with the chat frame.
 */

const DEAL_MASTER: CharacterSpec = {
  id: 'deal_master',
  personality: 'strict_shopkeeper',
  title: 'The Deal Master',
  tagline: 'Composed, exact, never gives away more than the rules allow.',
  palette: {
    skin: 0xd8a07a,
    skinShade: 0xb87c58,
    hair: 0x2b2118,
    hairShade: 0x1a130e,
    outfitPrimary: 0x1f2a44,
    outfitSecondary: 0xf2f4f8,
    outfitAccent: 0xc9a227,
    shoe: 0x14161c,
    eye: 0x2f3a4a,
    brow: 0x2b2118,
    mouth: 0x8c4a46,
  },
  proportions: {
    height: 1.0,
    shoulderWidth: 0.19,
    hipWidth: 0.11,
    headSize: 0.068,
    limbThickness: 0.031,
    torsoDepth: 0.075,
  },
  posture: {
    armsCrossed: 0.85,
    lean: 0.02,
    headTilt: -0.02,
    smile: 0.12,
  },
  mobility: 'stationary',
  usesFrame: false,
  homeBias: 0.5,
}

const SHOPPING_BUDDY: CharacterSpec = {
  id: 'shopping_buddy',
  personality: 'friendly_shopkeeper',
  title: 'Your Shopping Buddy',
  tagline: 'Walks the floor with you and points out the good stuff.',
  palette: {
    skin: 0xe8b48d,
    skinShade: 0xc98f66,
    hair: 0x53331f,
    hairShade: 0x3a2416,
    outfitPrimary: 0x2f7d63,
    outfitSecondary: 0xf6f1e6,
    outfitAccent: 0xf2a65a,
    shoe: 0x43352a,
    eye: 0x3a2a20,
    brow: 0x3a2416,
    mouth: 0xa8544f,
  },
  proportions: {
    height: 0.95,
    shoulderWidth: 0.175,
    hipWidth: 0.115,
    headSize: 0.075,
    limbThickness: 0.034,
    torsoDepth: 0.08,
  },
  posture: {
    armsCrossed: 0,
    lean: 0.05,
    headTilt: 0.04,
    smile: 0.55,
  },
  mobility: 'strolling',
  usesFrame: false,
  homeBias: 0.35,
}

const BARGAIN_NINJA: CharacterSpec = {
  id: 'bargain_ninja',
  personality: 'playful_shopkeeper',
  title: 'The Bargain Ninja',
  tagline: 'Lives on the chat frame. Will absolutely hang from it.',
  palette: {
    skin: 0xf0c39b,
    skinShade: 0xd09c72,
    hair: 0x6b2fb5,
    hairShade: 0x471f7d,
    outfitPrimary: 0x7c3aed,
    outfitSecondary: 0xfef3c7,
    outfitAccent: 0x22d3ee,
    shoe: 0x312e81,
    eye: 0x1f2937,
    brow: 0x471f7d,
    mouth: 0xb4446c,
  },
  proportions: {
    height: 0.74,
    shoulderWidth: 0.165,
    hipWidth: 0.12,
    headSize: 0.095,
    limbThickness: 0.036,
    torsoDepth: 0.075,
  },
  posture: {
    armsCrossed: 0,
    lean: 0.08,
    headTilt: 0.08,
    smile: 0.75,
  },
  mobility: 'climbing',
  usesFrame: true,
  homeBias: 0.62,
}

const BY_PERSONALITY: Record<ShopkeeperPersonality, CharacterSpec> = {
  strict_shopkeeper: DEAL_MASTER,
  friendly_shopkeeper: SHOPPING_BUDDY,
  playful_shopkeeper: BARGAIN_NINJA,
}

export function characterSpecFor(personality: ShopkeeperPersonality): CharacterSpec {
  return BY_PERSONALITY[personality] ?? DEAL_MASTER
}

export function characterSpecForId(id: CharacterSpec['id']): CharacterSpec {
  if (id === 'shopping_buddy') return SHOPPING_BUDDY
  if (id === 'bargain_ninja') return BARGAIN_NINJA
  return DEAL_MASTER
}

export const ALL_CHARACTER_SPECS: CharacterSpec[] = [DEAL_MASTER, SHOPPING_BUDDY, BARGAIN_NINJA]
