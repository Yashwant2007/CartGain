import prisma from '@/lib/db'
import { loadLearningConfig, incrementLearningStats, recordLearningEvent } from './service'
import { computeLearningReward } from './reward'
import type {
  LearningConfigView,
  LearningEnvironment,
  LearningMode,
  LearningRewardBreakdown,
} from './types'

interface OutcomeContext {
  sessionId: string
  storeId: string
  environment: LearningEnvironment
  strategy: string
  version: string
  contextKey: string
  mode: LearningMode
  originalPrice: number
  floorPrice: number
  maxRounds: number
  quarantined: boolean
  agentSource: string | null
  agentModel: string | null
  config: LearningConfigView | null
}

interface OutcomeRow {
  id: string
  outcomeKey: string
  sessionId: string | null
  accepted: boolean
  purchased: boolean
  finalizedAt: Date | null
  rewardApplied: number
  refundedAmount: number
  purchaseValue: number | null
  finalPrice: number | null
  quarantined: boolean
}

function outcomeContextFromSession(session: any, config: LearningConfigView | null): OutcomeContext | null {
  const mode = session.learningMode as LearningMode | null
  if (mode !== 'active' && mode !== 'demo') return null
  if (!session.learningStrategy || !session.learningStrategyVersion) return null
  return {
    sessionId: String(session.id),
    storeId: String(session.storeId),
    environment: (session.environment === 'demo' ? 'demo' : 'production') as LearningEnvironment,
    strategy: String(session.learningStrategy),
    version: String(session.learningStrategyVersion),
    contextKey: String(session.learningContextKey ?? '__global__'),
    mode,
    originalPrice: Number(session.originalPrice) || 0,
    floorPrice: Number(session.bargainFloor) || 0,
    maxRounds: Math.max(1, Number(session.learningMaxRounds) || Number(session.attemptsUsed) || 1),
    quarantined: Boolean(session.learningQuarantined),
    agentSource: typeof session.lastAiSource === 'string' ? session.lastAiSource : null,
    agentModel: typeof session.lastAiModel === 'string' ? session.lastAiModel : null,
    config,
  }
}

function rewardFor(params: {
  context: OutcomeContext
  finalPrice: number | null
  accepted: boolean
  purchased: boolean
  purchaseValue: number | null
  refundedAmount: number
  rounds: number
}): LearningRewardBreakdown {
  return computeLearningReward({
    originalPrice: params.context.originalPrice,
    floorPrice: params.context.floorPrice,
    finalPrice: params.finalPrice,
    accepted: params.accepted,
    purchased: params.purchased,
    purchaseValue: params.purchaseValue,
    refundedAmount: params.refundedAmount,
    rounds: params.rounds,
    maxRounds: params.context.maxRounds,
    weights: {
      conversion: params.context.config?.rewardConversion,
      margin: params.context.config?.rewardMargin,
      experience: params.context.config?.rewardExperience,
      efficiency: params.context.config?.rewardEfficiency,
    },
  })
}

async function readOutcome(outcomeKey: string): Promise<OutcomeRow | null> {
  const model = (prisma as any).bargainLearningOutcome
  if (!model?.findUnique) return null
  try {
    return await model.findUnique({ where: { outcomeKey } })
  } catch {
    return null
  }
}

async function applyStatsTransition(params: {
  context: OutcomeContext
  old: OutcomeRow | null
  next: {
    accepted: boolean
    purchased: boolean
    finalizedAt: Date | null
    reward: number
  }
}): Promise<void> {
  if (params.context.mode !== 'active' && params.context.mode !== 'demo') return
  const old = params.old
  if (params.context.quarantined && !old) return
  if (old?.quarantined) return
  const oldReward = Number(old?.rewardApplied) || 0
  const nextAccepted = params.context.quarantined ? false : params.next.accepted
  const nextPurchased = params.context.quarantined ? false : params.next.purchased
  const nextFinalized = params.context.quarantined ? null : params.next.finalizedAt
  const nextReward = params.context.quarantined ? 0 : params.next.reward
  const acceptedDelta = nextAccepted
    ? old?.accepted
      ? 0
      : 1
    : old?.accepted
      ? -1
      : 0
  const purchasedDelta = nextPurchased
    ? old?.purchased
      ? 0
      : 1
    : old?.purchased
      ? -1
      : 0
  const outcomeDelta = nextFinalized && !old?.finalizedAt ? 1 : 0
  const rewardDelta = nextReward - oldReward
  const betaDelta = outcomeDelta - rewardDelta
  const rewardSqDelta = nextReward ** 2 - oldReward ** 2

  await incrementLearningStats({
    storeId: params.context.storeId,
    environment: params.context.environment,
    version: params.context.version,
    contextKey: params.context.contextKey,
    strategy: params.context.strategy,
    accepted: acceptedDelta,
    purchased: purchasedDelta,
    outcomes: outcomeDelta,
    rewardDelta,
    betaDelta,
    rewardSqDelta,
  })
}

