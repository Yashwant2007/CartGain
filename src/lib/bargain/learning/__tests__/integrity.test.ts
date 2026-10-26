import { assessLearningIntegrity } from '../integrity'

const base = {
  storeId: 'store-1',
  environment: 'production' as const,
  strategy: 'CONCISE',
  dedupeKey: 'event:1',
}

describe('learning integrity gate', () => {
  test('accepts a scoped, idempotent production event', () => {
    expect(assessLearningIntegrity(base)).toEqual({
      action: 'accept',
      reasons: [],
      strategy: 'CONCISE',
    })
  })

  test('rejects cross-tenant session attribution', () => {
    const result = assessLearningIntegrity({
      ...base,
      sessionStoreId: 'store-2',
    })
    expect(result.action).toBe('reject')
    expect(result.reasons).toContain('cross_tenant_session')
  })

  test('rejects demo data attributed to production and vice versa', () => {
    const result = assessLearningIntegrity({
      ...base,
      sessionEnvironment: 'demo',
    })
    expect(result.action).toBe('reject')
    expect(result.reasons).toContain('environment_mismatch')
  })

  test('rejects demo commercial outcomes', () => {
    const result = assessLearningIntegrity({
      ...base,
      environment: 'demo',
      eventType: 'purchased',
    })
    expect(result.action).toBe('reject')
    expect(result.reasons).toContain('commercial_outcome_in_demo')
  })

  test('rejects malformed values, strategies and idempotency keys', () => {
    expect(
      assessLearningIntegrity({ ...base, strategy: 'MAGIC', value: 10 }).action,
    ).toBe('reject')
    expect(assessLearningIntegrity({ ...base, value: Number.NaN }).action).toBe('reject')
    expect(assessLearningIntegrity({ ...base, dedupeKey: '' }).action).toBe('reject')
  })

  test('quarantines manipulation without rejecting the commercial session', () => {
    const result = assessLearningIntegrity({
      ...base,
      manipulation: true,
      claimStatuses: ['malicious'],
    })
    expect(result.action).toBe('quarantine')
    expect(result.reasons).toContain('manipulation_signal')
  })
})
