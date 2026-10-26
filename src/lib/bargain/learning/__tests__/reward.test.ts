import { computeLearningReward } from '../reward'

const base = {
  originalPrice: 100,
  floorPrice: 50,
  finalPrice: 80,
  accepted: true,
  purchased: true,
  purchaseValue: 80,
  refundedAmount: 0,
  rounds: 1,
  maxRounds: 5,
}

describe('bargain learning reward', () => {
  test('no purchase earns zero reward even when a price was accepted', () => {
    const reward = computeLearningReward({
      ...base,
      purchased: false,
      purchaseValue: null,
    })
    expect(reward.total).toBe(0)
    expect(reward.purchasedNet).toBe(false)
  })

  test('a full refund reverses the reward', () => {
    const reward = computeLearningReward({ ...base, refundedAmount: 80 })
    expect(reward.total).toBe(0)
    expect(reward.purchasedNet).toBe(false)
  })

  test('a partial refund reduces margin and total reward', () => {
    const full = computeLearningReward(base)
    const partial = computeLearningReward({ ...base, refundedAmount: 40 })
    expect(partial.purchasedNet).toBe(true)
    expect(partial.margin).toBeLessThan(full.margin)
    expect(partial.total).toBeLessThan(full.total)
  })

  test('a purchase at the listing price beats one at the floor', () => {
    const atListing = computeLearningReward({ ...base, finalPrice: 100, purchaseValue: 100 })
    const atFloor = computeLearningReward({ ...base, finalPrice: 50, purchaseValue: 50 })
    expect(atListing.margin).toBe(0.3)
    expect(atFloor.margin).toBe(0)
    expect(atListing.total).toBeGreaterThan(atFloor.total)
  })

  test('closing faster raises the experience component', () => {
    const slow = computeLearningReward({ ...base, rounds: 5 })
    const fast = computeLearningReward({ ...base, rounds: 1 })
    expect(fast.experience).toBeGreaterThan(slow.experience)
    expect(fast.efficiency).toBeGreaterThan(slow.efficiency)
  })

  test('normalizes custom weights', () => {
    const reward = computeLearningReward({
      ...base,
      finalPrice: 100,
      purchaseValue: 100,
      rounds: 1,
      weights: { conversion: 2, margin: 1, experience: 1, efficiency: 0 },
    })
    expect(reward.conversion).toBeCloseTo(0.5)
    expect(reward.margin).toBeCloseTo(0.25)
    expect(reward.experience).toBeCloseTo(0.2325)
    expect(reward.efficiency).toBe(0)
    expect(reward.total).toBeCloseTo(0.9825)
  })

  test('zero weights fall back to conversion-only reward', () => {
    const reward = computeLearningReward({
      ...base,
      weights: { conversion: 0, margin: 0, experience: 0, efficiency: 0 },
    })
    expect(reward.total).toBe(1)
    expect(reward.conversion).toBe(1)
  })

  test('purchase value below zero is ignored', () => {
    const reward = computeLearningReward({
      ...base,
      purchaseValue: -10,
      finalPrice: -10,
    })
    expect(reward.total).toBe(0)
    expect(reward.purchasedNet).toBe(false)
  })
})
