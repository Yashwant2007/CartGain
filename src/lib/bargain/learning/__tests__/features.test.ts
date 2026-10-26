import { buildLearningFeatures, intentGroup, GLOBAL_CONTEXT_KEY } from '../features'

function context(overrides: Record<string, unknown> = {}) {
  return {
    originalPrice: 100,
    floorPrice: 50,
    offer: 60,
    budget: null,
    intent: 'PRICE_ONLY',
    objection: null,
    rounds: 1,
    maxRounds: 5,
    recommendationsEnabled: false,
    ...overrides,
  }
}

describe('bargain learning features', () => {
  test('groups intents into stable families', () => {
    expect(intentGroup('PRICE_ONLY')).toBe('price')
    expect(intentGroup('BUDGET_CONSTRAINT')).toBe('budget')
    expect(intentGroup('PRODUCT_MISMATCH')).toBe('product')
    expect(intentGroup('WALKOUT')).toBe('walkout')
    expect(intentGroup(null)).toBe('unknown')
    expect(intentGroup('SOMETHING_NEW')).toBe('unknown')
  })

  test('buckets offers relative to the floor and listing price', () => {
    expect(buildLearningFeatures(context({ offer: 40 })).offerBucket).toBe('below_floor')
    expect(buildLearningFeatures(context({ offer: 55 })).offerBucket).toBe('near_floor')
    expect(buildLearningFeatures(context({ offer: 75 })).offerBucket).toBe('low_mid')
    expect(buildLearningFeatures(context({ offer: 90 })).offerBucket).toBe('high_mid')
    expect(buildLearningFeatures(context({ offer: 100 })).offerBucket).toBe('near_listing')
    expect(buildLearningFeatures(context({ offer: 4 })).offerBucket).toBe('absurd')
    expect(buildLearningFeatures(context({ offer: null })).offerBucket).toBe('none')
  })

  test('builds a versioned context key from intent and offer bucket', () => {
    const features = buildLearningFeatures(context())
    expect(features.contextKey).toBe('v1|price|low_mid')
    expect(features.roundsBucket).toBe('early')
    expect(features.budgetBucket).toBe('none')
    expect(GLOBAL_CONTEXT_KEY).toBe('__global__')
  })

  test('recommendation eligibility requires an enabled catalog and a real trigger', () => {
    expect(
      buildLearningFeatures(context({ recommendationsEnabled: true })).recommendationEligible,
    ).toBe(false)
    expect(
      buildLearningFeatures(
        context({ recommendationsEnabled: false, budget: 40 }),
      ).recommendationEligible,
    ).toBe(false)
    expect(
      buildLearningFeatures(
        context({ recommendationsEnabled: true, budget: 40 }),
      ).recommendationEligible,
    ).toBe(true)
    expect(
      buildLearningFeatures(
        context({ recommendationsEnabled: true, budget: 50 }),
      ).recommendationEligible,
    ).toBe(false)
    expect(
      buildLearningFeatures(
        context({ recommendationsEnabled: true, bulkQuantity: 2 }),
      ).recommendationEligible,
    ).toBe(true)
  })

  test('clamps malformed prices instead of producing NaN buckets', () => {
    const features = buildLearningFeatures(
      context({ originalPrice: 0, floorPrice: 999, offer: -1 }),
    )
    expect(features.offerBucket).toBe('none')
    expect(features.contextKey).toContain('v1|price|none')
  })
})
