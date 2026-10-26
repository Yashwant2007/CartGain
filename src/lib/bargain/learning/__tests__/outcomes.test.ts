const mockPrisma: any = {
  bargainSession: { findUnique: jest.fn() },
  bargainLearningConfig: { findUnique: jest.fn() },
  bargainLearningOutcome: { findUnique: jest.fn(), upsert: jest.fn() },
  bargainLearningEvent: { create: jest.fn() },
  bargainLearningArmStat: { upsert: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  recordLearningAcceptance,
  recordLearningPurchase,
  recordLearningRefund,
} from '../outcomes'

function configRow(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    shadowMode: false,
    demoEnabled: true,
    version: 'v1',
    explorationRate: 0,
    minSamplesPerArm: 1,
    attributionWindowDays: 7,
    eventRetentionDays: 180,
    rewardConversion: 0.4,
    rewardMargin: 0.3,
    rewardExperience: 0.2,
    rewardEfficiency: 0.1,
    allowedStrategies: [],
    blockedStrategies: [],
    promoStrategyEnabled: false,
    ...overrides,
  }
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    storeId: 'store-1',
    environment: 'production',
    learningStrategy: 'FRIENDLY',
    learningStrategyVersion: 'v1',
    learningContextKey: 'v1|price|low_mid',
    learningMode: 'active',
    learningShadowStrategy: null,
    learningMaxRounds: 5,
    originalPrice: 100,
    bargainFloor: 50,
    attemptsUsed: 2,
    finalPrice: 80,
    status: 'accepted',
    ...overrides,
  }
}

function purchaseOutcome(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outcome-1',
    outcomeKey: 'session:session-1',
    sessionId: 'session-1',
    storeId: 'store-1',
    environment: 'production',
    strategy: 'FRIENDLY',
    strategyVersion: 'v1',
    contextKey: 'v1|price|low_mid',
    mode: 'active',
    originalPrice: 100,
    finalPrice: 80,
    floorPrice: 50,
    rounds: 2,
    accepted: true,
    purchased: true,
    purchaseValue: 80,
    refundedAmount: 0,
    shopifyOrderId: 'order-1',
    reward: 0.7197,
    rewardApplied: 0.7197,
    acceptedAt: new Date(),
    purchasedAt: new Date(),
    finalizedAt: new Date(),
    ...overrides,
  }
}

