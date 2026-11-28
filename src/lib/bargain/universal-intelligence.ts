import type { LiveTurnAnalysis } from './live-turn'
import type { IntentAnalysis } from './intent'
import type { ProductContext } from './product-context'
import { verifiedProductFact } from './sales-pitch'
import type { Persona } from './engine'

export const UNIVERSAL_INTELLIGENCE_VERSION = 1 as const

export type UniversalIntentName =
  | 'price_signal'
  | 'price_objection'
  | 'best_price_ask'
  | 'sales_pitch'
  | 'budget'
  | 'competitor_comparison'
  | 'bundle_request'
  | 'product_question'
  | 'purchase_ready'
  | 'checkout'
  | 'hesitation'
  | 'walkout'
  | 'trust_objection'
  | 'social_reference'
  | 'question'
  | 'emotion'
  | 'language_mix'
  | 'human_support'
  | 'opt_out'
  | 'small_talk'
  | 'unknown'

export type UniversalReferenceKind =
  | 'fictional'
  | 'gaming'
  | 'sport'
  | 'meme'
  | 'study'
  | 'work'
  | 'family'
  | 'technology'
  | 'imaginative'
  | 'style'
  | 'general'

export type UniversalEmotion = 'neutral' | 'playful' | 'frustrated' | 'hesitant' | 'excited' | 'serious' | 'affectionate'
export type UniversalMode = 'commercial' | 'social_reference' | 'emotional' | 'small_talk' | 'unknown'
export type UniversalStrategy =
  | 'respect_terminal'
  | 'commercial_clarity'
  | 'trust_without_defensiveness'
  | 'de_escalate'
  | 'acknowledge_once_then_pivot'
  | 'answer_verified_or_clarify'
  | 'bundle_clarify'
  | 'checkout_next_step'
  | 'conversational_discovery'

export type UniversalProductCategory =
  | 'skincare'
  | 'fashion'
  | 'electronics'
  | 'home'
  | 'fitness'
  | 'food'
  | 'accessories'
  | 'general'

export interface UniversalIntent {
  name: UniversalIntentName
  confidence: number
  evidence: string
}

export interface UniversalReference {
  kind: UniversalReferenceKind
  label: string
  confidence: number
}

export interface UniversalMemory {
  customerTurns: number
  priorOffers: number
  lastOffer: number | null
  priorReferences: string[]
  priorQuestions: number
  lastQuestion: string | null
  returningCustomer: boolean
}

export interface UniversalConversationState {
  version: typeof UNIVERSAL_INTELLIGENCE_VERSION
  message: string
  mode: UniversalMode
  intents: UniversalIntent[]
  emotion: UniversalEmotion
  emotions: UniversalEmotion[]
  references: UniversalReference[]
  humorAllowed: boolean
  languageMix: 'english' | 'hinglish' | 'other'
  memory: UniversalMemory
  productCategory: UniversalProductCategory
  strategy: UniversalStrategy
  productFact: string | null
  unresolvedQuestion: string | null
}

export interface UniversalHistoryEntry {
  role: 'customer' | 'ai'
  content: string
  offeredPrice?: number
}

export interface UniversalIntelligenceInput {
  message: string
  intent?: IntentAnalysis | null
  liveTurn?: LiveTurnAnalysis | null
  history?: UniversalHistoryEntry[] | null
  product?: ProductContext | null
  productTitle?: string | null
  persona?: Persona | null
  language?: string | null
}

export interface UniversalReplyContext {
  product?: ProductContext | null
  productTitle?: string | null
  persona?: Persona | null
  language?: string | null
}

export interface UniversalDeterministicReply {
  reply: string
  decision: 'chat'
  tactic: string
  sentiment: 'neutral' | 'warm' | 'playful' | 'firm'
  metadata: Record<string, unknown>
}

