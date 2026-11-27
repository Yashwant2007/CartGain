const mockPrisma: any = {
  bargainLearningConfig: { findUnique: jest.fn(), create: jest.fn() },
  bargainLearningArmStat: { findMany: jest.fn(), upsert: jest.fn() },
  bargainLearningEvent: { create: jest.fn() },
  bargainSession: { update: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { computeLearningReward } from '../reward'
import { resolveSessionLearning } from '../service'

const dataset = {
  originalPrice: 100,
  floorPrice: 50,
  offer: 80,
  budget: null,
  intent: 'PRICE_ONLY',
  objection: null,
  rounds: 1,
  maxRounds: 5,
  recommendationsEnabled: false,
}

const contextKey = 'v1|price|high_mid'

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
    allowedStrategies: ['CONCISE'],
    blockedStrategies: [],
    promoStrategyEnabled: false,
    ...overrides,
  }
}

function armRows() {
  const stat = {
    strategy: 'CONCISE',
    pulls: 200,
    outcomes: 100,
    accepted: 90,
    purchased: 60,
    rewardSum: 60,
    rewardSqSum: 60,
    alpha: 1000,
    beta: 1,
    contextKey,
  }
  return [
    { ...stat, contextKey },
    { ...stat, contextKey: '__global__' },
  ]
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-benchmark',
    storeId: 'store-1',
    environment: 'production',
    learningStrategy: null,
    learningStrategyVersion: null,
    learningContextKey: null,
    learningMode: null,
    learningShadowStrategy: null,
    learningMaxRounds: null,
    learningQuarantined: false,
    ...overrides,
  } as any
}

async function runSelection(
  mode: 'baseline' | 'shadow' | 'active',
  sessionOverrides: Record<string, unknown> = {},
  configOverrides: Record<string, unknown> = {},
) {
  jest.clearAllMocks()
  mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(
    configRow({
      enabled: mode !== 'baseline',
      shadowMode: mode === 'shadow',
      ...configOverrides,
    }),
  )
  mockPrisma.bargainLearningArmStat.findMany.mockResolvedValue(armRows())
  mockPrisma.bargainLearningArmStat.upsert.mockResolvedValue({})
  mockPrisma.bargainLearningEvent.create.mockResolvedValue({ id: 'event-benchmark' })
  mockPrisma.bargainSession.update.mockResolvedValue({})

  const result = await resolveSessionLearning({
    session: sessionRow(sessionOverrides),
    storeId: 'store-1',
    context: dataset,
  })

  return {
    result,
    events: mockPrisma.bargainLearningEvent.create.mock.calls.map((call: any) => call[0].data),
    stats: mockPrisma.bargainLearningArmStat.upsert.mock.calls.map((call: any) => call[0]),
    updates: mockPrisma.bargainSession.update.mock.calls.map((call: any) => call[0]),
  }
}

const previouslyActive = {
  learningStrategy: 'CONCISE',
  learningStrategyVersion: 'v1',
  learningContextKey: contextKey,
  learningMode: 'active',
  learningShadowStrategy: null,
  learningMaxRounds: 5,
}

describe('bargain learning benchmark and rollback', () => {
  test('a fixed dataset gives baseline, shadow and active the expected selections and writes', async () => {
    const baseline = await runSelection('baseline')
    expect(baseline.result).toBeNull()
    expect(baseline.events).toHaveLength(0)
    expect(baseline.stats).toHaveLength(0)
    expect(baseline.updates).toHaveLength(0)

    const shadow = await runSelection('shadow')
    expect(shadow.result?.selection.mode).toBe('shadow')
    expect(shadow.result?.selection.appliedStrategy).toBe('BASELINE')
    expect(shadow.result?.selection.shadowStrategy).toBe('CONCISE')
    expect(shadow.result?.guidance.prompt).toBe('')
    expect(shadow.result?.guidance.counterNudge).toBe(0)
    expect(shadow.events).toHaveLength(0)
    expect(shadow.stats).toHaveLength(0)

    const active = await runSelection('active')
    expect(active.result?.selection.mode).toBe('active')
    expect(active.result?.selection.appliedStrategy).toBe('CONCISE')
    expect(active.result?.selection.contextKey).toBe(contextKey)
    expect(active.result?.guidance.prompt).toContain('NEGOTIATION STYLE')
    expect(active.events).toEqual([
      expect.objectContaining({
        eventType: 'strategy_selected',
        strategy: 'CONCISE',
        environment: 'production',
      }),
    ])
    expect(active.stats).toHaveLength(2)
    for (const stat of active.stats) {
      expect(stat.create.pulls).toBe(1)
    }
    expect(active.result?.selection.strategy).toBe(shadow.result?.selection.shadowStrategy)
  })

  test('a fixed purchase compares full, partial and refunded reward', () => {
    const purchase = {
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
    const full = computeLearningReward(purchase)
    const partial = computeLearningReward({ ...purchase, refundedAmount: 20 })
    const refunded = computeLearningReward({ ...purchase, refundedAmount: 80 })

    expect(full.purchasedNet).toBe(true)
    expect(full.total).toBeCloseTo(0.866)
    expect(partial.purchasedNet).toBe(true)
    expect(partial.total).toBeCloseTo(0.746)
    expect(partial.total).toBeLessThan(full.total)
    expect(refunded.purchasedNet).toBe(false)
    expect(refunded.total).toBe(0)
  })

  test('a cross-tenant or environment-mismatched session never trains', async () => {
    const crossTenant = await runSelection('active', { storeId: 'store-2' })
    expect(crossTenant.result).toBeNull()
    expect(crossTenant.events).toHaveLength(0)
    expect(crossTenant.stats).toHaveLength(0)
    expect(crossTenant.updates).toHaveLength(0)

    const environmentMismatch = await runSelection('active', { environment: 'demo' })
    expect(environmentMismatch.result).toBeNull()
    expect(environmentMismatch.events).toHaveLength(0)
    expect(environmentMismatch.stats).toHaveLength(0)
    expect(environmentMismatch.updates).toHaveLength(0)
  })

  test('rolling an active session back to baseline writes no events or stats', async () => {
    const rollback = await runSelection('baseline', previouslyActive)

    expect(rollback.result).toBeNull()
    expect(rollback.events).toHaveLength(0)
    expect(rollback.stats).toHaveLength(0)
    expect(rollback.updates).toHaveLength(0)
    expect(mockPrisma.bargainLearningArmStat.findMany).not.toHaveBeenCalled()
  })

  test('rolling an active session back to shadow writes no training data', async () => {
    const rollback = await runSelection('shadow', previouslyActive)

    expect(rollback.result?.selection.mode).toBe('shadow')
    expect(rollback.result?.selection.reason).not.toBe('persisted')
    expect(rollback.result?.selection.appliedStrategy).toBe('BASELINE')
    expect(rollback.result?.selection.shadowStrategy).toBe('CONCISE')
    expect(rollback.events).toHaveLength(0)
    expect(rollback.stats).toHaveLength(0)
    expect(rollback.updates).toHaveLength(1)
    expect(rollback.updates[0].data).toEqual(
      expect.objectContaining({
        learningMode: 'shadow',
        learningStrategy: 'BASELINE',
        learningShadowStrategy: 'CONCISE',
      }),
    )
  })
})
