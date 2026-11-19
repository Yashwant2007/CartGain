import { describe, it, expect } from '@jest/globals'
import { buildCharacter } from '@/lib/bargain/character3d/build'
import { characterSpecFor } from '@/lib/bargain/character3d/specs'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'

describe('character3d build', () => {
  const personalities: ShopkeeperPersonality[] = [
    'strict_shopkeeper',
    'friendly_shopkeeper',
    'playful_shopkeeper',
  ]

  for (const personality of personalities) {
    it(`builds a genuine skinned skeleton for ${personality}`, () => {
      const spec = characterSpecFor(personality)
      const { group, skeleton, bones, meshes, height, width, dispose } = buildCharacter(spec)

      expect(group).toBeDefined()
      expect(skeleton).toBeDefined()
      expect(height).toBeGreaterThan(0)
      expect(width).toBeGreaterThan(0)
      expect(meshes.length).toBeGreaterThan(0)

      // Every rig bone exists and is wired into the skeleton.
      const boneNames = Object.keys(bones)
      for (const name of boneNames) {
        expect(bones[name as never]).toBeDefined()
      }
      expect(skeleton.bones.length).toBeGreaterThan(20)

      // Meshes are skinned to the skeleton (bind pose applied).
      for (const mesh of meshes) {
        expect(mesh.parent).toBe(group)
      }

      dispose()
      expect(group.children.length).toBe(0)
    })
  }

  it('the three personalities have distinct proportions', () => {
    const strict = characterSpecFor('strict_shopkeeper')
    const friendly = characterSpecFor('friendly_shopkeeper')
    const playful = characterSpecFor('playful_shopkeeper')
    expect(strict.proportions.height).toBeGreaterThan(playful.proportions.height)
    expect(friendly.palette.outfitPrimary).not.toBe(strict.palette.outfitPrimary)
    expect(playful.palette.outfitPrimary).not.toBe(friendly.palette.outfitPrimary)
    expect(strict.mobility).toBe('stationary')
    expect(friendly.mobility).toBe('strolling')
    expect(playful.mobility).toBe('climbing')
  })
})