const REFERENCE_PATTERNS: { kind: UniversalReferenceKind; label: string; re: RegExp }[] = [
  { kind: 'fictional', label: 'Batman', re: /\bbatman|dark\s+knight|gotham\b/i },
  { kind: 'fictional', label: 'Superman', re: /\bsuperman|man\s+of\s+steel|kryptonite\b/i },
  { kind: 'fictional', label: 'Marvel', re: /\bmarvel|avenger|iron\s+man|spider[\s-]?man|thor\b/i },
  { kind: 'fictional', label: 'anime', re: /\banime|naruto|goku|one\s+piece|studio\s+ghibli\b/i },
  { kind: 'gaming', label: 'GTA', re: /\bgta(?:\s*[456])?|grand\s+theft\s+auto\b/i },
  { kind: 'gaming', label: 'gaming', re: /\bgaming|gameplay|pubg|valorant|minecraft|fortnite|playstation|xbox\b/i },
  { kind: 'sport', label: 'cricket', re: /\bipl|cricket|wicket|sixer|virat|rohit|world\s+cup\b/i },
  { kind: 'sport', label: 'football', re: /\bfootball|nfl|fifa|goal\b/i },
  { kind: 'meme', label: 'meme culture', re: /\bmeme|viral|reel|main\s+character|sigma|rizz|jugaad|slay\b/i },
  { kind: 'study', label: 'student life', re: /\bstudent|exam|college|assignment|semester|marks\b/i },
  { kind: 'work', label: 'work life', re: /\bsalary|office|boss|meeting|freelance|startup|business\b/i },
  { kind: 'general', label: 'sensitive topic', re: /\bbjp|congress|modi|bhagwan|mandir|masjid|church|deity|politics|political|religious\b/i },
  { kind: 'family', label: 'family', re: /\bfamily|friend|relationship|mom|dad|brother|sister|bhai\b/i },
  { kind: 'technology', label: 'tech', re: /\biphone|android|windows|laptop|programming|developer|\bai\b|gadget\b/i },
  { kind: 'style', label: 'style', re: /\bdrip|swag|outfit|fashion|classy|royal\b/i },
  { kind: 'imaginative', label: 'an unusual idea', re: /\balien|ghost|time\s+travel|superpower|multiverse|fantasy\b/i },
]

const EMOTION_PATTERNS: { emotion: UniversalEmotion; re: RegExp }[] = [
  { emotion: 'frustrated', re: /\bfrustrat|annoy|fed\s+up|taking\s+too\s+long|so\s+slow|ridiculous|not\s+again|you\s+people\b/i },
  { emotion: 'hesitant', re: /\bnot\s+sure|maybe|worried|confus|hesitant|think\s+about\s+it|doubt\b/i },
  { emotion: 'serious', re: /\btrust|genuine|fake|warranty|return\s+policy|quality|safe|sensitive|legit|certified\b/i },
  { emotion: 'playful', re: /\bhaha|hehe|lol|lmao|joke|kidding|sarcas|sure,?\s+because|unlimited\s+money|yeah\s+right|\b😅\b|\b😂\b|\b🤣\b|\b😎\b/i },
  { emotion: 'excited', re: /\bexcited|love\s+it|awesome|amazing|can'?t\s+wait\b/i },
  { emotion: 'affectionate', re: /\bfor\s+my|gift|birthday|friend|family|mom|dad|brother|sister\b/i },
]

const CATEGORY_PATTERNS: { category: UniversalProductCategory; re: RegExp }[] = [
  { category: 'skincare', re: /\bserum|skincare|cream|moistur|sunscreen|face\s+wash|ingredient|skin\b/i },
  { category: 'fashion', re: /\bshirt|dress|sneaker|shoe|jacket|fashion|fabric|size|colour|color\b/i },
  { category: 'electronics', re: /\bphone|laptop|headphone|charger|camera|speaker|battery|usb|smartwatch\b/i },
  { category: 'home', re: /\bsofa|chair|lamp|kitchen|home|furniture|decor|mattress\b/i },
  { category: 'fitness', re: /\bgym|fitness|protein|yoga|dumbbell|supplement|workout\b/i },
  { category: 'food', re: /\bfood|snack|coffee|tea|spice|grocery|eat\b/i },
  { category: 'accessories', re: /\bbag|watch|wallet|belt|jewel|sunglass\b/i },
]

const COMPETITOR_RE = /\b(?:amazon|flipkart|myntra|meesho|walmart|competitor|another\s+(?:brand|store|shop)|other\s+(?:brand|store|shop)|cheaper\s+elsewhere|saw\s+it\s+for|brand\s+x)\b/i
const PRICE_REQUEST_RE = /\b(?:price\s+(?:thoda|kam|kam\s+kar)|thoda\s+(?:kam|sasta)|kam\s+(?:price|rate)|lower\s+(?:the\s+)?price|better\s+price|discount|do\s+better|any\s+better)\b/i
const BUNDLE_RE = /\b(?:bundle|combo|two\s+items?|multiple\s+items?|cart|together|add\s+another|pair\s+it)\b/i
const CHECKOUT_RE = /\b(?:checkout|order|pay|payment|buy\s+now|how\s+do\s+i\s+(?:pay|order))\b/i
const HINGLISH_RE = /\b(?:bhai|bro|yaar|thoda|kya|kaise|kyun|kyon|chahiye|dikhao|batao|sasta|price|priced|jugaad|nahi|kar\s+do|laga\s+do)\b|[\u0900-\u097F]/i

function clean(value: unknown, max = 160): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed
}

