import { describe, it, expect } from '@jest/globals'
import { solveTwoBone, type Vec3 } from '@/lib/bargain/character3d/ik'

describe('two-bone IK', () => {
  const root: Vec3 = { x: 0, y: 0, z: 0 }
  const pole: Vec3 = { x: 0, y: 0, z: -1 }

  it('reaches a target within the envelope', () => {
    const { upperDir, lowerDir, joint, reachable } = solveTwoBone(
      root, { x: 0, y: -1.5, z: 0 }, 1.0, 1.0, pole,
    )
    expect(reachable).toBe(true)
    expect(upperDir).toBeDefined()
    expect(lowerDir).toBeDefined()
    expect(joint).toBeDefined()
    // The joint must lie between root and target.
    expect(joint.y).toBeLessThan(0)
    expect(joint.y).toBeGreaterThan(-1.5)
  })

  it('marks an out-of-reach target as unreachable', () => {
    const { reachable } = solveTwoBone(
      root, { x: 0, y: -5, z: 0 }, 1.0, 1.0, pole,
    )
    expect(reachable).toBe(false)
  })

  it('bends the joint toward the pole', () => {
    const poleLeft: Vec3 = { x: -1, y: 0, z: 0 }
    const poleRight: Vec3 = { x: 1, y: 0, z: 0 }
    const left = solveTwoBone(root, { x: 0, y: -1.5, z: 0 }, 1.0, 1.0, poleLeft)
    const right = solveTwoBone(root, { x: 0, y: -1.5, z: 0 }, 1.0, 1.0, poleRight)
    expect(left.joint.x).toBeLessThan(right.joint.x)
  })
})
