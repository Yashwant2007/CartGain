import {
  selectLearningStrategy,
  seededRandom,
  stableHash,
} from '../selector'
import { eligibleLearningStrategies, learningConfigDefaults, applyLearningCounterBias } from '../strategies'

const context = {
  originalPrice: 100,
  floorPrice: 50,
  offer: 80,
  budget: 40,
  intent: 'PRICE_ONLY',
  objection: null,
  rounds: 1,
  maxRounds: 5,
  recommendationsEnabled: true,
}

const friendlyStat = {
  strategy: 'FRIENDLY',
  pulls: 100,
  outcomes: 40,
  accepted: 30,
  purchased: 20,
  rewardSum: 15,
  rewardSqSum: 8,
  alpha: 1000,
  beta: 1,
  contextKey: 'v1|price|high_mid',
}

describe('learning strategy selector', () => {
  test('baseline mode never applies a candidate', () => {
    const selection = selectLearningStrategy({
      context,
      mode: 'baseline',
      config: learningConfigDefaults(),
      random: () => 0.99,
    })
    expect(selection.appliedStrategy).toBe('BASELINE')
    expect(selection.strategy).toBe('BASELINE')
    expect(selection.shadowStrategy).toBeNull()
    expect(selection.reason).toBe('learning_disabled')
  })

  test('shadow mode applies baseline but records the candidate', () => {
    const selection = selectLearningStrategy({
      context,
      mode: 'shadow',
      contextStats: [friendlyStat],
      config: learningConfigDefaults({ shadowMode: true, minSamplesPerArm: 1 }),
      random: () => 0.99,
    })
    expect(selection.strategy).toBe('FRIENDLY')
    expect(selection.shadowStrategy).toBe('FRIENDLY')
    expect(selection.appliedStrategy).toBe('BASELINE')
  })

  test('active mode applies a trusted candidate', () => {
    const selection = selectLearningStrategy({
      context,
      mode: 'active',
      contextStats: [friendlyStat],
      config: learningConfigDefaults({ shadowMode: false, minSamplesPerArm: 1 }),
      random: () => 0.99,
    })
    expect(selection.strategy).toBe('FRIENDLY')
    expect(selection.appliedStrategy).toBe('FRIENDLY')
    expect(selection.shadowStrategy).toBeNull()
  })

  test('the same seed produces the same selection', () => {
    const config = learningConfigDefaults({ shadowMode: false, minSamplesPerArm: 1 })
    const one = selectLearningStrategy({
      context,
      mode: 'active',
      contextStats: [friendlyStat],
      config,
      seed: 'stable-seed',
    })
    const two = selectLearningStrategy({
      context,
      mode: 'active',
      contextStats: [friendlyStat],
      config,
      seed: 'stable-seed',
    })
    expect(two.strategy).toBe(one.strategy)
    expect(two.contextKey).toBe(one.contextKey)
  })

  test('falls back to baseline until an arm is trusted', () => {
    const selection = selectLearningStrategy({
      context,
      mode: 'active',
      contextStats: [
        {
          ...friendlyStat,
          pulls: 1,
          alpha: 50,
          beta: 1,
        },
      ],
      config: learningConfigDefaults({ minSamplesPerArm: 30, explorationRate: 0 }),
      random: () => 0.99,
    })
    expect(selection.appliedStrategy).toBe('BASELINE')
    expect(selection.reason).toBe('fallback')
  })

  test('respects allow and block lists', () => {
    const allowed = eligibleLearningStrategies({
      ...context,
      config: learningConfigDefaults({ allowedStrategies: ['VALUE'] }),
    })
    expect(allowed).toEqual(['BASELINE', 'VALUE'])

    const blocked = eligibleLearningStrategies({
      ...context,
      config: learningConfigDefaults({ blockedStrategies: ['FRIENDLY', 'VALUE'] }),
    })
    expect(blocked).not.toContain('FRIENDLY')
    expect(blocked).not.toContain('VALUE')
    expect(blocked).toContain('BASELINE')
  })

  test('only offers recommendation strategies when the catalog is enabled', () => {
    const withCatalog = eligibleLearningStrategies({
      ...context,
      recommendationsEnabled: true,
      config: learningConfigDefaults(),
    })
    expect(withCatalog).toContain('BUDGET_ALTERNATIVE')
    expect(withCatalog).toContain('BUNDLE')

    const withoutCatalog = eligibleLearningStrategies({
      ...context,
      recommendationsEnabled: false,
      config: learningConfigDefaults(),
    })
    expect(withoutCatalog).not.toContain('BUDGET_ALTERNATIVE')
    expect(withoutCatalog).not.toContain('BUNDLE')
  })

  test('budget alternatives require a budget below the floor', () => {
    const below = eligibleLearningStrategies({
      ...context,
      budget: 40,
      config: learningConfigDefaults(),
    })
    expect(below).toContain('BUDGET_ALTERNATIVE')

    const atFloor = eligibleLearningStrategies({
      ...context,
      budget: 50,
      config: learningConfigDefaults(),
    })
    expect(atFloor).not.toContain('BUDGET_ALTERNATIVE')
  })

  test('promo strategies require an approved promotion flag', () => {
    const disabled = eligibleLearningStrategies({
      ...context,
      config: learningConfigDefaults(),
    })
    expect(disabled).not.toContain('PROMO')

    const enabled = eligibleLearningStrategies({
      ...context,
      config: learningConfigDefaults({ promoStrategyEnabled: true }),
    })
    expect(enabled).toContain('PROMO')
  })

  test('counter bias is bounded and never crosses the floor or listing price', () => {
    expect(
      applyLearningCounterBias({
        counter: 80,
        originalPrice: 100,
        safeFloor: 50,
        nudge: 0.2,
      }),
    ).toBe(78.5)
    expect(
      applyLearningCounterBias({
        counter: 80,
        originalPrice: 100,
        safeFloor: 50,
        nudge: -0.05,
      }),
    ).toBe(81.5)
    expect(
      applyLearningCounterBias({
        counter: 50,
        originalPrice: 100,
        safeFloor: 50,
        nudge: 1,
      }),
    ).toBe(50)
    expect(
      applyLearningCounterBias({
        counter: 100,
        originalPrice: 100,
        safeFloor: 50,
        nudge: -1,
      }),
    ).toBe(100)
  })

  test('stable hashes and seeded random are deterministic', () => {
    expect(stableHash('cartgain')).toBe(stableHash('cartgain'))
    expect(stableHash('cartgain')).not.toBe(stableHash('cartgain2'))
    const one = seededRandom('seed')
    const two = seededRandom('seed')
    expect([one(), one(), one()]).toEqual([two(), two(), two()])
  })
})
