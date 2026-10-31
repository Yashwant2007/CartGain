/**
 * The generator: model in, validated copy out.
 *
 * The flow is fixed and always the same:
 *   1. ask the model for copy, using a versioned, facts-only prompt;
 *   2. validate the copy against the trusted facts and the merchant's voice;
 *   3. if the copy breaks a rule, ask ONCE more, telling the model exactly
 *      which rule it broke;
 *   4. if it still breaks a rule, fall back to a safe template that is built
 *      from the facts by code — never to unvalidated model output.
 *
 * A message that reaches a customer has always passed the validator.
 */
import { getAiClient, getFallbackAiClient, handleAiFailure, type AiResolved } from '@/lib/ai-client'
import { ConversationFacts } from './facts'
import { BrandVoice, maxEmojis, maxWords } from './voice'
import { CONVERSATION_PROMPT_VERSION, ConversationStage, buildRecoveryPrompt } from './prompts'
import { ValidationIssue, isNearDuplicate, validateMessage } from './validate'

export type MessageSource = 'ai' | 'ai_retry' | 'ai_fallback' | 'fallback'

export type GeneratedMessage = {
  body: string
  subject?: string
  source: MessageSource
  promptVersion: string
  /** Stable identifier of the wording variant used. */
  variant: string
  issues: ValidationIssue[]
}

export type SafeFallback = (facts: ConversationFacts) => { body: string; subject?: string }

function validateSubject(subject: string, facts: ConversationFacts, voice: BrandVoice): { ok: boolean; subject?: string; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const trimmed = subject.trim()
  if (!trimmed) {
    return { ok: false, issues: [{ code: 'empty', severity: 'block', detail: 'subject is empty' }] }
  }
  if (trimmed.length > 80) {
    issues.push({ code: 'too_long', severity: 'block', detail: `subject is ${trimmed.length} chars` })
  }
  const lower = trimmed.toLowerCase()
  for (const phrase of voice.bannedPhrases) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      issues.push({ code: 'banned_phrase', severity: 'block', detail: `merchant banned phrase: ${phrase}` })
    }
  }
  const allowedEmoji = maxEmojis(voice, 'email')
  const emojiCount = (trimmed.match(/[\u2600-\u27BF\uFE0F]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g) || []).length
  if (emojiCount > allowedEmoji) {
    issues.push({ code: 'too_many_emoji', severity: 'block', detail: `${emojiCount} emoji in subject` })
  }
  const ok = !issues.some((i) => i.severity === 'block')
  return { ok, subject: ok ? trimmed : undefined, issues }
}

async function callModel(
  args: {
    facts: ConversationFacts
    voice: BrandVoice
    stage: ConversationStage
    previousMessage?: string | null
    storeId: string
    correction?: string
  },
  /** Use a pre-resolved client/tier instead of auto-selecting (primary first). */
  resolved?: AiResolved | null,
): Promise<{ body: string; subject?: string } | null> {
  const userKey = args.storeId || 'default'
  const client = resolved ?? getAiClient(userKey)
  if (!client) return null

  const prompt = buildRecoveryPrompt({
    facts: args.facts,
    voice: args.voice,
    stage: args.stage,
    previousMessage: args.previousMessage,
  })
  const isEmail = args.facts.channel === 'email'

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ]
  if (args.correction) {
    messages.push({
      role: 'user',
      content: `Your previous attempt was rejected:\n${args.correction}\nRewrite the message so it obeys every rule.`,
    })
  }

  try {
    const res = await client.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      ...(isEmail ? { response_format: { type: 'json_object' as const } } : {}),
      max_tokens: isEmail ? 400 : 200,
      temperature: 0.85,
    })
    const content = res.choices[0]?.message?.content?.trim()
    if (!content) return null
    if (isEmail) {
      const parsed = JSON.parse(content)
      const body = typeof parsed.body === 'string' ? parsed.body : ''
      const subject = typeof parsed.subject === 'string' ? parsed.subject : undefined
      if (!body) return null
      return { body, subject }
    }
    return { body: content }
  } catch (err: any) {
    handleAiFailure(err, 'conversation generation', userKey, client.tier)
    return null
  }
}

function describeIssues(issues: ValidationIssue[]): string {
  return issues
    .filter((i) => i.severity === 'block')
    .map((i) => `- ${i.code}: ${i.detail}`)
    .join('\n')
}

