import { z } from 'zod'
import { CONVERSATION_STATES, type ConversationState } from './conversation-state'
import type { NegotiationResult } from './engine'
import { detectPressureLanguage } from './reply-safety'

export const ENGINE_DECISIONS = ['chat', 'counter', 'accept', 'reject', 'no_offer', 'escalate'] as const
export type EngineDecision = (typeof ENGINE_DECISIONS)[number]

export const ENGINE_INTENTS = [
  'UNKNOWN',
  'PRICE_ONLY',
  'VALUE_UNCLEAR',
  'BUDGET_CONSTRAINT',
  'PRODUCT_MISMATCH',
  'COMPARISON',
  'PRODUCT_QUESTION',
  'PURCHASE_READY',
  'PURCHASE_HESITATION',
  'WALKOUT',
  'GENERIC_CHAT',
  'RECOMMENDATION_REQUEST',
  'PRODUCT_DISCOVERY',
] as const
export type EngineIntent = (typeof ENGINE_INTENTS)[number]

export const ENGINE_OBJECTIONS = [
  'PRICE',
  'SHIPPING',
  'SHIPPING_DELAY',
  'QUALITY',
  'TRUST',
  'BUDGET',
  'PRODUCT_INFORMATION',
  'COMPARISON',
  'FIT_VARIANT',
  'AVAILABILITY',
  'PURCHASE_HESITATION',
  'PAYMENT_FRICTION',
  'VALUE',
] as const
export type EngineObjection = (typeof ENGINE_OBJECTIONS)[number]

export const ENGINE_REASONING_CATEGORIES = [
  'price_objection',
  'budget_objection',
  'product_information',
  'value_assessment',
  'trust_concern',
  'shipping_concern',
  'quality_concern',
  'comparison',
  'purchase_ready',
  'hesitation',
  'walkout',
  'recommendation_request',
  'human_support',
  'opt_out',
  'abuse',
  'general_chat',
  'unknown',
] as const
export type EngineReasoningCategory = (typeof ENGINE_REASONING_CATEGORIES)[number]

export const ENGINE_SAFETY_STATUSES = ['safe', 'guarded', 'unsafe'] as const
export type EngineSafetyStatus = (typeof ENGINE_SAFETY_STATUSES)[number]

export const OFFER_NONE_REASONS = ['no_offer', 'not_available', 'escalation', 'unknown'] as const

const MAX_AMOUNT = 1_000_000_000
const MAX_TEXT = 5000
const MAX_FACTS = 20
const LEAK_FALLBACK = 'I can’t share private pricing or account details. Tell me what you need and I’ll help with the price shown at checkout.'

const amountSchema = z.number().finite().positive().max(MAX_AMOUNT)
const currencySchema = z.string().trim().min(1).max(8)

export const proposedOfferSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('counter'),
      amount: amountSchema,
      currency: currencySchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('none'),
      reason: z.enum(OFFER_NONE_REASONS).optional(),
      amount: z.null().optional(),
    })
    .strict(),
])
export type ProposedOffer = z.infer<typeof proposedOfferSchema>

export const engineResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(MAX_TEXT),
    detectedIntent: z.enum(ENGINE_INTENTS),
    detectedObjection: z.union([z.enum(ENGINE_OBJECTIONS), z.null()]),
    decision: z.enum(ENGINE_DECISIONS),
    proposedOffer: proposedOfferSchema,
    internalReasoningCategory: z.enum(ENGINE_REASONING_CATEGORIES),
    productFactsUsed: z.array(z.string().trim().min(1).max(300)).max(MAX_FACTS),
    cta: z.string().trim().max(300).nullable(),
    conversationState: z.enum(CONVERSATION_STATES),
    confidence: z.number().finite().min(0).max(1),
    safetyStatus: z.enum(ENGINE_SAFETY_STATUSES),
    requiresEscalation: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'counter' && value.proposedOffer.kind !== 'counter') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proposedOffer'],
        message: 'counter decision requires a proposed offer',
      })
    }
    if (value.proposedOffer.kind === 'counter' && value.decision !== 'counter') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision'],
        message: 'a proposed offer requires a counter decision',
      })
    }
  })
