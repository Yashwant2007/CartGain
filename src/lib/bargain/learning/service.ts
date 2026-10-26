import prisma from '@/lib/db'
import { buildLearningFeatures, GLOBAL_CONTEXT_KEY } from './features'
import {
  BASELINE_STRATEGY,
  buildLearningGuidance,
  eligibleLearningStrategies,
  isLearningStrategy,
  learningConfigDefaults,
} from './strategies'
import { selectLearningStrategy, stableHash } from './selector'
import { assessLearningIntegrity } from './integrity'
import type {
  ArmSnapshot,
  LearningConfigView,
  LearningContextInput,
  LearningEnvironment,
  LearningGuidance,
  LearningMode,
  LearningSelection,
  LearningStrategy,
} from './types'

type LearningConfigRow = {
  enabled: boolean
  shadowMode: boolean
  demoEnabled: boolean
  version: string
  explorationRate: number
  minSamplesPerArm: number
  attributionWindowDays: number
  eventRetentionDays: number
  rewardConversion: number
  rewardMargin: number
  rewardExperience: number
  rewardEfficiency: number
  allowedStrategies: string[]
  blockedStrategies: string[]
  promoStrategyEnabled: boolean
}

export interface ResolvedLearning {
  selection: LearningSelection
  guidance: LearningGuidance
}

export interface LearningSessionSnapshot {
  id: string
  storeId?: string | null
  environment?: LearningEnvironment | null
  learningQuarantined?: boolean | null
  learningStrategy: string | null
  learningStrategyVersion: string | null
  learningContextKey: string | null
  learningMode: string | null
  learningShadowStrategy: string | null
  learningMaxRounds?: number | null
}

function mapConfig(row: LearningConfigRow | null): LearningConfigView | null {
  if (!row) return null
  return learningConfigDefaults({
    ...row,
    allowedStrategies: Array.isArray(row.allowedStrategies) ? row.allowedStrategies : [],
    blockedStrategies: Array.isArray(row.blockedStrategies) ? row.blockedStrategies : [],
  })
}

export async function loadLearningConfig(
  storeId: string,
): Promise<LearningConfigView | null> {
  try {
    const model = (prisma as any).bargainLearningConfig
    if (!model?.findUnique) return null
    const row = await model.findUnique({ where: { storeId } })
    return mapConfig(row)
  } catch (err: any) {
    if (err?.code !== 'P2021' && err?.code !== 'P2022') {
      console.warn('[bargain-learning] config read failed:', err?.message ?? err)
    }
    return null
  }
}

function productionMode(config: LearningConfigView): LearningMode {
  if (!config.enabled) return 'baseline'
  return config.shadowMode ? 'shadow' : 'active'
}

function demoMode(config: LearningConfigView | null): LearningMode {
  return config?.demoEnabled ? 'demo' : 'baseline'
}

async function loadArmStats(params: {
  storeId: string
  environment: LearningEnvironment
  version: string
  contextKey: string
}): Promise<{ contextStats: ArmSnapshot[]; globalStats: ArmSnapshot[] }> {
  const model = (prisma as any).bargainLearningArmStat
  if (!model?.findMany) return { contextStats: [], globalStats: [] }
  try {
    const rows = await model.findMany({
      where: {
        storeId: params.storeId,
        environment: params.environment,
        strategyVersion: params.version,
        contextKey: { in: [params.contextKey, GLOBAL_CONTEXT_KEY] },
      },
    })
    const snapshots: ArmSnapshot[] = (Array.isArray(rows) ? rows : []).map((row: any) => ({
      strategy: String(row.strategy),
      pulls: Number(row.pulls) || 0,
      outcomes: Number(row.outcomes) || 0,
      accepted: Number(row.accepted) || 0,
      purchased: Number(row.purchased) || 0,
      rewardSum: Number(row.rewardSum) || 0,
      rewardSqSum: Number(row.rewardSqSum) || 0,
      alpha: Number(row.alpha) || 1,
      beta: Number(row.beta) || 1,
      contextKey: String(row.contextKey),
    }))
    return {
      contextStats: snapshots.filter((row) => row.contextKey !== GLOBAL_CONTEXT_KEY),
      globalStats: snapshots.filter((row) => row.contextKey === GLOBAL_CONTEXT_KEY),
    }
  } catch (err: any) {
    console.warn('[bargain-learning] stats read failed:', err?.message ?? err)
    return { contextStats: [], globalStats: [] }
  }
}