async function writeOutcome(params: {
  context: OutcomeContext
  finalPrice: number | null
  accepted: boolean
  purchased: boolean
  purchaseValue: number | null
  refundedAmount: number
  rounds: number
  shopifyOrderId?: string | null
  acceptedAt?: Date | null
  purchasedAt?: Date | null
  finalizedAt?: Date | null
}): Promise<LearningRewardBreakdown | null> {
  const model = (prisma as any).bargainLearningOutcome
  if (!model?.upsert) return null
  const outcomeKey = `session:${params.context.sessionId}`
  const old = await readOutcome(outcomeKey)
  const computedReward = rewardFor({
    context: params.context,
    finalPrice: params.finalPrice,
    accepted: params.accepted,
    purchased: params.purchased,
    purchaseValue: params.purchaseValue,
    refundedAmount: params.refundedAmount,
    rounds: params.rounds,
  })
  const reward = params.context.quarantined
    ? {
        total: 0,
        conversion: 0,
        margin: 0,
        experience: 0,
        efficiency: 0,
        purchasedNet: computedReward.purchasedNet,
      }
    : computedReward
  const finalizedAt =
    params.finalizedAt ?? (params.purchased || reward.purchasedNet ? new Date() : null)

  try {
    await model.upsert({
      where: { outcomeKey },
      create: {
        outcomeKey,
        storeId: params.context.storeId,
        sessionId: params.context.sessionId,
        environment: params.context.environment,
        strategy: params.context.strategy,
        strategyVersion: params.context.version,
        contextKey: params.context.contextKey,
        mode: params.context.mode,
        originalPrice: params.context.originalPrice,
        finalPrice: params.finalPrice,
        floorPrice: params.context.floorPrice,
        rounds: params.rounds,
        accepted: params.accepted,
        purchased: params.purchased,
        purchaseValue: params.purchaseValue,
        refundedAmount: params.refundedAmount,
        shopifyOrderId: params.shopifyOrderId ?? null,
        reward: reward.total,
        rewardConversion: reward.conversion,
        rewardMargin: reward.margin,
        rewardExperience: reward.experience,
        rewardEfficiency: reward.efficiency,
        rewardApplied: reward.total,
        quarantined: params.context.quarantined,
        agentSource: params.context.agentSource,
        agentModel: params.context.agentModel,
        acceptedAt: params.acceptedAt ?? (params.accepted ? new Date() : null),
        purchasedAt: params.purchasedAt ?? (params.purchased ? new Date() : null),
        finalizedAt,
        lastRewardAt: reward.total !== 0 ? new Date() : null,
      },
      update: {
        finalPrice: params.finalPrice,
        rounds: params.rounds,
        accepted: params.accepted,
        purchased: params.purchased,
        purchaseValue: params.purchaseValue,
        refundedAmount: params.refundedAmount,
        ...(params.shopifyOrderId ? { shopifyOrderId: params.shopifyOrderId } : {}),
        reward: reward.total,
        rewardConversion: reward.conversion,
        rewardMargin: reward.margin,
        rewardExperience: reward.experience,
        rewardEfficiency: reward.efficiency,
        rewardApplied: reward.total,
        quarantined: params.context.quarantined,
        ...(params.context.agentSource ? { agentSource: params.context.agentSource } : {}),
        ...(params.context.agentModel ? { agentModel: params.context.agentModel } : {}),
        ...(params.acceptedAt ? { acceptedAt: params.acceptedAt } : {}),
        ...(params.purchasedAt ? { purchasedAt: params.purchasedAt } : {}),
        ...(finalizedAt ? { finalizedAt } : {}),
        ...(reward.total !== 0 ? { lastRewardAt: new Date() } : {}),
      },
    })
  } catch (err: any) {
    console.warn('[bargain-learning] outcome write failed:', err?.message ?? err)
    return null
  }

  await applyStatsTransition({
    context: params.context,
    old,
    next: {
      accepted: params.accepted,
      purchased: params.purchased,
      finalizedAt,
      reward: reward.total,
    },
  })
  return reward
}