function uniqueIntents(intents: UniversalIntent[]): UniversalIntent[] {
  const byName = new Map<UniversalIntentName, UniversalIntent>()
  for (const intent of intents) {
    const current = byName.get(intent.name)
    if (!current || current.confidence < intent.confidence) byName.set(intent.name, intent)
  }
  return Array.from(byName.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 8)
}

function detectReferences(message: string): UniversalReference[] {
  const found: UniversalReference[] = []
  for (const pattern of REFERENCE_PATTERNS) {
    if (!pattern.re.test(message)) continue
    found.push({ kind: pattern.kind, label: pattern.label, confidence: 0.78 })
    if (found.length >= 3) break
  }
  return found
}

function detectEmotions(message: string, liveTurn?: LiveTurnAnalysis | null): UniversalEmotion[] {
  const found: UniversalEmotion[] = []
  if (liveTurn?.mode === 'frustrated' || liveTurn?.mode === 'insult') found.push('frustrated')
  if (liveTurn?.mode === 'hesitation') found.push('hesitant')
  if (liveTurn?.mode === 'playful' || liveTurn?.mode === 'joke') found.push('playful')
  if (liveTurn?.mode === 'flattery') found.push('excited')
  for (const pattern of EMOTION_PATTERNS) {
    if (pattern.re.test(message) && !found.includes(pattern.emotion)) found.push(pattern.emotion)
  }
  return found.length > 0 ? found : ['neutral']
}

function detectProductCategory(product?: ProductContext | null, productTitle?: string | null): UniversalProductCategory {
  if (!product || product.fetchFailed) return 'general'
  const tags = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === 'string'
      ? [product.tags]
      : []
  const haystack = [product.title, product.productType, ...tags, product.description, productTitle ?? '']
    .filter(Boolean)
    .join(' ')
  for (const pattern of CATEGORY_PATTERNS) {
    if (pattern.re.test(haystack)) return pattern.category
  }
  return 'general'
}

