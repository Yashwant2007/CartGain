import { buildLearningFeatures } from './features'
import {
  BASELINE_STRATEGY,
  eligibleLearningStrategies,
  learningConfigDefaults,
} from './strategies'
import type {
  ArmSnapshot,
  LearningConfigView,
  LearningContextInput,
  LearningMode,
  LearningSelection,
  LearningStrategy,
} from './types'

export type RandomSource = () => number

export function stableHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function seededRandom(seed: string): RandomSource {
  let state = stableHash(seed) || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function normal(rng: RandomSource): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function sampleGamma(shape: number, rng: RandomSource): number {
  if (!(shape > 0)) return 0
  if (shape < 1) {
    return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (let attempt = 0; attempt < 32; attempt++) {
    const x = normal(rng)
    const v = Math.pow(1 + c * x, 3)
    if (v <= 0) continue
    const u = rng()
    if (
      u < 1 - 0.0331 * x * x * x * x ||
      Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)
    ) {
      return d * v
    }
  }
  return Math.max(1e-9, shape)
}

export function sampleBeta(
  alpha: number,
  beta: number,
  rng: RandomSource,
): number {
  const a = Math.max(1e-6, alpha)
  const b = Math.max(1e-6, beta)
  const x = sampleGamma(a, rng)
  const y = sampleGamma(b, rng)
  if (x + y <= 0) return a / (a + b)
  return x / (x + y)
}

function statMap(stats: ArmSnapshot[]): Map<string, ArmSnapshot> {
  const map = new Map<string, ArmSnapshot>()
  for (const stat of stats) map.set(stat.strategy, stat)
  return map
}

function posteriorMean(stat: ArmSnapshot | undefined): number {
  if (!stat) return 0.5
  const alpha = Math.max(0, stat.alpha)
  const beta = Math.max(0, stat.beta)
  return alpha + beta > 0 ? alpha / (alpha + beta) : 0.5
}

function resolvedStat(
  strategy: LearningStrategy,
  specific: Map<string, ArmSnapshot>,
  global: Map<string, ArmSnapshot>,
  minSamples: number,
): ArmSnapshot | undefined {
  const local = specific.get(strategy)
  if (local && local.pulls >= minSamples) return local
  const overall = global.get(strategy)
  if (overall && overall.pulls >= minSamples) return overall
  return local ?? overall
}

function baselineSelection(input: {
  contextKey: string
  version: string
  features: LearningSelection['features']
  eligible: LearningStrategy[]
  mode: LearningMode
  reason: string
}): LearningSelection {
  return {
    strategy: BASELINE_STRATEGY,
    appliedStrategy: BASELINE_STRATEGY,
    shadowStrategy: null,
    baselineStrategy: BASELINE_STRATEGY,
    version: input.version,
    contextKey: input.contextKey,
    mode: input.mode,
    features: input.features,
    eligible: input.eligible,
    isExploration: false,
    reason: input.reason,
  }
}

export interface SelectLearningParams {
  context: LearningContextInput
  mode: LearningMode
  contextStats?: ArmSnapshot[]
  globalStats?: ArmSnapshot[]
  seed?: string
  random?: RandomSource
  config?: Partial<LearningConfigView> | null
}

export function selectLearningStrategy(
  params: SelectLearningParams,
): LearningSelection {
  const config = learningConfigDefaults(params.config ?? {})
  const features = buildLearningFeatures({ ...params.context, config })
  const eligible = eligibleLearningStrategies({ ...params.context, config })
  const version = config.version || 'v1'
  const minSamples = Math.max(1, config.minSamplesPerArm)
  const specific = statMap(params.contextStats ?? [])
  const global = statMap(params.globalStats ?? [])
  const rng =
    params.random ??
    seededRandom(
      params.seed ??
        `${version}:${params.context.intent ?? 'unknown'}:${params.context.offer ?? 'none'}:${Date.now()}:${Math.random()}`,
    )

  if (params.mode === 'baseline' || eligible.length <= 1) {
    return baselineSelection({
      contextKey: features.contextKey,
      version,
      features,
      eligible,
      mode: params.mode,
      reason: params.mode === 'baseline' ? 'learning_disabled' : 'baseline_only',
    })
  }

  const samples = eligible.map((strategy) => {
    const stat = resolvedStat(strategy, specific, global, minSamples)
    const alpha = Math.max(1, stat?.alpha ?? 1)
    const beta = Math.max(1, stat?.beta ?? 1)
    return {
      strategy,
      stat,
      sample: sampleBeta(alpha, beta, rng),
      mean: posteriorMean(stat),
      trusted: (stat?.pulls ?? 0) >= minSamples,
    }
  })

  const bySample = [...samples].sort((a, b) => b.sample - a.sample)
  let chosen = bySample[0]
  let isExploration = false
  let reason = 'exploitation'

  if (!chosen.trusted && chosen.strategy !== BASELINE_STRATEGY) {
    const explorationRate = Math.max(0, Math.min(0.5, config.explorationRate))
    if (rng() <= explorationRate) {
      isExploration = true
      reason = 'exploration'
    } else {
      const trusted = samples
        .filter((item) => item.trusted)
        .sort((a, b) => b.mean - a.mean)
      chosen =
        trusted[0] ??
        samples.find((item) => item.strategy === BASELINE_STRATEGY) ??
        bySample[0]
      reason = 'fallback'
    }
  } else if (chosen.strategy === BASELINE_STRATEGY && !chosen.trusted) {
    const trusted = samples
      .filter((item) => item.trusted && item.strategy !== BASELINE_STRATEGY)
      .sort((a, b) => b.mean - a.mean)
    if (trusted.length > 0 && rng() <= Math.max(0, config.explorationRate)) {
      chosen = trusted[0]
      isExploration = true
      reason = 'exploration'
    }
  }

  const appliedStrategy =
    params.mode === 'active' || params.mode === 'demo'
      ? chosen.strategy
      : BASELINE_STRATEGY

  return {
    strategy: chosen.strategy,
    appliedStrategy,
    shadowStrategy: params.mode === 'shadow' ? chosen.strategy : null,
    baselineStrategy: BASELINE_STRATEGY,
    version,
    contextKey: features.contextKey,
    mode: params.mode,
    features,
    eligible,
    isExploration,
    reason,
  }
}