export type NormalizedEngineResponse = z.infer<typeof engineResponseSchema>

export const publicEngineResponseSchema = z
  .object({
    message: z.string(),
    decision: z.enum(ENGINE_DECISIONS),
    proposedOffer: proposedOfferSchema,
    cta: z.string().nullable(),
    conversationState: z.enum(CONVERSATION_STATES),
  })
  .strict()
export type PublicEngineResponse = z.infer<typeof publicEngineResponseSchema>

export interface EngineValidationResult {
  ok: boolean
  value: NormalizedEngineResponse | null
  errors: string[]
}

const FALLBACK_RESPONSE: NormalizedEngineResponse = {
  message: LEAK_FALLBACK,
  detectedIntent: 'UNKNOWN',
  detectedObjection: null,
  decision: 'no_offer',
  proposedOffer: { kind: 'none', reason: 'not_available' },
  internalReasoningCategory: 'unknown',
  productFactsUsed: [],
  cta: null,
  conversationState: 'NEGOTIATION',
  confidence: 0,
  safetyStatus: 'unsafe',
  requiresEscalation: true,
}

const FALLBACK_PUBLIC_RESPONSE: PublicEngineResponse = {
  message: LEAK_FALLBACK,
  decision: 'no_offer',
  proposedOffer: { kind: 'none', reason: 'not_available' },
  cta: null,
  conversationState: 'NEGOTIATION',
}