function buildMemory(history: UniversalHistoryEntry[] | null | undefined): UniversalMemory {
  const entries = Array.isArray(history) ? history : []
  const customer = entries.filter((entry) => entry.role === 'customer')
  const offers = customer
    .map((entry) => entry.offeredPrice)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const references = customer.flatMap((entry) => detectReferences(entry.content).map((reference) => reference.label))
  const questions = customer
    .map((entry) => entry.content)
    .filter((content) => content.includes('?'))
  return {
    customerTurns: customer.length,
    priorOffers: offers.length,
    lastOffer: offers.length > 0 ? offers[offers.length - 1] : null,
    priorReferences: Array.from(new Set(references)).slice(-6),
    priorQuestions: questions.length,
    lastQuestion: questions.length > 0 ? clean(questions[questions.length - 1], 140) : null,
    returningCustomer: customer.length > 0,
  }
}

function deriveMode(intents: UniversalIntent[], emotion: UniversalEmotion, references: UniversalReference[]): UniversalMode {
  if (intents.some((intent) => intent.name === 'human_support' || intent.name === 'opt_out')) return 'commercial'
  if (intents.some((intent) =>
    intent.name === 'price_signal' || intent.name === 'price_objection' || intent.name === 'best_price_ask'
    || intent.name === 'sales_pitch' || intent.name === 'budget' || intent.name === 'competitor_comparison'
    || intent.name === 'bundle_request' || intent.name === 'product_question' || intent.name === 'purchase_ready'
    || intent.name === 'checkout' || intent.name === 'hesitation' || intent.name === 'walkout'
    || intent.name === 'trust_objection',
  )) return 'commercial'
  if (emotion === 'frustrated' || emotion === 'hesitant' || emotion === 'affectionate' || emotion === 'excited') return 'emotional'
  if (references.length > 0 || intents.some((intent) => intent.name === 'social_reference' || intent.name === 'emotion')) return 'social_reference'
  if (intents.some((intent) => intent.name === 'small_talk')) return 'small_talk'
  return 'unknown'
}

function deriveStrategy(state: Omit<UniversalConversationState, 'strategy'>): UniversalStrategy {
  const names = new Set(state.intents.map((intent) => intent.name))
  if (names.has('human_support') || names.has('opt_out')) return 'respect_terminal'
  if (names.has('trust_objection')) return 'trust_without_defensiveness'
  if (state.emotion === 'frustrated') return 'de_escalate'
  if (names.has('bundle_request')) return 'bundle_clarify'
  if (names.has('checkout') || names.has('purchase_ready')) return 'checkout_next_step'
  if (names.has('product_question')) return 'answer_verified_or_clarify'
  if (names.has('price_signal') || names.has('price_objection') || names.has('best_price_ask') || names.has('sales_pitch') || names.has('competitor_comparison')) return 'commercial_clarity'
  if (state.references.length > 0) return 'acknowledge_once_then_pivot'
  if (state.emotion !== 'neutral' || names.has('emotion')) return 'conversational_discovery'
  return 'conversational_discovery'
}

function humorIsAllowed(
  emotions: UniversalEmotion[],
  liveTurn: LiveTurnAnalysis | null | undefined,
  persona: Persona | null | undefined,
  intents: UniversalIntent[],
): boolean {
  if (persona === 'strict_negotiator') return false
  if (liveTurn && liveTurn.humorAllowed === false) return false
  if (emotions.some((emotion) => emotion === 'frustrated' || emotion === 'serious')) return false
  if (intents.some((intent) => intent.name === 'human_support' || intent.name === 'opt_out' || intent.name === 'trust_objection')) return false
  return emotions.includes('playful') || persona === 'playful_friend'
}

