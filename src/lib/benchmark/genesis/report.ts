import {
  GENESIS_CATEGORIES,
  GENESIS_CATEGORY_LABELS,
  GENESIS_CATEGORY_WEIGHTS,
  GENESIS_ENGINES,
  GENESIS_LIVE_VERIFICATION,
  GENESIS_SUITE_NAME,
  GENESIS_UNVERIFIED_QUALITY_CATEGORIES,
  type GenesisCaseResult,
  type GenesisCategory,
  type GenesisEngine,
  type GenesisVerification,
} from './types'

export interface GenesisCategoryScore {
  category: GenesisCategory
  label: string
  weight: number
  objectiveScore: number | null
  verification: GenesisVerification
  passedChecks: number
  totalObjectiveChecks: number
  pendingChecks: number
}

export interface GenesisEngineReport {
  engine: GenesisEngine
  cases: GenesisCaseResult[]
  categories: GenesisCategoryScore[]
  overall: {
    verifiedWeightedScore: number | null
    verifiedWeight: number
    simulatedUnverifiedWeightedScore: number | null
    simulatedUnverifiedWeight: number
    liveProviderUnreviewedWeightedScore?: number | null
    liveProviderUnreviewedWeight?: number
  }
}

export type GenesisGateStatus = 'pass' | 'fail' | 'pending'

export interface GenesisReleaseGateItem {
  id: string
  status: GenesisGateStatus
  reasons: string[]
}

