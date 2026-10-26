import type {
  LearningConfigView,
  LearningContextInput,
  LearningGuidance,
  LearningSelection,
  LearningStrategy,
} from './types'

export const BASELINE_STRATEGY: LearningStrategy = 'BASELINE'

interface StrategyDefinition {
  id: LearningStrategy
  label: string
  instruction: string
  counterNudge: number
  requiresRecommendations?: boolean
  requiresBudgetBelowFloor?: boolean
  requiresPromo?: boolean
}

const CATALOG: Record<LearningStrategy, StrategyDefinition> = {
  BASELINE: {
    id: 'BASELINE',
    label: 'Balanced',
    instruction: '',
    counterNudge: 0,
  },
  FRIENDLY: {
    id: 'FRIENDLY',
    label: 'Friendly and warm',
    instruction:
      'Lead with warmth and light, natural humour. Mirror the shopper’s energy, use their name only if they shared it, and make the conversation feel human. Concede only after genuine engagement, never as a reflex.',
    counterNudge: 0.015,
  },
  VALUE: {
    id: 'VALUE',
    label: 'Value first',
    instruction:
      'Frame the product’s verified value before discussing price. Use only merchant-approved selling points and verified product facts. Ask one short question about how they will use the item, then connect that need to the price.',
    counterNudge: -0.01,
  },
  GRADUAL: {
    id: 'GRADUAL',
    label: 'Gradual reciprocal',
    instruction:
      'Move in small, reciprocal steps. Every concession must ask for something in return, such as a decision today or meeting you closer to the listed price. Never dump the maximum discount at once.',
    counterNudge: 0.02,
  },
  BUDGET_ALTERNATIVE: {
    id: 'BUDGET_ALTERNATIVE',
    label: 'Budget alternative',
    instruction:
      'Take the stated budget seriously. Acknowledge it without judgement, explain briefly what this item costs to make, and point to suitable verified alternatives when they are available. Never imply the item can be sold below the merchant’s authorised price.',
    counterNudge: 0.025,
    requiresRecommendations: true,
    requiresBudgetBelowFloor: true,
  },
  BUNDLE: {
    id: 'BUNDLE',
    label: 'Bundle and complement',
    instruction:
      'Look for a genuine complementary product in the verified catalog and explain how it completes the purchase. Never invent a combined price for different products; each item is negotiated and priced separately.',
    counterNudge: 0.01,
    requiresRecommendations: true,
  },
  CONCISE: {
    id: 'CONCISE',
    label: 'Concise and direct',
    instruction:
      'Be short and direct. Use one or two sentences, no small talk, and put the next step in plain language. Still be polite and never sound robotic.',
    counterNudge: 0,
  },
  FIRM: {
    id: 'FIRM',
    label: 'Respectfully firm',
    instruction:
      'Hold the price with quiet confidence. Explain the reason in one sentence, acknowledge the shopper’s position, and leave the door open without inventing urgency or repeating the same refusal.',
    counterNudge: -0.03,
  },
  PROMO: {
    id: 'PROMO',
    label: 'Approved promotion',
    instruction:
      'Mention a promotion only when the merchant has supplied approved, truthful campaign copy in this conversation. Never invent a code, deadline, percentage or claim. If no approved promotion is present, negotiate normally.',
    counterNudge: 0.02,
    requiresPromo: true,
  },
}

export function isLearningStrategy(value: unknown): value is LearningStrategy {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOG, value)
}

export function learningStrategyLabel(strategy: string): string {
  return isLearningStrategy(strategy) ? CATALOG[strategy].label : 'Balanced'
}

export function learningStrategyNudge(strategy: string): number {
  return isLearningStrategy(strategy) ? CATALOG[strategy].counterNudge : 0
}

export function eligibleLearningStrategies(
  input: LearningContextInput,
): LearningStrategy[] {
  const config = input.config ?? {}
  const allowed = new Set(
    Array.isArray(config.allowedStrategies) ? config.allowedStrategies : [],
  )
  const blocked = new Set(
    Array.isArray(config.blockedStrategies) ? config.blockedStrategies : [],
  )

  return (Object.keys(CATALOG) as LearningStrategy[]).filter((strategy) => {
    if (strategy === BASELINE_STRATEGY) return true
    if (blocked.has(strategy)) return false
    if (allowed.size > 0 && !allowed.has(strategy)) return false
    const def = CATALOG[strategy]
    if (def.requiresRecommendations && !input.recommendationsEnabled) return false
    if (
      def.requiresBudgetBelowFloor &&
      (input.budget == null || input.budget >= input.floorPrice)
    ) {
      return false
    }
    if (def.requiresPromo && config.promoStrategyEnabled !== true) return false
    return true
  })
}

export function learningPromptBlock(strategy: LearningStrategy): string {
  if (!isLearningStrategy(strategy) || strategy === BASELINE_STRATEGY) return ''
  const def = CATALOG[strategy]
  return (
    `NEGOTIATION STYLE — ${def.label.toUpperCase()} (internal): ${def.instruction} ` +
    'Treat this as a style within the existing negotiation rules, never as permission to breach the hidden system minimum. ' +
    'Never mention the style name, learning system, experiments, scores, data or any internal reasoning to the shopper.'
  )
}

export function buildLearningGuidance(selection: LearningSelection): LearningGuidance {
  const strategy = selection.appliedStrategy
  const active = selection.mode === 'active' || selection.mode === 'demo'
  return {
    strategy,
    mode: selection.mode,
    version: selection.version,
    contextKey: selection.contextKey,
    prompt: active ? learningPromptBlock(strategy) : '',
    counterNudge: active ? learningStrategyNudge(strategy) : 0,
  }
}

export function applyLearningCounterBias(params: {
  counter: number
  originalPrice: number
  safeFloor: number
  nudge: number
}): number {
  const { counter, originalPrice, safeFloor, nudge } = params
  if (!Number.isFinite(counter) || !Number.isFinite(nudge) || nudge === 0) return counter
  const gap = Math.max(0, counter - safeFloor)
  const biased = counter - gap * Math.max(-0.05, Math.min(0.05, nudge))
  return Math.round(Math.min(originalPrice, Math.max(safeFloor, biased)) * 100) / 100
}

export function learningConfigDefaults(
  overrides: Partial<LearningConfigView> = {},
): LearningConfigView {
  return {
    enabled: false,
    shadowMode: true,
    demoEnabled: true,
    version: 'v1',
    explorationRate: 0.15,
    minSamplesPerArm: 30,
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

export function suggestedLearningStrategy(
  selection: LearningSelection,
): LearningStrategy {
  return selection.shadowStrategy ?? selection.strategy
}