export async function recordLearningAcceptance(sessionId: string): Promise<void> {
  try {
    const session = await (prisma as any).bargainSession?.findUnique({
      where: { id: sessionId },
    })
    if (!session) return
    const config = await loadLearningConfig(String(session.storeId))
    const context = outcomeContextFromSession(session, config)
    if (!context) return
    const acceptedAt = new Date()
    await writeOutcome({
      context,
      finalPrice: session.finalPrice != null ? Number(session.finalPrice) : null,
      accepted: true,
      purchased: false,
      purchaseValue: null,
      refundedAmount: 0,
      rounds: Number(session.attemptsUsed) || 0,
      acceptedAt,
    })
    await recordLearningEvent({
      storeId: context.storeId,
      sessionId,
      environment: context.environment,
      eventType: 'accepted',
      strategy: context.strategy,
      version: context.version,
      contextKey: context.contextKey,
      mode: context.mode,
      originalPrice: context.originalPrice,
      floorPrice: context.floorPrice,
      value: session.finalPrice != null ? Number(session.finalPrice) : null,
      dedupeKey: `accepted:${sessionId}`,
      properties: { rounds: Number(session.attemptsUsed) || 0 },
      agentSource: context.agentSource,
      agentModel: context.agentModel,
    })
  } catch (err: any) {
    console.warn('[bargain-learning] acceptance record failed:', err?.message ?? err)
  }
}

export async function recordLearningPurchase(params: {
  sessionId: string
  shopifyOrderId: string
  purchaseValue: number
}): Promise<void> {
  if (!params.shopifyOrderId) return
  try {
    const session = await (prisma as any).bargainSession?.findUnique({
      where: { id: params.sessionId },
    })
    if (!session) return
    const config = await loadLearningConfig(String(session.storeId))
    const context = outcomeContextFromSession(session, config)
    if (!context) return
    const purchasedAt = new Date()
    await writeOutcome({
      context,
      finalPrice: session.finalPrice != null ? Number(session.finalPrice) : Number(session.originalPrice),
      accepted: true,
      purchased: true,
      purchaseValue: Math.max(0, params.purchaseValue),
      refundedAmount: 0,
      rounds: Number(session.attemptsUsed) || 0,
      shopifyOrderId: params.shopifyOrderId,
      acceptedAt: session.status === 'accepted' ? new Date() : undefined,
      purchasedAt,
      finalizedAt: purchasedAt,
    })
    await recordLearningEvent({
      storeId: context.storeId,
      sessionId: params.sessionId,
      environment: context.environment,
      eventType: 'purchased',
      strategy: context.strategy,
      version: context.version,
      contextKey: context.contextKey,
      mode: context.mode,
      originalPrice: context.originalPrice,
      floorPrice: context.floorPrice,
      value: Math.max(0, params.purchaseValue),
      dedupeKey: `purchased:${context.storeId}:${params.shopifyOrderId}`,
      properties: { orderId: params.shopifyOrderId },
      agentSource: context.agentSource,
      agentModel: context.agentModel,
    })
  } catch (err: any) {
    console.warn('[bargain-learning] purchase record failed:', err?.message ?? err)
  }
}

export async function recordLearningRefund(params: {
  storeId: string
  shopifyOrderId: string
  refundAmount: number
  fullyRefunded: boolean
  refundId?: string | null
}): Promise<void> {
  if (!params.shopifyOrderId) return
  try {
    const model = (prisma as any).bargainLearningOutcome
    if (!model?.findUnique) return
    const outcome = await model.findUnique({
      where: {
        storeId_shopifyOrderId: {
          storeId: params.storeId,
          shopifyOrderId: params.shopifyOrderId,
        },
      },
    })
    if (!outcome?.sessionId) return
    const dedupeKey = params.refundId
      ? `refund:${params.storeId}:${params.shopifyOrderId}:${params.refundId}`
      : `refund:${params.storeId}:${params.shopifyOrderId}:${params.fullyRefunded ? 'full' : 'partial'}`
    const created = await recordLearningEvent({
      storeId: params.storeId,
      sessionId: String(outcome.sessionId),
      environment: outcome.environment === 'demo' ? 'demo' : 'production',
      eventType: params.fullyRefunded ? 'refunded' : 'partially_refunded',
      strategy: String(outcome.strategy),
      version: String(outcome.strategyVersion),
      contextKey: String(outcome.contextKey),
      mode: String(outcome.mode) as LearningMode,
      originalPrice: Number(outcome.originalPrice) || 0,
      floorPrice: outcome.floorPrice != null ? Number(outcome.floorPrice) : 0,
      value: params.refundAmount,
      dedupeKey,
      agentSource: typeof outcome.agentSource === 'string' ? outcome.agentSource : null,
      agentModel: typeof outcome.agentModel === 'string' ? outcome.agentModel : null,
    })
    if (!created) return

    const session = await (prisma as any).bargainSession?.findUnique({
      where: { id: outcome.sessionId },
    })
    if (!session) return
    const config = await loadLearningConfig(params.storeId)
    const context = outcomeContextFromSession(session, config)
    if (!context) return
    const purchaseValue = Number(outcome.purchaseValue) || 0
    const nextRefunded = params.fullyRefunded
      ? purchaseValue
      : Math.max(
          Number(outcome.refundedAmount) || 0,
          (Number(outcome.refundedAmount) || 0) + Math.max(0, params.refundAmount),
        )
    const netPurchased = purchaseValue - nextRefunded > 0.009
    await writeOutcome({
      context,
      finalPrice: outcome.finalPrice != null ? Number(outcome.finalPrice) : null,
      accepted: true,
      purchased: netPurchased,
      purchaseValue: outcome.purchaseValue != null ? Number(outcome.purchaseValue) : null,
      refundedAmount: nextRefunded,
      rounds: Number(outcome.rounds) || 0,
      shopifyOrderId: params.shopifyOrderId,
      acceptedAt: outcome.acceptedAt ? new Date(outcome.acceptedAt) : undefined,
      purchasedAt: outcome.purchasedAt ? new Date(outcome.purchasedAt) : undefined,
      finalizedAt: outcome.finalizedAt ? new Date(outcome.finalizedAt) : new Date(),
    })
  } catch (err: any) {
    console.warn('[bargain-learning] refund record failed:', err?.message ?? err)
  }
}