const LEAK_PATTERNS: RegExp[] = [
  /\b(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|bearer|authorization|password)\b\s*[:=]?\s*[A-Za-z0-9_\-./+=]{6,}/i,
  /\bsk-[A-Za-z0-9_\-]{6,}/i,
  /\beyj[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/i,
  /\b(?:floor|minimum|base|cost|wholesale|secret|hidden|internal)\s+(?:price|margin|minimum)\b/i,
  /\b(?:my|our|the)\s+floor\b/i,
  /\bfloor\s*(?:is|=|:)\b/i,
  /\b(?:system|developer)\s+prompt\b/i,
  /\binternal\s+(?:reasoning|metadata|notes)\b/i,
  /\breasoning\s+category\s*[:=]/i,
  /\bmetadata\s*[:=]\s*[{[]/i,
  /\bconfidence\s*[:=]\s*\d/i,
  /\bsafety\s+status\s*[:=]\s*\w/i,
  /\b(?:min|max|minimum|maximum)[_\s-]?(?:price|discount)\s*[:=]\s*[₹$€£]?\s*\d/i,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function hasLeak(text: string): boolean {
  return LEAK_PATTERNS.some((pattern) => pattern.test(text))
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function sanitizeText(value: unknown, fallback: string): string {
  const raw = readString(value)
  if (!raw) return fallback
  const text = normalizeText(raw).slice(0, MAX_TEXT)
  if (!text) return fallback
  if (hasLeak(text)) {
    const parts = text.split(/(?<=[.!?])\s+/)
    const safeParts = parts.map((part) => (hasLeak(part) ? fallback : part)).filter((part) => part.trim().length > 0)
    return safeParts.join(' ').slice(0, MAX_TEXT) || fallback
  }
  return text
}

function mapDecision(value: unknown): EngineDecision {
  if (value === 'welcome') return 'chat'
  return typeof value === 'string' && (ENGINE_DECISIONS as readonly string[]).includes(value)
    ? (value as EngineDecision)
    : 'no_offer'
}

function mapIntent(value: unknown): EngineIntent {
  return typeof value === 'string' && (ENGINE_INTENTS as readonly string[]).includes(value)
    ? (value as EngineIntent)
    : 'UNKNOWN'
}

function mapObjection(value: unknown): EngineObjection | null {
  return typeof value === 'string' && (ENGINE_OBJECTIONS as readonly string[]).includes(value)
    ? (value as EngineObjection)
    : null
}

function mapReasoningCategory(value: unknown, hint: string): EngineReasoningCategory {
  if (typeof value === 'string' && (ENGINE_REASONING_CATEGORIES as readonly string[]).includes(value)) {
    return value as EngineReasoningCategory
  }
  const text = hint.toLowerCase()
  if (/human|agent|support|escalat/.test(text)) return 'human_support'
  if (/opt.?out|unsubscribe|stop/.test(text)) return 'opt_out'
  if (/abuse|jailbreak|inject/.test(text)) return 'abuse'
  if (/recommend|alternat|similar/.test(text)) return 'recommendation_request'
  if (/walkout|bye|leaving/.test(text)) return 'walkout'
  if (/hesitat|think|unsure/.test(text)) return 'hesitation'
  if (/ready|checkout|buying/.test(text)) return 'purchase_ready'
  if (/ship|deliver/.test(text)) return 'shipping_concern'
  if (/quality|durab|broken/.test(text)) return 'quality_concern'
  if (/trust|genuine|authentic/.test(text)) return 'trust_concern'
  if (/product|feature|variant|fit/.test(text)) return 'product_information'
  if (/value|worth/.test(text)) return 'value_assessment'
  if (/budget/.test(text)) return 'budget_objection'
  if (/price|discount|offer|lowball/.test(text)) return 'price_objection'
  return 'general_chat'
}

function mapConversationState(value: unknown, decision: EngineDecision): ConversationState {
  if (typeof value === 'string' && (CONVERSATION_STATES as readonly string[]).includes(value)) {
    return value as ConversationState
  }
  if (decision === 'counter') return 'COUNTER_OFFER'
  if (decision === 'accept') return 'DEAL_ACCEPTED'
  if (decision === 'reject') return 'REJECTED'
  if (decision === 'escalate') return 'HUMAN_SUPPORT_REQUIRED'
  return 'NEGOTIATION'
}

function mapOffer(decision: EngineDecision, result: Record<string, unknown>): ProposedOffer {
  if (decision !== 'counter') return { kind: 'none', reason: 'no_offer' }
  const amount = result.counterOffer
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { kind: 'none', reason: 'not_available' }
  }
  const currency = readString(result.currency)
  if (currency && /^[A-Za-z]{1,8}$/.test(currency.trim())) {
    return { kind: 'counter', amount, currency: currency.trim().toUpperCase() }
  }
  return { kind: 'counter', amount }
}

function safeFactList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const facts: string[] = []
  for (const item of value) {
    const text = typeof item === 'string' ? normalizeText(item) : ''
    if (!text || text.length > 300 || hasLeak(text)) continue
    facts.push(text)
    if (facts.length === MAX_FACTS) break
  }
  return facts
}

function defaultCta(decision: EngineDecision): string | null {
  if (decision === 'counter') return 'Tell me what price works for you.'
  if (decision === 'accept') return 'Continue to secure checkout.'
  if (decision === 'escalate') return 'A team member can help from here.'
  if (decision === 'chat') return 'Ask me anything about this product.'
  return null
}

function mapCta(metadata: Record<string, unknown>, decision: EngineDecision): string | null {
  const raw = readString(metadata.cta)
  if (!raw) return defaultCta(decision)
  const text = normalizeText(raw)
  if (!text || text.length > 300 || hasLeak(text)) return defaultCta(decision)
  return text
}

export function validateEngineResponse(raw: unknown): EngineValidationResult {
  const parsed = engineResponseSchema.safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data, errors: [] }
  return {
    ok: false,
    value: null,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.map(String).join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    }),
  }
}