export async function recordLearningEvent(params: {
  storeId: string
  sessionId?: string | null
  environment: LearningEnvironment
  eventType: string
  strategy: string
  baselineStrategy?: string | null
  version: string
  contextKey: string
  mode: LearningMode
  intent?: string | null
  objection?: string | null
  originalPrice?: number | null
  floorPrice?: number | null
  offer?: number | null
  budget?: number | null
  recommendationEligible?: boolean
  value?: number | null
  dedupeKey: string
  properties?: Record<string, unknown>
}): Promise<boolean> {
  const model = (prisma as any).bargainLearningEvent
  if (!model?.create) return false
  try {
    await model.create({
      data: {
        storeId: params.storeId,
        sessionId: params.sessionId ?? null,
        environment: params.environment,
        eventType: params.eventType,
        strategy: params.strategy,
        baselineStrategy: params.baselineStrategy ?? null,
        strategyVersion: params.version,
        contextKey: params.contextKey,
        mode: params.mode,
        intent: params.intent ?? null,
        objection: params.objection ?? null,
        offerBucket: buildLearningFeatures({
          originalPrice: Math.max(0.01, params.originalPrice ?? params.offer ?? 1),
          floorPrice: Math.max(0, params.floorPrice ?? 0),
          offer: params.offer ?? null,
          budget: params.budget ?? null,
          intent: params.intent ?? null,
          objection: params.objection ?? null,
          rounds: 0,
          maxRounds: 1,
          recommendationsEnabled: params.recommendationEligible ?? false,
        }).offerBucket,
        budgetBucket: buildLearningFeatures({
          originalPrice: Math.max(0.01, params.originalPrice ?? params.budget ?? 1),
          floorPrice: Math.max(0, params.floorPrice ?? 0),
          offer: null,
          budget: params.budget ?? null,
          intent: params.intent ?? null,
          objection: params.objection ?? null,
          rounds: 0,
          maxRounds: 1,
          recommendationsEnabled: params.recommendationEligible ?? false,
        }).budgetBucket,
        recommendationEligible: params.recommendationEligible === true,
        value: params.value ?? null,
        dedupeKey: params.dedupeKey,
        properties: (params.properties ?? null) as any,
      },
    })
    return true
  } catch (err: any) {
    if (err?.code !== 'P2002' && err?.code !== 'P2021' && err?.code !== 'P2022') {
      console.warn('[bargain-learning] event write failed:', err?.message ?? err)
    }
    return false
  }
}

export async function incrementLearningStats(params: {
  storeId: string
  environment: LearningEnvironment
  version: string
  contextKey: string
  strategy: string
  pulls?: number
  outcomes?: number
  accepted?: number
  purchased?: number
  rewardDelta?: number
  betaDelta?: number
  rewardSqDelta?: number
}): Promise<void> {
  const model = (prisma as any).bargainLearningArmStat
  if (!model?.upsert) return
  const pulls = params.pulls ?? 0
  const outcomes = params.outcomes ?? 0
  const accepted = params.accepted ?? 0
  const purchased = params.purchased ?? 0
  const rewardDelta = params.rewardDelta ?? 0
  const betaDelta = params.betaDelta ?? -rewardDelta
  const rewardSqDelta = params.rewardSqDelta ?? 0
  if (
    pulls === 0 &&
    outcomes === 0 &&
    accepted === 0 &&
    purchased === 0 &&
    rewardDelta === 0 &&
    betaDelta === 0 &&
    rewardSqDelta === 0
  ) {
    return
  }

  const keys = Array.from(new Set([params.contextKey, GLOBAL_CONTEXT_KEY]))
  for (const contextKey of keys) {
    try {
      await model.upsert({
        where: {
          storeId_environment_strategyVersion_contextKey_strategy: {
            storeId: params.storeId,
            environment: params.environment,
            strategyVersion: params.version,
            contextKey,
            strategy: params.strategy,
          },
        },
        create: {
          storeId: params.storeId,
          environment: params.environment,
          strategyVersion: params.version,
          contextKey,
          strategy: params.strategy,
          pulls: Math.max(0, pulls),
          outcomes: Math.max(0, outcomes),
          accepted: Math.max(0, accepted),
          purchased: Math.max(0, purchased),
          rewardSum: rewardDelta,
          rewardSqSum: Math.max(0, rewardSqDelta),
          alpha: 1 + rewardDelta,
          beta: 1 + betaDelta,
          lastRewardAt: rewardDelta !== 0 ? new Date() : null,
        },
        update: {
          ...(pulls !== 0 ? { pulls: { increment: pulls } } : {}),
          ...(outcomes !== 0 ? { outcomes: { increment: outcomes } } : {}),
          ...(accepted !== 0 ? { accepted: { increment: accepted } } : {}),
          ...(purchased !== 0 ? { purchased: { increment: purchased } } : {}),
          ...(rewardDelta !== 0
            ? {
                rewardSum: { increment: rewardDelta },
                alpha: { increment: rewardDelta },
                lastRewardAt: new Date(),
              }
            : {}),
          ...(betaDelta !== 0 ? { beta: { increment: betaDelta } } : {}),
          ...(rewardSqDelta !== 0
            ? { rewardSqSum: { increment: rewardSqDelta } }
            : {}),
        },
      })
    } catch (err: any) {
      if (err?.code !== 'P2021' && err?.code !== 'P2022') {
        console.warn('[bargain-learning] stat write failed:', err?.message ?? err)
      }
    }
  }
}

