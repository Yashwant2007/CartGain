import { isLearningStrategy } from './strategies'
import type { LearningEnvironment, LearningStrategy } from './types'

export type LearningIntegrityAction = 'accept' | 'quarantine' | 'reject'

export interface LearningIntegrityInput {
  storeId: string
  sessionStoreId?: string | null
  environment: LearningEnvironment
  sessionEnvironment?: LearningEnvironment | null
  strategy: string
  dedupeKey: string
  eventType?: string
  value?: number | null
  manipulation?: boolean
  claimStatuses?: string[]
}

export interface LearningIntegrityResult {
  action: LearningIntegrityAction
  reasons: string[]
  strategy: LearningStrategy | null
}

const MALICIOUS_CLAIM_STATUSES = new Set(['malicious'])

export function assessLearningIntegrity(
  input: LearningIntegrityInput,
): LearningIntegrityResult {
  const reasons: string[] = []
  const strategy = isLearningStrategy(input.strategy) ? input.strategy : null

  if (!input.storeId || !input.storeId.trim()) reasons.push('missing_store')
  if (!input.dedupeKey || !input.dedupeKey.trim()) reasons.push('missing_idempotency_key')
  if (!strategy) reasons.push('unsupported_strategy')
  if (input.value != null && !Number.isFinite(input.value)) reasons.push('invalid_value')

  if (input.sessionStoreId && input.sessionStoreId !== input.storeId) {
    reasons.push('cross_tenant_session')
  }
  if (input.sessionEnvironment && input.sessionEnvironment !== input.environment) {
    reasons.push('environment_mismatch')
  }
  if (input.environment === 'demo' && input.eventType === 'purchased') {
    reasons.push('commercial_outcome_in_demo')
  }

  if (reasons.length > 0) {
    return { action: 'reject', reasons, strategy }
  }

  const maliciousClaims = (input.claimStatuses ?? []).filter((status) =>
    MALICIOUS_CLAIM_STATUSES.has(status),
  )
  if (input.manipulation || maliciousClaims.length > 0) {
    return {
      action: 'quarantine',
      reasons: input.manipulation ? ['manipulation_signal'] : maliciousClaims,
      strategy,
    }
  }

  return { action: 'accept', reasons: [], strategy }
}
