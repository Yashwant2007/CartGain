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
import { pickIndex } from './variety'

export type MessageSource = 'ai' | 'ai_retry' | 'ai_fallback' | 'fallback'

export type GeneratedMessage = {
  body: string
  subject?: string
  /** Email hero line. Optional so existing callers keep working. */
  headline?: string
  /** Email button label. Optional; the template has a safe default. */
  cta?: string
  source: MessageSource
  promptVersion: string
  /** Stable identifier of the wording variant used. */
  variant: string
  issues: ValidationIssue[]
}

export type SafeFallback = (facts: ConversationFacts) => { body: string; subject?: string; headline?: string; cta?: string }

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
): Promise<{ body: string; subject?: string; headline?: string; cta?: string; tier: 'primary' | 'fallback' } | null> {
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

  const primaryModel = process.env.AI_PRIMARY_MODEL?.trim() || 'gpt-4o-mini'

  try {
    const res = await client.client.chat.completions.create({
      model: primaryModel,
      messages,
      ...(isEmail ? { response_format: { type: 'json_object' as const } } : {}),
      max_tokens: isEmail ? 500 : 220,
      temperature: 0.9,
      presence_penalty: 0.2,
      frequency_penalty: 0.2,
    })
    const content = res.choices[0]?.message?.content?.trim()
    if (!content) return null
    if (isEmail) {
      const parsed = JSON.parse(content)
      const body = typeof parsed.body === 'string' ? parsed.body : ''
      const subject = typeof parsed.subject === 'string' ? parsed.subject : undefined
      const headline = typeof parsed.headline === 'string' ? parsed.headline : undefined
      const cta = typeof parsed.cta === 'string' ? parsed.cta : undefined
      if (!body) return null
      return { body, subject, headline, cta, tier: client.tier }
    }
    return { body: content, tier: client.tier }
  } catch (err: any) {
    handleAiFailure(err, 'conversation generation', userKey, client.tier)
    return null
  }
}