function persistedSelection(params: {
  session: LearningSessionSnapshot
  mode: LearningMode
  context: LearningContextInput
  config: LearningConfigView
}): LearningSelection | null {
  const storedMode = params.session.learningMode as LearningMode | null
  if (storedMode !== params.mode) return null
  if (params.session.learningStrategyVersion !== params.config.version) return null
  const features = buildLearningFeatures({ ...params.context, config: params.config })
  const applied = isLearningStrategy(params.session.learningStrategy)
    ? params.session.learningStrategy
    : BASELINE_STRATEGY
  const shadow = isLearningStrategy(params.session.learningShadowStrategy)
    ? params.session.learningShadowStrategy
    : null
  const strategy = params.mode === 'shadow' ? shadow ?? applied : applied
  return {
    strategy,
    appliedStrategy: applied,
    shadowStrategy: shadow,
    baselineStrategy: BASELINE_STRATEGY,
    version: params.config.version,
    contextKey: params.session.learningContextKey ?? features.contextKey,
    mode: params.mode,
    features,
    eligible: eligibleLearningStrategies({ ...params.context, config: params.config }),
    isExploration: false,
    reason: 'persisted',
  }
}

async function persistSessionSelection(params: {
  sessionId: string
  selection: LearningSelection
  maxRounds: number
}): Promise<void> {
  try {
    const model = (prisma as any).bargainSession
    if (!model?.update) return
    await model.update({
      where: { id: params.sessionId },
      data: {
        learningStrategy: params.selection.appliedStrategy,
        learningStrategyVersion: params.selection.version,
        learningContextKey: params.selection.contextKey,
        learningMode: params.selection.mode,
        learningShadowStrategy: params.selection.shadowStrategy,
        learningMaxRounds: Math.max(1, params.maxRounds),
      },
    })
  } catch (err: any) {
    console.warn('[bargain-learning] session persist failed:', err?.message ?? err)
  }
}