export function adaptNegotiationResult(raw: NegotiationResult | unknown): NormalizedEngineResponse {
  if (!isRecord(raw)) return { ...FALLBACK_RESPONSE }
  const metadata = isRecord(raw.metadata) ? raw.metadata : {}
  const reply = readString(raw.reply) ?? ''
  const decision = mapDecision(raw.decision)
  const tactic = readString(raw.tactic) ?? ''
  const sentiment = readString(raw.sentiment) ?? ''
  const reasoningHint = `${tactic} ${sentiment}`.trim()
  const escalationFromHint = /human|agent|support|escalat/i.test(reasoningHint)
  const requiresEscalation =
    readBoolean(metadata.requiresEscalation) ?? (decision === 'escalate' || escalationFromHint)
  const message = normalizeText(reply)
  const safetyStatus: EngineSafetyStatus = hasLeak(message)
    ? 'unsafe'
    : detectPressureLanguage(message)
      ? 'guarded'
      : typeof metadata.safetyStatus === 'string' && (ENGINE_SAFETY_STATUSES as readonly string[]).includes(metadata.safetyStatus)
        ? (metadata.safetyStatus as EngineSafetyStatus)
        : 'safe'
  const candidate: NormalizedEngineResponse = {
    message,
    detectedIntent: mapIntent(metadata.detectedIntent),
    detectedObjection: mapObjection(metadata.detectedObjection),
    decision,
    proposedOffer: mapOffer(decision, raw),
    internalReasoningCategory: mapReasoningCategory(metadata.internalReasoningCategory, reasoningHint),
    productFactsUsed: safeFactList(metadata.productFactsUsed ?? metadata.productFacts),
    cta: mapCta(metadata, decision),
    conversationState: mapConversationState(metadata.conversationState, decision),
    confidence: clampConfidence(metadata.confidence),
    safetyStatus,
    requiresEscalation,
  }
  const validation = validateEngineResponse(candidate)
  return validation.ok && validation.value ? validation.value : { ...FALLBACK_RESPONSE }
}

function scrubUnsupportedPrices(text: string): string {
  return text.replace(/(?:[₹$€£]\s*\d[\d,.]*|\b\d[\d,.]*\s*(?:rupees?|bucks?|rs\.?)\b)/gi, '[price unavailable]')
}

function sanitizeOffer(raw: unknown): ProposedOffer {
  if (isRecord(raw)) {
    if (raw.kind === 'counter') {
      const amount = raw.amount
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT) {
        const currency = readString(raw.currency)
        if (currency && /^[A-Za-z]{1,8}$/.test(currency.trim())) {
          return { kind: 'counter', amount, currency: currency.trim().toUpperCase() }
        }
        return { kind: 'counter', amount }
      }
    }
    if (raw.kind === 'none') {
      const reason =
        typeof raw.reason === 'string' && (OFFER_NONE_REASONS as readonly string[]).includes(raw.reason)
          ? (raw.reason as (typeof OFFER_NONE_REASONS)[number])
          : 'unknown'
      return { kind: 'none', reason }
    }
  }
  return { kind: 'none', reason: 'unknown' }
}

export function sanitizeEngineResponseForCustomer(raw: unknown): PublicEngineResponse {
  const source = isRecord(raw) ? raw : {}
  const decision = mapDecision(source.decision)
  const offer = sanitizeOffer(source.proposedOffer)
  const ctaValue = readString(source.cta)
  const cta = ctaValue && ctaValue.length <= 300 && !hasLeak(ctaValue) ? normalizeText(ctaValue) || null : null
  const stateValue = source.conversationState
  const conversationState =
    typeof stateValue === 'string' && (CONVERSATION_STATES as readonly string[]).includes(stateValue)
      ? (stateValue as ConversationState)
      : 'NEGOTIATION'
  const sanitizedMessage = sanitizeText(source.message ?? source.reply, LEAK_FALLBACK)
  const response: PublicEngineResponse = {
    message: offer.kind === 'counter' ? sanitizedMessage : scrubUnsupportedPrices(sanitizedMessage),
    decision,
    proposedOffer: offer,
    cta,
    conversationState,
  }
  const parsed = publicEngineResponseSchema.safeParse(response)
  return parsed.success ? parsed.data : { ...FALLBACK_PUBLIC_RESPONSE }
}

export const validateEngineResult = validateEngineResponse
export const sanitizeForCustomer = sanitizeEngineResponseForCustomer