export async function finalizeLearningOutcome(outcomeKey: string): Promise<boolean> {
  const model = (prisma as any).bargainLearningOutcome
  if (!model?.findUnique) return false
  try {
    const outcome = await model.findUnique({ where: { outcomeKey } })
    if (!outcome || outcome.finalizedAt) return false
    const session = outcome.sessionId
      ? await (prisma as any).bargainSession?.findUnique({ where: { id: outcome.sessionId } })
      : null
    if (!session) return false
    const config = await loadLearningConfig(String(outcome.storeId))
    const context = outcomeContextFromSession(session, config)
    if (!context) return false
    const finalizedAt = new Date()
    await writeOutcome({
      context,
      finalPrice: outcome.finalPrice != null ? Number(outcome.finalPrice) : null,
      accepted: true,
      purchased: false,
      purchaseValue: null,
      refundedAmount: Number(outcome.refundedAmount) || 0,
      rounds: Number(outcome.rounds) || 0,
      acceptedAt: outcome.acceptedAt ? new Date(outcome.acceptedAt) : undefined,
      finalizedAt,
    })
    await recordLearningEvent({
      storeId: context.storeId,
      sessionId: context.sessionId,
      environment: context.environment,
      eventType: 'finalized',
      strategy: context.strategy,
      version: context.version,
      contextKey: context.contextKey,
      mode: context.mode,
      originalPrice: context.originalPrice,
      floorPrice: context.floorPrice,
      dedupeKey: `finalized:${outcomeKey}`,
      agentSource: context.agentSource,
      agentModel: context.agentModel,
    })
    return true
  } catch (err: any) {
    console.warn('[bargain-learning] finalize failed:', err?.message ?? err)
    return false
  }
}

export async function finalizeStaleLearningOutcomes(params: {
  now?: Date
  limit?: number
} = {}): Promise<{ scanned: number; finalized: number }> {
  const model = (prisma as any).bargainLearningOutcome
  if (!model?.findMany) return { scanned: 0, finalized: 0 }
  const now = params.now ?? new Date()
  const limit = Math.min(1000, Math.max(1, params.limit ?? 250))
  try {
    const rows = await model.findMany({
      where: {
        accepted: true,
        purchased: false,
        finalizedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        outcomeKey: true,
        storeId: true,
        acceptedAt: true,
        createdAt: true,
      },
    })
    const configs = new Map<string, LearningConfigView | null>()
    let finalized = 0
    for (const row of Array.isArray(rows) ? rows : []) {
      const storeId = String(row.storeId)
      if (!configs.has(storeId)) configs.set(storeId, await loadLearningConfig(storeId))
      const windowDays = configs.get(storeId)?.attributionWindowDays ?? 7
      const anchor = row.acceptedAt ? new Date(row.acceptedAt) : new Date(row.createdAt)
      const cutoff = new Date(now.getTime() - Math.max(1, windowDays) * 24 * 60 * 60 * 1000)
      if (anchor <= cutoff) {
        const done = await finalizeLearningOutcome(String(row.outcomeKey))
        if (done) finalized++
      }
    }
    return { scanned: Array.isArray(rows) ? rows.length : 0, finalized }
  } catch (err: any) {
    console.warn('[bargain-learning] finalize sweep failed:', err?.message ?? err)
    return { scanned: 0, finalized: 0 }
  }
}
