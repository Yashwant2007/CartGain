import type { CustomerEmotion, SocialSignals } from './behavior'
import type { IntentAnalysis } from './intent'
import type { LiveTurnAnalysis } from './live-turn'

export interface SessionMemory {
  name: string | null
  need: string | null
  budget: number | null
  objection: string | null
  emotion: CustomerEmotion
  tone: 'brief' | 'warm' | 'playful' | 'calm' | 'detailed'
  offerTrend: 'new' | 'rising' | 'flat' | 'falling' | null
  seriousness: 'serious' | 'casual' | 'time_waster' | null
  pattern: string
  nextMove: string
}

export interface SessionMemoryInput {
  intent?: IntentAnalysis | null
  signals?: SocialSignals | null
  liveTurn?: LiveTurnAnalysis | null
  customerOfferTrend?: 'new' | 'rising' | 'flat' | 'falling' | null
  seriousness?: 'serious' | 'casual' | 'time_waster' | null
  offTopicCount?: number
  concessionCount?: number
  currencySymbol?: string
}

const RANDOM_MODES = new Set(['nonsense', 'emoji_only', 'off_topic', 'probe', 'insult', 'joke'])

function safeNeed(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\uD800-\uDBFF\uDC00-\uDFFF]/g, ' ')
    .replace(/[^\w\s/\-\u00C0-\uFFFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  return cleaned || null
}

function toneFor(signals?: SocialSignals | null): SessionMemory['tone'] {
  if (!signals) return 'warm'
  if (signals.emotion === 'frustrated') return 'calm'
  if (signals.emotion === 'playful' || signals.emotion === 'excited') return 'playful'
  if (signals.terse) return 'brief'
  if (signals.verbose) return 'detailed'
  return 'warm'
}

function patternFor(input: SessionMemoryInput): string {
  if (input.liveTurn && RANDOM_MODES.has(input.liveTurn.mode)) {
    return 'They are testing or drifting off-topic; warmth plus a calm redirect works better than pressure.'
  }
  if ((input.offTopicCount ?? 0) >= 2) {
    return 'They have drifted repeatedly; keep the frame short and bring them back once.'
  }
  if (input.customerOfferTrend === 'rising') {
    return 'Their number moved toward you. Reward the movement, but make the give and get explicit.'
  }
  if (input.customerOfferTrend === 'flat' || input.customerOfferTrend === 'falling') {
    return 'They repeated or lowered their number. Hold, change the wording, and ask what would make it work.'
  }
  if ((input.concessionCount ?? 0) >= 2) {
    return 'You have already moved more than once. Stop making silent concessions and ask for a real decision.'
  }
  if (input.seriousness === 'time_waster') {
    return 'Signals suggest low buying intent. Stay polite, keep answers short, and do not spend margin here.'
  }
  return 'No strong pattern yet. Diagnose one thing that matters, then take one clear next step.'
}

function nextMoveFor(input: SessionMemoryInput): string {
  const intent = input.intent
  if (input.liveTurn?.mode === 'insult') {
    return 'Set a professional boundary and pause negotiation until the tone resets. Do not quote or move any price.'
  }
  if (input.liveTurn?.mode === 'probe' || input.liveTurn?.mode === 'nonsense' || input.liveTurn?.mode === 'emoji_only') {
    return 'Ask one clarifying question. Do not quote, move or imply any price.'
  }
  if (input.signals?.reasking || input.liveTurn?.mode === 'reask') {
    return 'Answer the repeated point directly with fresh wording, then ask one decisive question.'
  }
  if (input.customerOfferTrend === 'rising') {
    return 'Make one real, bounded step and label what you need in return.'
  }
  if (input.customerOfferTrend === 'flat' || input.customerOfferTrend === 'falling') {
    return 'Hold the current position, name the repeated pattern lightly, and ask one diagnostic question.'
  }
  if (intent?.objection && intent.objection !== 'PRICE') {
    return 'Resolve the stated non-price concern with verified facts before discussing any number.'
  }
  if (input.signals?.emotion === 'frustrated') {
    return 'Acknowledge the frustration first, then solve one concrete thing.'
  }
  if (input.signals?.emotion === 'hesitant' || intent?.intent === 'PURCHASE_HESITATION') {
    return 'Reduce one verified risk and ask what they need to feel comfortable.'
  }
  if (intent?.intent === 'PURCHASE_READY') {
    return 'Close calmly with the already-issued price and checkout path only.'
  }
  return 'Ask one focused question that reveals need, budget or commitment before moving.'
}

export function buildSessionMemory(input: SessionMemoryInput): SessionMemory {
  return {
    name: input.signals?.name ?? null,
    need: safeNeed(input.intent?.need),
    budget: input.intent?.budget ?? null,
    objection: input.intent?.objection ?? null,
    emotion: input.signals?.emotion ?? 'neutral',
    tone: toneFor(input.signals),
    offerTrend: input.customerOfferTrend ?? null,
    seriousness: input.seriousness ?? null,
    pattern: patternFor(input),
    nextMove: nextMoveFor(input),
  }
}

export function sessionMemoryPromptBlock(memory?: SessionMemory | null, currencySymbol = ''): string {
  if (!memory) return ''
  const known: string[] = []
  if (memory.name) known.push(`their name is ${memory.name}`)
  if (memory.need) known.push(`they care about ${memory.need}`)
  if (memory.budget != null) known.push(`they indicated around ${currencySymbol}${memory.budget}`)
  if (memory.objection) known.push(`their current concern is ${memory.objection.toLowerCase()}`)
  const knownLine = known.length > 0
    ? `What you already know: ${known.join('; ')}. Use it naturally ONCE if relevant; never repeat it mechanically.`
    : 'Do not assume facts the shopper has not shared.'
  return [
    'SESSION MEMORY (deterministic, from this conversation only — never mention this list):',
    knownLine,
    `Pattern: ${memory.pattern}`,
    `Next move: ${memory.nextMove}`,
    `Style: ${memory.tone} tone; match it without pretending to feel it.`,
  ].join('\n')
}