export function buildUniversalConversationState(input: UniversalIntelligenceInput): UniversalConversationState {
  const message = clean(input.message, 1000) ?? ''
  const intent = input.intent ?? null
  const liveTurn = input.liveTurn ?? null
  const references = detectReferences(message)
  const emotions = detectEmotions(message, liveTurn)
  const emotion = emotions[0] ?? 'neutral'
  const intents: UniversalIntent[] = []

  if (intent?.optOutRequested) intents.push({ name: 'opt_out', confidence: 1, evidence: 'explicit opt-out request' })
  if (intent?.needHumanSupport) intents.push({ name: 'human_support', confidence: 1, evidence: 'explicit human support request' })
  if (intent?.offersPriceSignal || PRICE_REQUEST_RE.test(message)) {
    intents.push({ name: 'price_signal', confidence: intent?.offersPriceSignal ? 0.95 : 0.8, evidence: 'validated price signal or localized price request' })
  }
  if (intent?.priceComplaint) intents.push({ name: 'price_objection', confidence: 0.88, evidence: 'complaint-aware price objection' })
  if (intent?.asksBestPrice) intents.push({ name: 'best_price_ask', confidence: 0.9, evidence: 'best-price request' })
  if (intent?.salesPitchRequest) intents.push({ name: 'sales_pitch', confidence: 0.94, evidence: 'explicit value pitch request' })
  if (intent?.budget != null) intents.push({ name: 'budget', confidence: 0.85, evidence: 'parsed budget amount' })
  if (intent?.intent === 'PRODUCT_QUESTION') {
    intents.push({ name: 'product_question', confidence: 0.88, evidence: 'product question classifier' })
  }
  if (intent?.intent === 'PURCHASE_READY') intents.push({ name: 'purchase_ready', confidence: 0.9, evidence: 'purchase-ready classifier' })
  if (intent?.intent === 'PURCHASE_HESITATION') intents.push({ name: 'hesitation', confidence: 0.86, evidence: 'hesitation classifier' })
  if (intent?.intent === 'WALKOUT') intents.push({ name: 'walkout', confidence: 0.92, evidence: 'walkout classifier' })
  if (intent?.objection === 'TRUST') intents.push({ name: 'trust_objection', confidence: 0.87, evidence: 'trust objection classifier' })
  if (COMPETITOR_RE.test(message)) intents.push({ name: 'competitor_comparison', confidence: 0.8, evidence: 'competitor or external-price claim' })
  if (BUNDLE_RE.test(message)) intents.push({ name: 'bundle_request', confidence: 0.75, evidence: 'multi-item or bundle language' })
  if (CHECKOUT_RE.test(message)) intents.push({ name: 'checkout', confidence: 0.78, evidence: 'checkout or payment language' })
  if (references.length > 0) intents.push({ name: 'social_reference', confidence: references[0].confidence, evidence: `${references[0].label} reference` })
  if (message.includes('?')) intents.push({ name: 'question', confidence: 0.7, evidence: 'question mark' })
  if (emotion !== 'neutral' && emotion !== 'serious') intents.push({ name: 'emotion', confidence: 0.7, evidence: `${emotion} tone` })
  if (HINGLISH_RE.test(message)) intents.push({ name: 'language_mix', confidence: 0.78, evidence: 'Hinglish or Devanagari language mix' })
  if (liveTurn?.mode === 'greeting' || liveTurn?.mode === 'small_talk' || liveTurn?.mode === 'emoji_only') {
    intents.push({ name: 'small_talk', confidence: 0.82, evidence: `live-turn mode ${liveTurn.mode}` })
  }
  if (intents.length === 0) intents.push({ name: 'unknown', confidence: 0.5, evidence: 'no deterministic intent matched' })

  const normalizedIntents = uniqueIntents(intents)
  const base = {
    version: UNIVERSAL_INTELLIGENCE_VERSION,
    message,
    mode: deriveMode(normalizedIntents, emotion, references),
    intents: normalizedIntents,
    emotion,
    emotions,
    references,
    humorAllowed: humorIsAllowed(emotions, liveTurn, input.persona, normalizedIntents),
    languageMix: (HINGLISH_RE.test(message) ? 'hinglish' : 'english') as 'english' | 'hinglish',
    memory: buildMemory(input.history),
    productCategory: detectProductCategory(input.product, input.productTitle),
    productFact: verifiedProductFact({
      product: input.product ?? undefined,
      productTitle: input.productTitle ?? undefined,
    }),
    unresolvedQuestion: message.includes('?') ? clean(message, 140) : null,
  }
  return { ...base, strategy: deriveStrategy(base) }
}

