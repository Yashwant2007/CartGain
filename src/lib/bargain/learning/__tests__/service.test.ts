const mockPrisma: any = {
  bargainLearningConfig: { findUnique: jest.fn() },
  bargainLearningArmStat: { findMany: jest.fn(), upsert: jest.fn() },
  bargainLearningEvent: { create: jest.fn() },
  bargainSession: { update: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { previewDemoLearning, recordLearningEvent, resolveSessionLearning } from '../service'

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

const session = {
  id: 'session-1',
  learningStrategy: null,
  learningStrategyVersion: null,
  learningContextKey: null,
  learningMode: null,
  learningShadowStrategy: null,
  learningMaxRounds: null,
}

const context = {
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

describe('bargain learning service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(null)
    mockPrisma.bargainLearningArmStat.findMany.mockResolvedValue([])
    mockPrisma.bargainLearningArmStat.upsert.mockResolvedValue({})
    mockPrisma.bargainLearningEvent.create.mockResolvedValue({ id: 'event-1' })
    mockPrisma.bargainSession.update.mockResolvedValue({})
  })

  test('is a no-op when the store has no config', async () => {
    const result = await resolveSessionLearning({
      session,
      storeId: 'store-1',
      context,
    })
    expect(result).toBeNull()
    expect(mockPrisma.bargainLearningEvent.create).not.toHaveBeenCalled()
    expect(mockPrisma.bargainSession.update).not.toHaveBeenCalled()
  })

  test('rejects a session that belongs to another store', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow())
    const result = await resolveSessionLearning({
      session: { ...session, storeId: 'store-2', environment: 'production' },
      storeId: 'store-1',
      context,
    })
    expect(result).toBeNull()
    expect(mockPrisma.bargainLearningEvent.create).not.toHaveBeenCalled()
    expect(mockPrisma.bargainSession.update).not.toHaveBeenCalled()
  })

  test('rejects a session already quarantined for manipulation', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow())
    const result = await resolveSessionLearning({
      session: { ...session, storeId: 'store-1', environment: 'production', learningQuarantined: true },
      storeId: 'store-1',
      context,
    })
    expect(result).toBeNull()
    expect(mockPrisma.bargainLearningEvent.create).not.toHaveBeenCalled()
  })

  test('is a no-op when production learning is disabled', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow({ enabled: false }))
    const result = await resolveSessionLearning({
      session,
      storeId: 'store-1',
      context,
    })
    expect(result).toBeNull()
  })

  test('shadow mode persists a candidate but never trains it', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(
      configRow({ shadowMode: true }),
    )
    const result = await resolveSessionLearning({
      session,
      storeId: 'store-1',
      context,
    })

    expect(result?.selection.mode).toBe('shadow')
    expect(result?.selection.appliedStrategy).toBe('BASELINE')
    expect(result?.guidance.prompt).toBe('')
    expect(result?.guidance.counterNudge).toBe(0)
    expect(mockPrisma.bargainSession.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.bargainLearningEvent.create).not.toHaveBeenCalled()
    expect(mockPrisma.bargainLearningArmStat.upsert).not.toHaveBeenCalled()
  })

  test('active mode records the selection and increments pulls once', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow())
    const result = await resolveSessionLearning({
      session,
      storeId: 'store-1',
      context,
    })

    expect(result).not.toBeNull()
    expect(result?.selection.mode).toBe('active')
    expect(mockPrisma.bargainLearningEvent.create).toHaveBeenCalledTimes(1)
    const event = mockPrisma.bargainLearningEvent.create.mock.calls[0][0].data
    expect(event.eventType).toBe('strategy_selected')
    expect(event.strategy).toBe(result?.selection.appliedStrategy)
    expect(event.environment).toBe('production')

    expect(mockPrisma.bargainLearningArmStat.upsert).toHaveBeenCalledTimes(2)
    for (const call of mockPrisma.bargainLearningArmStat.upsert.mock.calls) {
      expect(call[0].create.pulls).toBe(1)
    }
    const persisted = mockPrisma.bargainSession.update.mock.calls[0][0].data
    expect(persisted.learningStrategy).toBe(result?.selection.appliedStrategy)
    expect(persisted.learningMaxRounds).toBe(5)
  })

  test('reuses the persisted arm without reselecting or retraining', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow())
    const result = await resolveSessionLearning({
      session: {
        ...session,
        learningStrategy: 'CONCISE',
        learningStrategyVersion: 'v1',
        learningContextKey: 'v1|price|high_mid',
        learningMode: 'active',
      },
      storeId: 'store-1',
      context,
    })

    expect(result?.selection.appliedStrategy).toBe('CONCISE')
    expect(result?.selection.reason).toBe('persisted')
    expect(mockPrisma.bargainLearningArmStat.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.bargainLearningEvent.create).not.toHaveBeenCalled()
    expect(mockPrisma.bargainSession.update).not.toHaveBeenCalled()
  })

  test('reselects when the config version changes', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(
      configRow({ version: 'v2' }),
    )
    const result = await resolveSessionLearning({
      session: {
        ...session,
        learningStrategy: 'CONCISE',
        learningStrategyVersion: 'v1',
        learningContextKey: 'v1|price|high_mid',
        learningMode: 'active',
      },
      storeId: 'store-1',
      context,
    })

    expect(result?.selection.version).toBe('v2')
    expect(mockPrisma.bargainSession.update).toHaveBeenCalledTimes(1)
    expect(mockPrisma.bargainLearningEvent.create).toHaveBeenCalledTimes(1)
  })

  test('duplicate selection events fail open without incrementing statistics', async () => {
    const duplicateError: any = new Error('duplicate')
    duplicateError.code = 'P2002'
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(configRow())
    mockPrisma.bargainLearningEvent.create.mockRejectedValue(duplicateError)

    const result = await resolveSessionLearning({
      session,
      storeId: 'store-1',
      context,
    })

    expect(result).not.toBeNull()
    expect(mockPrisma.bargainLearningArmStat.upsert).not.toHaveBeenCalled()
  })

  test('demo preview uses the demo partition and never persists a session', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(
      configRow({ enabled: false, shadowMode: true, demoEnabled: true }),
    )
    const result = await previewDemoLearning({
      storeId: 'store-1',
      demoSessionId: 'demo-1',
      context,
    })

    expect(result?.selection.mode).toBe('demo')
    expect(mockPrisma.bargainLearningArmStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ environment: 'demo' }),
      }),
    )
    expect(mockPrisma.bargainLearningEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ environment: 'demo', sessionId: null }),
      }),
    )
    expect(mockPrisma.bargainSession.update).not.toHaveBeenCalled()
  })

  test('demo preview stays off when demo learning is disabled', async () => {
    mockPrisma.bargainLearningConfig.findUnique.mockResolvedValue(
      configRow({ demoEnabled: false }),
    )
    const result = await previewDemoLearning({
      storeId: 'store-1',
      context,
    })
    expect(result).toBeNull()
  })

  test('turn events persist safe agent attribution', async () => {
    mockPrisma.bargainLearningEvent.create.mockResolvedValue({ id: 'event-1' })
    const created = await recordLearningEvent({
      storeId: 'store-1',
      environment: 'production',
      eventType: 'offer_turn',
      strategy: 'FRIENDLY',
      version: 'v1',
      contextKey: 'v1|price|low_mid',
      mode: 'active',
      dedupeKey: 'turn:session-1:2:counter',
      agentSource: 'fallback',
      agentModel: 'openai/gpt-oss-120b',
      latencyMs: 412,
      failureCategory: 'timeout',
    })
    expect(created).toBe(true)
    const event = mockPrisma.bargainLearningEvent.create.mock.calls[0][0].data
    expect(event.agentSource).toBe('fallback')
    expect(event.agentModel).toBe('openai/gpt-oss-120b')
    expect(event.latencyMs).toBe(412)
    expect(event.failureCategory).toBe('timeout')
  })
})
