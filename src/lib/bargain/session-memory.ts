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
  offTopicCount: number
  concessionCount: number
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
  prior?: SessionMemory | null
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
  const prior = input.prior ?? null
  const name = input.signals?.name ?? prior?.name ?? null
  const need = safeNeed(input.intent?.need) ?? prior?.need ?? null
  const budget = input.intent?.budget ?? prior?.budget ?? null
  const objection = input.intent?.objection ?? prior?.objection ?? null
  const emotion = input.signals?.emotion ?? prior?.emotion ?? 'neutral'
  const tone = input.signals ? toneFor(input.signals) : prior?.tone ?? 'warm'
  const offerTrend = input.customerOfferTrend ?? prior?.offerTrend ?? null
  const seriousness = input.seriousness ?? prior?.seriousness ?? null
  const offTopicCount = Math.max(0, Math.round(input.offTopicCount ?? prior?.offTopicCount ?? 0))
  const concessionCount = Math.max(0, Math.round(input.concessionCount ?? prior?.concessionCount ?? 0))
  const resolvedInput: SessionMemoryInput = {
    ...input,
    seriousness,
    customerOfferTrend: offerTrend,
    offTopicCount,
    concessionCount,
  }
  return {
    name,
    need,
    budget,
    objection,
    emotion,
    tone,
    offerTrend,
    seriousness,
    offTopicCount,
    concessionCount,
    pattern: patternFor(resolvedInput),
    nextMove: nextMoveFor(resolvedInput),
  }
}

const TONES = new Set<SessionMemory['tone']>(['brief', 'warm', 'playful', 'calm', 'detailed'])
const EMOTIONS = new Set<CustomerEmotion>(['neutral', 'playful', 'frustrated', 'hesitant', 'excited', 'skeptical', 'apologetic'])
const TRENDS = new Set<NonNullable<SessionMemory['offerTrend']>>(['new', 'rising', 'flat', 'falling'])
const SERIOUSNESS = new Set<NonNullable<SessionMemory['seriousness']>>(['serious', 'casual', 'time_waster'])

function boundedMemoryText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, max)
  return cleaned || null
}

export function readSessionMemory(value: unknown): SessionMemory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.pattern !== 'string' || typeof record.nextMove !== 'string') return null
  const tone = TONES.has(record.tone as SessionMemory['tone']) ? record.tone as SessionMemory['tone'] : 'warm'
  const emotion = EMOTIONS.has(record.emotion as CustomerEmotion) ? record.emotion as CustomerEmotion : 'neutral'
  const offerTrend = TRENDS.has(record.offerTrend as NonNullable<SessionMemory['offerTrend']>)
    ? record.offerTrend as NonNullable<SessionMemory['offerTrend']>
    : null
  const seriousness = SERIOUSNESS.has(record.seriousness as NonNullable<SessionMemory['seriousness']>)
    ? record.seriousness as NonNullable<SessionMemory['seriousness']>
    : null
  return {
    name: boundedMemoryText(record.name, 80),
    need: boundedMemoryText(record.need, 60),
    budget: typeof record.budget === 'number' && Number.isFinite(record.budget) ? record.budget : null,
    objection: boundedMemoryText(record.objection, 60),
    emotion,
    tone,
    offerTrend,
    seriousness,
    offTopicCount: typeof record.offTopicCount === 'number' && Number.isFinite(record.offTopicCount)
      ? Math.max(0, Math.round(record.offTopicCount))
      : 0,
    concessionCount: typeof record.concessionCount === 'number' && Number.isFinite(record.concessionCount)
      ? Math.max(0, Math.round(record.concessionCount))
      : 0,
    pattern: record.pattern.slice(0, 240),
    nextMove: record.nextMove.slice(0, 240),
  }
}

export function readSessionMemoryFromMessages(
  messages: Array<{ role?: unknown; metadata?: unknown }> | null | undefined,
): SessionMemory | null {
  if (!Array.isArray(messages)) return null
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (!message || message.role !== 'ai') continue
    const memory = readSessionMemory(
      message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
        ? (message.metadata as Record<string, unknown>).sessionMemory
        : null,
    )
    if (memory) return memory
  }
  return null
}

export function countSessionMemorySignals(
  messages: Array<{ role?: unknown; metadata?: unknown }> | null | undefined,
  currentLiveTurnMode?: string | null,
): { offTopicCount: number; concessionCount: number } {
  let offTopicCount = 0
  let concessionCount = 0
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!message || message.role !== 'ai') continue
      if (!message.metadata || typeof message.metadata !== 'object' || Array.isArray(message.metadata)) continue
      const metadata = message.metadata as Record<string, unknown>
      const mode = metadata.liveTurnMode
      if ((typeof mode === 'string' && RANDOM_MODES.has(mode)) || mode === 'probe' || mode === 'nonsense') offTopicCount++
      if (metadata.decision === 'counter') concessionCount++
    }
  }
  if (currentLiveTurnMode && (RANDOM_MODES.has(currentLiveTurnMode) || currentLiveTurnMode === 'probe' || currentLiveTurnMode === 'nonsense')) {
    offTopicCount++
  }
  return { offTopicCount, concessionCount }
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