export interface GenesisReport {
  suiteName: typeof GENESIS_SUITE_NAME
  elapsedMs: number
  engines: GenesisEngineReport[]
  releaseGate: {
    status: GenesisGateStatus
    items: GenesisReleaseGateItem[]
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function scoreCategory(
  cases: GenesisCaseResult[],
  category: GenesisCategory,
): GenesisCategoryScore {
  const relevant = cases.filter((entry) => entry.category === category)
  const hasLive = relevant.some((entry) => entry.verification === GENESIS_LIVE_VERIFICATION)
  const objective = relevant.flatMap((entry) => entry.checks.filter((check) => check.kind === 'objective'))
  const pending = relevant.flatMap((entry) => entry.checks.filter(
    (check) => check.kind === 'pending'
      || (entry.verification === GENESIS_LIVE_VERIFICATION && check.kind === 'quality'),
  ))
  const passed = objective.filter((check) => check.passed).length
  const score = hasLive || objective.length === 0 ? null : round((passed / objective.length) * 10)
  const verification: GenesisVerification = hasLive
    ? GENESIS_LIVE_VERIFICATION
    : objective.length === 0
      ? 'pending_external_verification'
      : GENESIS_UNVERIFIED_QUALITY_CATEGORIES.has(category)
        ? 'simulated_unverified_ai_quality'
        : 'verified_assertions'
  return {
    category,
    label: GENESIS_CATEGORY_LABELS[category],
    weight: GENESIS_CATEGORY_WEIGHTS[category],
    objectiveScore: score,
    verification,
    passedChecks: passed,
    totalObjectiveChecks: objective.length,
    pendingChecks: pending.length,
  }
}

function weightedScore(
  categories: GenesisCategoryScore[],
  unverified: boolean,
  excludeLive: boolean,
): { score: number | null; weight: number } {
  const selected = categories.filter((entry) =>
    GENESIS_UNVERIFIED_QUALITY_CATEGORIES.has(entry.category) === unverified
    && (!excludeLive || entry.verification !== GENESIS_LIVE_VERIFICATION),
  )
  const weight = selected.reduce((total, entry) => total + entry.weight, 0)
  const scored = selected.filter((entry) => entry.objectiveScore != null)
  const scoredWeight = scored.reduce((total, entry) => total + entry.weight, 0)
  if (scoredWeight === 0) return { score: null, weight }
  const sum = scored.reduce((total, entry) => total + (entry.objectiveScore ?? 0) * entry.weight, 0)
  return { score: round(sum / scoredWeight), weight }
}

function liveWeightedScore(categories: GenesisCategoryScore[]): { score: number | null; weight: number } {
  const selected = categories.filter((entry) => entry.verification === GENESIS_LIVE_VERIFICATION)
  const weight = selected.reduce((total, entry) => total + entry.weight, 0)
  const scored = selected.filter((entry) => entry.objectiveScore != null)
  const scoredWeight = scored.reduce((total, entry) => total + entry.weight, 0)
  if (scoredWeight === 0) return { score: null, weight }
  const sum = scored.reduce((total, entry) => total + (entry.objectiveScore ?? 0) * entry.weight, 0)
  return { score: round(sum / scoredWeight), weight }
}

function casesPassInAllEngines(
  cases: GenesisCaseResult[],
  predicate: (entry: GenesisCaseResult) => boolean,
): boolean {
  return GENESIS_ENGINES.every((engine) => {
    const relevant = cases.filter((entry) => entry.engine === engine && predicate(entry))
    return relevant.length > 0 && relevant.every((entry) => entry.passed)
  })
}

function buildReleaseGate(cases: GenesisCaseResult[]): GenesisReport['releaseGate'] {
  const priceIds = new Set([
    'GEN-001', 'GEN-002', 'GEN-003', 'GEN-004', 'GEN-005', 'GEN-006', 'GEN-007',
    'GEN-008', 'GEN-010', 'GEN-011', 'GEN-012', 'GEN-041', 'GEN-042', 'GEN-048',
    'GEN-053', 'GEN-054', 'GEN-066', 'GEN-067',
  ])
  const reliabilityIds = new Set(['GEN-058', 'GEN-059', 'GEN-060', 'GEN-061', 'GEN-062', 'GEN-063'])
  const credentialCheck = (entry: GenesisCaseResult) => entry.checks.some((check) => check.id.endsWith(':no_secret_material') && check.passed)
  const hasLiveProviderCases = cases.some((entry) => entry.verification === GENESIS_LIVE_VERIFICATION)

  const items: GenesisReleaseGateItem[] = [
    {
      id: 'price_invariants',
      status: casesPassInAllEngines(cases, (entry) => priceIds.has(entry.id)) ? 'pass' : 'fail',
      reasons: ['configured list price, max discount and floor, required offers, injection, forged redemption and one-minor-unit guard'],
    },
    {
      id: 'code_side_provider_failover',
      status: casesPassInAllEngines(cases, (entry) => reliabilityIds.has(entry.id)) ? 'pass' : 'fail',
      reasons: ['deterministic simulations of primary/fallback availability, invalid response, timeout and rate limit'],
    },
    {
      id: 'credential_hygiene',
      status: casesPassInAllEngines(cases, credentialCheck) ? 'pass' : 'fail',
      reasons: ['no provider keys, tokens, secrets or sensitive response text are logged or printed'],
    },
    {
      id: 'ai_response_quality',
      status: 'pending',
      reasons: [hasLiveProviderCases
        ? 'live_provider_unreviewed_quality: real provider output requires human review'
        : 'simulated_unverified_ai_quality: real provider output and human review are required'],
    },
  ]
  if (hasLiveProviderCases) {
    items.push({
      id: 'live_provider_quality',
      status: 'pending',
      reasons: ['live provider replies are recorded but stay unverified until each tier is reviewed by a human'],
    })
  }
  items.push(
    {
      id: 'live_shopify_redemption',
      status: 'pending',
      reasons: ['Shopify discount creation and redemption are verified with in-memory mocks only'],
    },
    {
      id: 'live_db_concurrency',
      status: 'pending',
      reasons: ['duplicate turns and concurrent quote redemption require a real database run'],
    },
    {
      id: 'real_provider_failover',
      status: 'pending',
      reasons: ['real timeout, 429 and tier-circuit behavior are not exercised in deterministic CI'],
    },
  )

  const status: GenesisGateStatus = items.some((item) => item.status === 'fail')
    ? 'fail'
    : items.some((item) => item.status === 'pending')
      ? 'pending'
      : 'pass'

  return { status, items }
}

export function buildGenesisReport(cases: GenesisCaseResult[], elapsedMs: number): GenesisReport {
  const engines = GENESIS_ENGINES.map((engine) => {
    const engineCases = cases.filter((entry) => entry.engine === engine)
    const categories = GENESIS_CATEGORIES.map((category) => scoreCategory(engineCases, category))
    const verified = weightedScore(categories, false, true)
    const simulated = weightedScore(categories, true, true)
    const live = liveWeightedScore(categories)
    return {
      engine,
      cases: engineCases,
      categories,
      overall: {
        verifiedWeightedScore: verified.score,
        verifiedWeight: verified.weight,
        simulatedUnverifiedWeightedScore: simulated.score,
        simulatedUnverifiedWeight: simulated.weight,
        ...(live.weight > 0
          ? {
              liveProviderUnreviewedWeightedScore: live.score,
              liveProviderUnreviewedWeight: live.weight,
            }
          : {}),
      },
    }
  })

  return {
    suiteName: GENESIS_SUITE_NAME,
    elapsedMs,
    engines,
    releaseGate: buildReleaseGate(cases),
  }
}