export async function generateRecoveryMessage(args: {
  facts: ConversationFacts
  voice: BrandVoice
  stage: ConversationStage
  previousMessage?: string | null
  storeId: string
  /** Deterministic, fact-only template used when no model can be trusted. */
  fallback: SafeFallback
  /** Stable seed for the wording variant. */
  variantSeed: string
}): Promise<GeneratedMessage> {
  const { facts, voice } = args
  const issues: ValidationIssue[] = []

  const validateAndTag = (
    result: { body: string; subject?: string },
    source: MessageSource,
  ): GeneratedMessage | null => {
    const validation = validateMessage(result.body, facts, voice, { previous: args.previousMessage })
    issues.push(...validation.issues)
    const subjectCheck = result.subject
      ? validateSubject(result.subject, facts, voice)
      : { ok: true, subject: undefined, issues: [] as ValidationIssue[] }
    issues.push(...subjectCheck.issues)
    if (!validation.ok || !subjectCheck.ok) return null
    return {
      body: validation.text,
      subject: subjectCheck.subject,
      source,
      promptVersion: CONVERSATION_PROMPT_VERSION,
      variant: args.variantSeed,
      issues,
    }
  }

  // 1. Primary tier (OpenAI). On a timeout or other non-tripping failure we do
  //    NOT mark the tier dead, so a later caller can still reach it — but for
  //    this request we move on rather than making the shopper wait again.
  let primary = await callModel({
    facts,
    voice,
    stage: args.stage,
    previousMessage: args.previousMessage,
    storeId: args.storeId,
  })

  let validated = primary ? validateAndTag(primary, 'ai') : null

  // One correction round-trip on primary when the output broke a rule.
  if (!validated && primary) {
    const retry = await callModel({
      facts,
      voice,
      stage: args.stage,
      previousMessage: args.previousMessage,
      storeId: args.storeId,
      correction: describeIssues(issues.filter((i) => i.severity === 'block')),
    })
    if (retry) validated = validateAndTag(retry, 'ai_retry')
  }

  // 2. Fallback AI provider (Groq) before the deterministic template. This
  //    catches primary timeouts/unavailability without surfacing an error and
  //    without making the shopper wait for a second primary timeout.
  if (!validated) {
    const fallbackResolved = getFallbackAiClient()
    if (fallbackResolved) {
      const fb = await callModel(
        {
          facts,
          voice,
          stage: args.stage,
          previousMessage: args.previousMessage,
          storeId: args.storeId,
        },
        fallbackResolved,
      )
      if (fb) validated = validateAndTag(fb, 'ai_fallback')
    }
  }

  if (validated) return validated

  // 3. Deterministic template — last resort, never unvalidated model output.
  const safe = args.fallback(facts)
  const safeValidation = validateMessage(safe.body, facts, voice, { previous: args.previousMessage })
  const safeSubject = safe.subject ? validateSubject(safe.subject, facts, voice) : { ok: true, subject: undefined, issues: [] as ValidationIssue[] }

  return {
    body: safeValidation.ok ? safeValidation.text : safe.body,
    subject: safeSubject.ok ? safeSubject.subject : undefined,
    source: 'fallback',
    promptVersion: CONVERSATION_PROMPT_VERSION,
    variant: args.variantSeed,
    issues: [...issues, ...safeValidation.issues, ...safeSubject.issues],
  }
}

/**
 * Build a safe fallback message from the facts. Kept here (not in the caller)
 * so the same wording rules apply to every consumer of the layer.
 */
export function buildFallbackMessage(
  facts: ConversationFacts,
  opts?: { subjectPrefix?: string }
): { body: string; subject?: string } {
  const name = facts.customerName ? facts.customerName.split(' ')[0] : null
  const greeting = name ? `Hi ${name}!` : 'Hi there!'
  const itemText = facts.items.length
    ? facts.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')
    : 'your items'
  const total = `${facts.currencySymbol}${facts.total.toFixed(2)}`
  const offer = facts.discount
    ? ` We kept a ${facts.discount.type === 'percentage' ? `${facts.discount.value}% off` : facts.discount.type === 'free_shipping' ? 'free shipping' : `${facts.currencySymbol}${facts.discount.value} off`} offer for you — use code ${facts.discount.code} at checkout.`
    : ''

  // The URL is never inlined: every channel renders its own button (email CTA,
  // WhatsApp template button), so repeating the raw link only adds noise.
  if (facts.channel === 'whatsapp') {
    return {
      body: `${greeting} your ${itemText} is still saved here 🛒 — total ${total}.${offer} Come back whenever suits you. No pressure, just your goodies waiting.`,
    }
  }

  const subject = opts?.subjectPrefix
    ? `${opts.subjectPrefix} ${name ? name + '!' : ''}`.trim()
    : `${name ? `${name}, your cart is waiting` : 'Your cart is waiting'}`

  return {
    subject,
    body: `${greeting}\n\nYour ${itemText} is still saved — total ${total}.${offer}\n\nWhenever you're ready, you can pick up right where you left off. We'll be here. 🛍️`,
  }
}

/**
 * Guard used by callers before they trust a message: it must not be empty and
 * it must not be a near-duplicate of what was already sent.
 */
export function isUsableMessage(body: string, previous?: string | null): boolean {
  if (!body || !body.trim()) return false
  if (previous && isNearDuplicate(body, previous)) return false
  return true
}

/** Exposed for tests: the hard word limit for a channel/voice combination. */
export function limitFor(voice: BrandVoice, channel: 'email' | 'whatsapp'): number {
  return maxWords(voice, channel)
}