export async function resolveSessionLearning(params: {
  session: LearningSessionSnapshot
  storeId: string
  environment?: LearningEnvironment
  context: LearningContextInput
}): Promise<ResolvedLearning | null> {
  try {
    const environment = params.environment ?? 'production'
    const config = await loadLearningConfig(params.storeId)
    if (!config) return null
    const mode = environment === 'demo' ? demoMode(config) : productionMode(config)
    if (mode === 'baseline') return null

    const integrity = assessLearningIntegrity({
      storeId: params.storeId,
      sessionStoreId: params.session.storeId ?? null,
      environment,
      sessionEnvironment: params.session.environment ?? null,
      strategy: params.session.learningStrategy ?? BASELINE_STRATEGY,
      dedupeKey: `strategy:${params.session.id}:${config.version}:${mode}`,
      eventType: 'strategy_selected',
      value: params.context.offer,
      manipulation: params.session.learningQuarantined === true,
    })
    if (integrity.action !== 'accept') {
      if (integrity.action === 'reject') {
        console.warn('[bargain-learning] integrity gate rejected selection', {
          reasons: integrity.reasons,
        })
      }
      return null
    }

    const context = { ...params.context, config }
    const persisted = persistedSelection({
      session: params.session,
      mode,
      context,
      config,
    })
    if (persisted) {
      return { selection: persisted, guidance: buildLearningGuidance(persisted) }
    }

    const features = buildLearningFeatures(context)
    const stats = await loadArmStats({
      storeId: params.storeId,
      environment,
      version: config.version || 'v1',
      contextKey: features.contextKey,
    })
    const selection = selectLearningStrategy({
      context,
      mode,
      config,
      contextStats: stats.contextStats,
      globalStats: stats.globalStats,
      seed: `${params.session.id}:${features.contextKey}:${config.version}`,
    })
    await persistSessionSelection({ sessionId: params.session.id, selection, maxRounds: params.context.maxRounds })

    if (mode === 'active' || mode === 'demo') {
      const created = await recordLearningEvent({
        storeId: params.storeId,
        sessionId: params.session.id,
        environment,
        eventType: 'strategy_selected',
        strategy: selection.appliedStrategy,
        baselineStrategy: selection.baselineStrategy,
        version: selection.version,
        contextKey: selection.contextKey,
        mode: selection.mode,
        intent: params.context.intent,
        objection: params.context.objection,
        originalPrice: params.context.originalPrice,
        floorPrice: params.context.floorPrice,
        offer: params.context.offer,
        budget: params.context.budget,
        recommendationEligible: selection.features.recommendationEligible,
        dedupeKey: `strategy:${params.session.id}:${selection.version}:${selection.mode}`,
        properties: {
          candidate: selection.strategy,
          reason: selection.reason,
          exploration: selection.isExploration,
        },
      })
      if (created) {
        await incrementLearningStats({
          storeId: params.storeId,
          environment,
          version: selection.version,
          contextKey: selection.contextKey,
          strategy: selection.appliedStrategy,
          pulls: 1,
        })
      }
    }

    return { selection, guidance: buildLearningGuidance(selection) }
  } catch (err: any) {
    console.warn('[bargain-learning] selection failed:', err?.message ?? err)
    return null
  }
}

export async function previewDemoLearning(params: {
  storeId: string
  context: LearningContextInput
  demoSessionId?: string | null
}): Promise<ResolvedLearning | null> {
  try {
    const config = await loadLearningConfig(params.storeId)
    const mode = demoMode(config)
    if (!config || mode === 'baseline') return null
    const context = { ...params.context, config }
    const features = buildLearningFeatures(context)
    const stats = await loadArmStats({
      storeId: params.storeId,
      environment: 'demo',
      version: config.version || 'v1',
      contextKey: features.contextKey,
    })
    const seedKey =
      params.demoSessionId ||
      `demo-${stableHash(
        `${params.storeId}:${params.context.intent ?? ''}:${params.context.offer ?? ''}`,
      ).toString(36)}`
    const selection = selectLearningStrategy({
      context,
      mode,
      config,
      contextStats: stats.contextStats,
      globalStats: stats.globalStats,
      seed: `${params.storeId}:${seedKey}:${features.contextKey}:${config.version}`,
    })
    const created = await recordLearningEvent({
      storeId: params.storeId,
      sessionId: null,
      environment: 'demo',
      eventType: 'strategy_selected',
      strategy: selection.appliedStrategy,
      baselineStrategy: selection.baselineStrategy,
      version: selection.version,
      contextKey: selection.contextKey,
      mode: selection.mode,
      intent: params.context.intent,
      objection: params.context.objection,
      originalPrice: params.context.originalPrice,
      floorPrice: params.context.floorPrice,
      offer: params.context.offer,
      budget: params.context.budget,
      recommendationEligible: selection.features.recommendationEligible,
      dedupeKey: `strategy:demo:${params.storeId}:${seedKey}:${selection.version}`,
      properties: {
        candidate: selection.strategy,
        reason: selection.reason,
        exploration: selection.isExploration,
      },
    })
    if (created) {
      await incrementLearningStats({
        storeId: params.storeId,
        environment: 'demo',
        version: selection.version,
        contextKey: selection.contextKey,
        strategy: selection.appliedStrategy,
        pulls: 1,
      })
    }
    return { selection, guidance: buildLearningGuidance(selection) }
  } catch (err: any) {
    console.warn('[bargain-learning] demo selection failed:', err?.message ?? err)
    return null
  }
}

export function learningSelectionForClient(selection: LearningSelection) {
  return {
    strategy: selection.appliedStrategy,
    candidate: selection.strategy,
    mode: selection.mode,
    version: selection.version,
    contextKey: selection.contextKey,
    features: selection.features,
    exploration: selection.isExploration,
    reason: selection.reason,
  }
}