describe('bargain learning outcomes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow())
    mockPrisma.bargainSession.findUnique.mockResolvedValue(session())
    mockPrisma.bargainLearningOutcome.findUnique.mockResolvedValue(null)
    mockPrisma.bargainLearningOutcome.upsert.mockResolvedValue({})
    mockPrisma.bargainLearningEvent.create.mockResolvedValue({ id: 'event-1' })
    mockPrisma.bargainLearningArmStat.upsert.mockResolvedValue({})
  })

  test('records acceptance as a provisional outcome with no reward yet', async () => {
    await recordLearningAcceptance('session-1')

    const upsert = mockPrisma.bargainLearningOutcome.upsert.mock.calls[0][0]
    expect(upsert.create.accepted).toBe(true)
    expect(upsert.create.purchased).toBe(false)
    expect(upsert.create.reward).toBe(0)
    expect(upsert.create.finalizedAt).toBeNull()
    expect(upsert.create.finalPrice).toBe(80)
    expect(upsert.create.floorPrice).toBe(50)

    const stats = mockPrisma.bargainLearningArmStat.upsert.mock.calls
    expect(stats).toHaveLength(2)
    expect(stats[0][0].create.accepted).toBe(1)
    expect(stats[0][0].create.outcomes).toBe(0)
  })

  test('records a purchase and transitions a provisional outcome', async () => {
    mockPrisma.bargainLearningOutcome.findUnique.mockResolvedValue(
      purchaseOutcome({
        purchased: false,
        purchaseValue: null,
        shopifyOrderId: null,
        reward: 0,
        rewardApplied: 0,
        purchasedAt: null,
        finalizedAt: null,
      }),
    )
    await recordLearningPurchase({
      sessionId: 'session-1',
      shopifyOrderId: 'order-1',
      purchaseValue: 80,
    })

    const upsert = mockPrisma.bargainLearningOutcome.upsert.mock.calls[0][0]
    expect(upsert.update.purchased).toBe(true)
    expect(upsert.update.purchaseValue).toBe(80)
    expect(upsert.update.shopifyOrderId).toBe('order-1')
    expect(upsert.update.finalizedAt).toBeInstanceOf(Date)
    expect(upsert.update.rewardApplied).toBeGreaterThan(0)

    const event = mockPrisma.bargainLearningEvent.create.mock.calls[0][0].data
    expect(event.eventType).toBe('purchased')
    expect(event.dedupeKey).toBe('purchased:store-1:order-1')
  })

  test('a full refund reverses the purchase reward exactly once', async () => {
    mockPrisma.bargainLearningOutcome.findUnique.mockResolvedValue(purchaseOutcome())
    await recordLearningRefund({
      storeId: 'store-1',
      shopifyOrderId: 'order-1',
      refundAmount: 80,
      fullyRefunded: true,
      refundId: 'refund-1',
    })

    const event = mockPrisma.bargainLearningEvent.create.mock.calls[0][0].data
    expect(event.eventType).toBe('refunded')
    expect(event.dedupeKey).toBe('refund:store-1:order-1:refund-1')

    const upsert = mockPrisma.bargainLearningOutcome.upsert.mock.calls[0][0]
    expect(upsert.update.purchased).toBe(false)
    expect(upsert.update.refundedAmount).toBe(80)
    expect(upsert.update.rewardApplied).toBe(0)
    expect(upsert.update.finalPrice).toBe(80)
  })

  test('a partial refund keeps the purchase but reduces the reward', async () => {
    mockPrisma.bargainLearningOutcome.findUnique.mockResolvedValue(purchaseOutcome())
    await recordLearningRefund({
      storeId: 'store-1',
      shopifyOrderId: 'order-1',
      refundAmount: 20,
      fullyRefunded: false,
      refundId: 'refund-1',
    })

    const upsert = mockPrisma.bargainLearningOutcome.upsert.mock.calls[0][0]
    expect(upsert.update.purchased).toBe(true)
    expect(upsert.update.refundedAmount).toBe(20)
    expect(upsert.update.rewardApplied).toBeGreaterThan(0)
    expect(upsert.update.rewardApplied).toBeLessThan(purchaseOutcome().rewardApplied)
  })

  test('shadow and baseline sessions never write outcomes or stats', async () => {
    mockPrisma.bargainSession.findUnique.mockResolvedValue(
      session({ learningMode: 'shadow', learningStrategy: 'BASELINE' }),
    )
    await recordLearningAcceptance('session-1')
    await recordLearningPurchase({
      sessionId: 'session-1',
      shopifyOrderId: 'order-1',
      purchaseValue: 80,
    })

    expect(mockPrisma.bargainLearningOutcome.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.bargainLearningArmStat.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.bargainLearningEvent.create).not.toHaveBeenCalled()
  })

  test('duplicate refund events do not rewrite the outcome', async () => {
    const duplicateError: any = new Error('duplicate')
    duplicateError.code = 'P2002'
    mockPrisma.bargainLearningOutcome.findUnique.mockResolvedValue(purchaseOutcome())
    mockPrisma.bargainLearningEvent.create.mockRejectedValue(duplicateError)

    await recordLearningRefund({
      storeId: 'store-1',
      shopifyOrderId: 'order-1',
      refundAmount: 20,
      fullyRefunded: false,
      refundId: 'refund-1',
    })

    expect(mockPrisma.bargainLearningOutcome.upsert).not.toHaveBeenCalled()
  })

  test('quarantined sessions write an audit outcome but never train the selector', async () => {
    mockPrisma.bargainSession.findUnique.mockResolvedValue(
      session({ learningQuarantined: true }),
    )
    await recordLearningAcceptance('session-1')
    await recordLearningPurchase({
      sessionId: 'session-1',
      shopifyOrderId: 'order-1',
      purchaseValue: 80,
    })

    const upserts = mockPrisma.bargainLearningOutcome.upsert.mock.calls
    expect(upserts.length).toBe(2)
    for (const call of upserts) {
      expect(call[0].create.quarantined).toBe(true)
      expect(call[0].create.rewardApplied).toBe(0)
    }
    expect(mockPrisma.bargainLearningArmStat.upsert).not.toHaveBeenCalled()
  })

  test('quarantining a previously trained session removes its stats', async () => {
    mockPrisma.bargainLearningOutcome.findUnique.mockResolvedValue(
      purchaseOutcome({ purchased: false, purchaseValue: null, finalizedAt: null }),
    )
    mockPrisma.bargainSession.findUnique.mockResolvedValue(
      session({ learningQuarantined: true }),
    )
    await recordLearningPurchase({
      sessionId: 'session-1',
      shopifyOrderId: 'order-1',
      purchaseValue: 80,
    })

    const upsert = mockPrisma.bargainLearningOutcome.upsert.mock.calls[0][0]
    expect(upsert.update.quarantined).toBe(true)
    expect(upsert.update.rewardApplied).toBe(0)
    const stats = mockPrisma.bargainLearningArmStat.upsert.mock.calls
    expect(stats.some((call: any) => call[0].update.accepted?.increment < 0)).toBe(true)
  })

  test('outcome persistence fails open when the model is unavailable', async () => {
    mockPrisma.bargainLearningOutcome.upsert.mockRejectedValue(new Error('db down'))
    await expect(recordLearningAcceptance('session-1')).resolves.toBeUndefined()
  })
})