export function canHandleDeterministically(state: UniversalConversationState): boolean {
  const names = new Set(state.intents.map((intent) => intent.name))
  if (names.has('human_support') || names.has('opt_out')) return false
  if (names.has('price_signal') || names.has('best_price_ask') || names.has('sales_pitch') || names.has('budget')) return false
  if (names.has('product_question') && state.references.length === 0 && state.productCategory === 'general') return false
  if (state.mode === 'small_talk' && state.references.length === 0 && state.emotion === 'neutral') return false
  return state.mode === 'social_reference' || state.mode === 'emotional' || state.mode === 'small_talk'
}

function personaClose(persona: Persona | null | undefined): string {
  if (persona === 'strict_negotiator') return 'Tell me what you need and I will keep it direct.'
  if (persona === 'playful_friend') return 'Want the short version, or should we make this a plot twist?'
  return 'Want the short version, or should we talk about what matters to you?'
}

function referenceLine(state: UniversalConversationState, persona: Persona | null | undefined): string | null {
  const reference = state.references[0]
  if (!reference) return null
  const repeated = state.memory.priorReferences.some((label) => label.toLowerCase() === reference.label.toLowerCase())
  if (reference.label === 'sensitive topic') {
    return persona === 'friendly_shopkeeper' || persona === 'playful_friend'
      ? 'Samajh gaya, main neutral rehta hoon — let’s keep this about the item and your offer.'
      : 'Noted. I stay neutral on political and devotional topics — let’s keep this about the item.'
  }
  if (persona === 'strict_negotiator') {
    return repeated ? `${reference.label} again, noted. Let's stay on this item.` : `${reference.label}, noted. Let's stay on this item.`
  }
  const emoji = state.humorAllowed ? ' 😄' : ''
  if (repeated) return `${reference.label} is back again${emoji} — I'll keep it to one callback.`
  if (reference.label === 'Batman') return `Batman entry noted${emoji} — I'll keep this a deal, not an origin story.`
  if (reference.label === 'Superman') return `Superman reference noted${emoji} — no cape required for a clear answer.`
  if (reference.label === 'GTA') return `GTA reference noted${emoji} — the only number I'll invent is zero fake promises.`
  if (reference.kind === 'meme') return `Meme mode noted${emoji} — I'll skip the dated joke and keep this useful.`
  return `${reference.label} noted${emoji} — I'll use it as a bridge, not as a claim.`
}

function verifiedLine(state: UniversalConversationState): string {
  if (state.productFact) return `For ${state.productCategory === 'general' ? 'this item' : `this ${state.productCategory} item`}, the verified detail I have is: ${state.productFact}.`
  return "I won't invent details about this item, but I can keep the answer honest and short."
}