function validateDisplayText(
  text: string,
  facts: ConversationFacts,
  voice: BrandVoice,
  maxChars: number,
): { ok: boolean; text?: string } {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > maxChars) return { ok: false }
  const validation = validateMessage(trimmed, facts, voice)
  return validation.ok ? { ok: true, text: validation.text } : { ok: false }
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
    result: { body: string; subject?: string; headline?: string; cta?: string },
    source: MessageSource,
  ): GeneratedMessage | null => {
    const validation = validateMessage(result.body, facts, voice, { previous: args.previousMessage })
    issues.push(...validation.issues)
    const subjectCheck = result.subject
      ? validateSubject(result.subject, facts, voice)
      : { ok: true, subject: undefined, issues: [] as ValidationIssue[] }
    issues.push(...subjectCheck.issues)
    if (!validation.ok || !subjectCheck.ok) return null
    const headlineCheck: { ok: boolean; text?: string } = result.headline
      ? validateDisplayText(result.headline, facts, voice, 70)
      : { ok: false }
    const ctaCheck: { ok: boolean; text?: string } = result.cta
      ? validateDisplayText(result.cta, facts, voice, 32)
      : { ok: false }
    return {
      body: validation.text,
      subject: subjectCheck.subject,
      headline: headlineCheck.ok ? headlineCheck.text : undefined,
      cta: ctaCheck.ok ? ctaCheck.text : undefined,
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
  // getAiClient() may already have selected the fallback provider (for example
  // when the primary breaker is open). Do not call the same provider twice for
  // one message: that is how a free-tier 429 becomes a template fallback.
  const primaryWasFallback = primary?.tier === 'fallback'

  // One correction round-trip on the primary when the output broke a rule.
  if (!validated && primary && !primaryWasFallback) {
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
  if (!validated && !primaryWasFallback) {
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
  const safeHeadline: { ok: boolean; text?: string } = safe.headline
    ? validateDisplayText(safe.headline, facts, voice, 70)
    : { ok: false }
  const safeCta: { ok: boolean; text?: string } = safe.cta
    ? validateDisplayText(safe.cta, facts, voice, 32)
    : { ok: false }

  return {
    body: safeValidation.ok ? safeValidation.text : safe.body,
    subject: safeSubject.ok ? safeSubject.subject : undefined,
    headline: safeHeadline.ok ? safeHeadline.text : undefined,
    cta: safeCta.ok ? safeCta.text : undefined,
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
  opts?: {
    subjectPrefix?: string
    stage?: ConversationStage
    seed?: string
    previousMessage?: string | null
  },
): { body: string; subject?: string; headline?: string; cta?: string } {
  const firstName = facts.customerName?.trim().split(/\s+/)[0] || null
  const greeting = firstName ? `Hi ${firstName}!` : 'Hi there!'
  const itemText = facts.items.length
    ? facts.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')
    : 'your items'
  const firstItem = facts.items[0]
  const firstItemName = (firstItem?.name || 'your item').slice(0, 40)
  const rawDetail = typeof firstItem?.description === 'string'
    ? firstItem.description.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0]
    : ''
  const detail = rawDetail && rawDetail.toLowerCase() !== firstItemName.toLowerCase()
    ? rawDetail.slice(0, 70)
    : ''
  const detailBit = detail ? ` — ${detail}` : ''
  const total = `${facts.currencySymbol}${facts.total.toFixed(2)}`
  const offerValue = facts.discount
    ? facts.discount.type === 'percentage'
      ? `${facts.discount.value}% off`
      : facts.discount.type === 'free_shipping'
        ? 'free shipping'
        : `${facts.currencySymbol}${facts.discount.value} off`
    : ''
  const offer = facts.discount ? ` Use ${facts.discount.code} for ${offerValue}.` : ''
  const stage = opts?.stage || 'reminder_1'
  const channel = facts.channel

  const bodies: Record<ConversationStage, string[]> = channel === 'whatsapp'
    ? {
        reminder_1: [
          `${greeting} your ${itemText}${detailBit} is still saved — ${total}.${offer} Come back whenever you like.`,
          `${greeting} we held your ${itemText}${detailBit} for you ✨ — ${total}.${offer} Ready when you are.`,
          `${greeting} your ${itemText}${detailBit} is right where you left it — ${total}.${offer} No rush 🙂`,
        ],
        reminder_2: [
          `${greeting} still thinking about your ${itemText}? It's saved 🛒 — ${total}.${offer} Want to take another look?`,
          `${greeting} no pressure — your ${itemText}${detailBit} is still in your cart (${total}).${offer} We're here when you're ready.`,
          `${greeting} your ${itemText}${detailBit} hasn't gone anywhere — ${total}.${offer} Take another look?`,
        ],
        reminder_3: [
          `${greeting} last note about your ${itemText}${detailBit} — still saved for ${total}.${offer} If now isn't the time, no worries. 💛`,
          `${greeting} we'll stop nudging after this one. Your ${itemText}${detailBit} is here if you want it — ${total}.${offer}`,
          `${greeting} final reminder about your ${itemText}${detailBit} — ${total}.${offer} Thanks for looking either way 👋`,
        ],
      }
    : {
        reminder_1: [
          `${greeting}

Your ${itemText}${detailBit} is still saved — total ${total}.${offer}

No rush. Pick up right where you left off whenever you're ready. 🛍️`,
          `${greeting}

We kept your ${itemText}${detailBit} in your cart — ${total}.${offer}

Come back when it suits you; checkout takes a minute. ✨`,
          `${greeting}

Your ${itemText}${detailBit} is waiting for you — ${total}.${offer}

If you're still deciding, that's okay. Your cart is right here. 🙂`,
        ],
        reminder_2: [
          `${greeting}

Still thinking about your ${itemText}? It's saved${detailBit} — ${total}.${offer}

If something felt off, tell us. Otherwise, your cart is one tap away. 💬`,
          `${greeting}

No pressure at all — your ${itemText}${detailBit} is still in your cart (${total}).${offer}

When you're ready, we'll keep checkout quick. 🛒`,
          `${greeting}

Your ${itemText}${detailBit} hasn't gone anywhere. Total ${total}.${offer}

Take another look, or make us an offer if the price is the sticking point. 🤝`,
        ],
        reminder_3: [
          `${greeting}

This is the last note from us about this cart. Your ${itemText}${detailBit} is still saved — ${total}.${offer}

If now isn't the time, no hard feelings. 💛`,
          `${greeting}

We'll stop nudging you after this one. Your ${itemText}${detailBit} is here if you want it — ${total}.${offer}

Thanks for taking a look either way. 🙌`,
          `${greeting}

Last reminder about your ${itemText}${detailBit} — ${total}.${offer}

If you'd rather not hear from us again, the unsubscribe link is below. Take care. 👋`,
        ],
      }

  const candidates = bodies[stage]
  const seed = opts?.seed || `${facts.storeName}:${facts.cartUrl}:${stage}:${channel}`
  const start = pickIndex(seed, candidates.length)
  let body = candidates[start]
  if (opts?.previousMessage) {
    for (let i = 1; i < candidates.length; i += 1) {
      const next = candidates[(start + i) % candidates.length]
      if (!isNearDuplicate(next, opts.previousMessage)) {
        body = next
        break
      }
    }
  }

  const nameBit = firstName ? `${firstName}, ` : ''
  const subjectByStage: Record<ConversationStage, string> = {
    reminder_1: `${nameBit}your cart is still saved`,
    reminder_2: `${nameBit}still thinking it over?`,
    reminder_3: `${nameBit}a last note about your cart`,
  }
  const subject = opts?.subjectPrefix
    ? `${opts.subjectPrefix} ${firstName ? firstName + '!' : ''}`.trim()
    : subjectByStage[stage]

  const headlineByStage: Record<ConversationStage, string> = {
    reminder_1: `${nameBit}your ${firstItemName} is still saved`,
    reminder_2: `${nameBit}still deciding on your ${firstItemName}?`,
    reminder_3: 'A last note about your cart',
  }
  const ctaVariants: Record<ConversationStage, string[]> = {
    reminder_1: ['Finish checkout', 'Pick up where you left off', 'Back to your cart'],
    reminder_2: ['Take another look', 'Return to your cart', 'See your cart'],
    reminder_3: ['Complete your order', 'Finish checkout', 'One last look'],
  }
  const cta = ctaVariants[stage][pickIndex(`${seed}:cta`, ctaVariants[stage].length)]

  return { body, subject, headline: headlineByStage[stage], cta }
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
