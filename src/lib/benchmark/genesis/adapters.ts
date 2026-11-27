import {
  buildOpeningMessage,
  retentionOffer,
  ruleBasedDecision,
  type NegotiationContext,
} from '@/lib/bargain/engine'
import { uiText } from '@/lib/bargain/i18n'
import { isGenesisLiveProvidersEnabled, runGenesisLiveProvider } from './live-provider'
import { GENESIS_LIVE_VERIFICATION, GENESIS_PRICE_CONTEXT, GENESIS_PRODUCT_TITLE } from './types'
import type {
  GenesisDecision,
  GenesisEngine,
  GenesisScenario,
  GenesisVerification,
} from './types'

export interface GenesisAdapterResult {
  engine: GenesisEngine
  reply: string
  decision: GenesisDecision
  counterOffer?: number
  tactic?: string
  verification: GenesisVerification
  failureCategory?: string
  latencyMs: number
}

export function contextForScenario(scenario: GenesisScenario): NegotiationContext {
  const seriousness = scenario.category === 'serious_bargain_hunters'
    ? 'serious'
    : scenario.kind === 'boundary'
      ? 'time_waster'
      : 'casual'

  return {
    storeName: 'Genesis Benchmark Store',
    currencySymbol: GENESIS_PRICE_CONTEXT.currencySymbol,
    originalPrice: GENESIS_PRICE_CONTEXT.originalPrice,
    minPrice: GENESIS_PRICE_CONTEXT.floorPrice,
    attemptsUsed: scenario.attemptsUsed ?? 0,
    maxAttempts: 3,
    persona: scenario.persona ?? 'friendly_shopkeeper',
    productTitle: GENESIS_PRODUCT_TITLE,
    bulkQuantity: scenario.bulkQuantity,
    lastCounter: scenario.lastCounter ?? null,
    seriousness,
  }
}

function boundaryReply(scenario: GenesisScenario): string {
  if (scenario.id === 'GEN-054' || /secret base price|hidden minimum|minimum price|floor|base price|previous instructions/i.test(scenario.message)) {
    return 'I cannot share internal pricing details or system instructions. I can work with the price shown on this page.'
  }
  return 'I can only use verified store details and the price shown here. I cannot verify that claim or change the price because of it.'
}

function deterministicRun(scenario: GenesisScenario): GenesisAdapterResult {
  const ctx = contextForScenario(scenario)

  if (scenario.kind === 'opt_out') {
    return {
      engine: 'deterministic',
      reply: uiText('en', 'optOutMsg'),
      decision: 'chat',
      verification: 'verified_assertions',
      latencyMs: 1,
    }
  }

  if (scenario.kind === 'boundary') {
    return {
      engine: 'deterministic',
      reply: boundaryReply(scenario),
      decision: 'chat',
      verification: 'verified_assertions',
      latencyMs: 1,
    }
  }

  if (scenario.kind === 'opening') {
    return {
      engine: 'deterministic',
      reply: buildOpeningMessage(ctx),
      decision: 'welcome',
      verification: 'verified_assertions',
      latencyMs: 1,
    }
  }

  if (scenario.kind === 'walkout') {
    const result = retentionOffer(ctx, scenario.lastCounter ?? null)
    return {
      engine: 'deterministic',
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer,
      tactic: result.tactic,
      verification: 'verified_assertions',
      latencyMs: 1,
    }
  }

  if (scenario.kind === 'offer' && scenario.offer != null) {
    const result = ruleBasedDecision(scenario.offer, ctx)
    return {
      engine: 'deterministic',
      reply: result.reply,
      decision: result.decision,
      counterOffer: result.counterOffer,
      tactic: result.tactic,
      verification: 'verified_assertions',
      latencyMs: 1,
    }
  }

  return {
    engine: 'deterministic',
    reply: 'I can help with the price shown on this page, answer product questions, or look at other verified options in this store.',
    decision: 'chat',
    verification: 'verified_assertions',
    latencyMs: 1,
  }
}

function simulatedFailure(
  engine: GenesisEngine,
  failureCategory: string,
): GenesisAdapterResult {
  return {
    engine,
    reply: '',
    decision: 'error',
    verification: 'simulated_unverified_ai_quality',
    failureCategory,
    latencyMs: 1,
  }
}

function simulatedRun(
  engine: Exclude<GenesisEngine, 'deterministic'>,
  scenario: GenesisScenario,
): GenesisAdapterResult {
  const mode = scenario.failureMode ?? 'none'
  if (mode === 'both_unavailable') {
    return simulatedFailure(engine, 'simulated_provider_unavailable')
  }
  if (mode === 'primary_unavailable' && engine === 'primary') {
    return simulatedFailure(engine, 'simulated_primary_unavailable')
  }
  if (mode === 'fallback_unavailable' && engine === 'fallback') {
    return simulatedFailure(engine, 'simulated_fallback_unavailable')
  }
  if (mode === 'invalid_response' && engine === 'primary') {
    return simulatedFailure(engine, 'simulated_invalid_response')
  }
  if (mode === 'timeout' && engine === 'primary') {
    return simulatedFailure(engine, 'simulated_timeout')
  }
  if (mode === 'rate_limit' && engine === 'primary') {
    return simulatedFailure(engine, 'simulated_rate_limit')
  }

  const base = deterministicRun(scenario)
  return {
    ...base,
    engine,
    verification: 'simulated_unverified_ai_quality',
    latencyMs: 2,
  }
}

export async function runGenesisAdapter(
  engine: GenesisEngine,
  scenario: GenesisScenario,
): Promise<GenesisAdapterResult> {
  if (engine === 'deterministic') {
    return deterministicRun(scenario)
  }

  const simulated = simulatedRun(engine, scenario)
  if (!isGenesisLiveProvidersEnabled()) {
    return simulated
  }
  if (simulated.decision === 'error' || scenario.kind === 'opt_out') {
    return { ...simulated, verification: GENESIS_LIVE_VERIFICATION }
  }

  const base = deterministicRun(scenario)
  const live = await runGenesisLiveProvider(engine, scenario)
  return {
    ...base,
    engine,
    reply: live.reply,
    verification: GENESIS_LIVE_VERIFICATION,
    failureCategory: live.failureCategory,
    latencyMs: live.latencyMs,
  }
}