export function composeUniversalDeterministicReply(
  state: UniversalConversationState,
  ctx: UniversalReplyContext = {},
): UniversalDeterministicReply | null {
  if (!canHandleDeterministically(state)) return null
  const persona = ctx.persona ?? null
  const names = new Set(state.intents.map((intent) => intent.name))
  const pieces: string[] = []
  const reference = referenceLine(state, persona)

  if (names.has('human_support') || names.has('opt_out')) return null
  if (names.has('price_signal') || names.has('best_price_ask') || names.has('sales_pitch') || names.has('budget')) return null

  if (state.emotion === 'frustrated') {
    pieces.push("I hear you — this shouldn't feel like a runaround. I'll keep it clear and quick.")
  } else if (names.has('trust_objection')) {
    pieces.push("That's a fair question. I can only stand behind verified store details, not a promise I can't prove.")
  } else if (reference) {
    pieces.push(reference)
  } else if (state.emotion === 'affectionate') {
    pieces.push('Nice — I can help you judge it for the person you have in mind.')
  } else if (state.emotion === 'excited') {
    pieces.push('Love the energy 😄 — let me keep it useful and honest.')
  } else if (state.emotion === 'playful') {
    pieces.push(state.humorAllowed ? "Fair — I won't pretend money grows on trees 😄" : "Fair — I won't pretend money grows on trees.")
  } else if (state.emotion === 'hesitant') {
    pieces.push('No rush — a clear answer is better than a pushy one.')
  } else if (state.mode === 'small_talk') {
    pieces.push('Hey — here when you need me.')
  } else {
    pieces.push('Fun one — I can play along without pretending I know more than I do.')
  }

  if (names.has('competitor_comparison')) pieces.push("I can't verify another store's claim from here.")
  if (names.has('bundle_request')) pieces.push('If you want more than one item, I can check them together before quoting anything.')
  if (names.has('checkout') || names.has('purchase_ready')) pieces.push('The checkout step will confirm the final amount before you pay.')
  if (names.has('product_question') || names.has('competitor_comparison') || names.has('bundle_request') || state.references.length > 0) {
    pieces.push(verifiedLine(state))
  }

  const reply = `${pieces.join(' ')} ${personaClose(persona)}`.replace(/\s+/g, ' ').trim()
  return {
    reply,
    decision: 'chat',
    tactic: 'universal_conversation',
    sentiment: persona === 'strict_negotiator' ? 'firm' : state.emotion === 'frustrated' ? 'neutral' : persona === 'playful_friend' ? 'playful' : 'warm',
    metadata: {
      aiSource: 'reflex',
      universalIntelligence: true,
      universalVersion: UNIVERSAL_INTELLIGENCE_VERSION,
      mode: state.mode,
      emotion: state.emotion,
      references: state.references.map((entry) => entry.label),
      strategy: state.strategy,
    },
  }
}

export function universalPromptBlock(state: UniversalConversationState): string {
  const intents = state.intents
    .slice(0, 5)
    .map((intent) => `${intent.name}(${intent.confidence.toFixed(2)}:${intent.evidence})`)
    .join('; ')
  const references = state.references.map((entry) => `${entry.label}/${entry.kind}`).join(', ') || 'none'
  const memory = [
    `customerTurns=${state.memory.customerTurns}`,
    `priorOffers=${state.memory.priorOffers}`,
    state.memory.lastOffer != null ? `lastOffer=${state.memory.lastOffer}` : null,
    `priorReferences=${state.memory.priorReferences.join(',') || 'none'}`,
    `priorQuestions=${state.memory.priorQuestions}`,
    state.memory.lastQuestion ? `lastQuestion=${state.memory.lastQuestion}` : null,
  ]
    .filter(Boolean)
    .join('; ')
  return [
    'UNIVERSAL CONVERSATION INTELLIGENCE (server-derived; internal only):',
    `mode=${state.mode}; strategy=${state.strategy}; emotion=${state.emotion}; emotions=${state.emotions.join(',')}; humour=${state.humorAllowed ? 'allowed' : 'off'}; language=${state.languageMix}; category=${state.productCategory}.`,
    `intents=${intents || 'unknown'}.`,
    `references=${references}. Treat references as the shopper's words, never as evidence of a current trend, popularity, review or shared belief.`,
    `memory=${memory}. Use it to avoid repeating lines and to acknowledge what the shopper actually said earlier.`,
    state.productFact ? `verifiedProductFact=${state.productFact}. Use only verified facts; do not add claims.` : 'No verified product fact is available; say so instead of inventing one.',
    state.unresolvedQuestion ? `unresolvedQuestion=${state.unresolvedQuestion}.` : '',
    'Handle any topic naturally: a joke, film, sport, game, meme, study, work, family or strange idea can be acknowledged once in the shopper register, then used as a bridge. Do not assume every message asks for a discount.',
    'If meaning is unclear, ask one short clarifying question. If the shopper is frustrated, serious, distrustful or asking for support, drop jokes and answer plainly.',
  ]
    .filter(Boolean)
    .join(' ')
}
