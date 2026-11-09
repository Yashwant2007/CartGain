/**
 * Recovery copy composition — the single place a cart-recovery message is
 * written.
 *
 * The job no longer calls two separate "AI copy" functions with their own
 * prompts. It describes the cart as TRUSTED FACTS and asks this module for a
 * validated message. Benefits:
 *  - one voice, one factual contract, one validator;
 *  - the same rules apply to email and WhatsApp;
 *  - a fallback that used to invent "bestsellers" and "selling fast" is now
 *    built from the facts only.
 */
import { ConversationDiscount, ConversationFacts } from './facts'
import { BrandVoice } from './voice'
import { ConversationStage } from './prompts'
import { GeneratedMessage, buildFallbackMessage, generateRecoveryMessage } from './generate'

export type RecoveryCartInput = {
  storeId: string
  storeName: string
  currencySymbol: string
  customerName?: string | null
  items: ConversationFacts['items']
  total: number
  cartUrl: string
  discount?: ConversationDiscount | null
  channel: 'email' | 'whatsapp'
  /** 0-based sequence step. */
  step: number
  /** Total rounds the campaign may send. Only the real last round is "final". */
  maxRounds?: number
  voice: BrandVoice
  previousMessage?: string | null
}

export function stageForStep(step: number, maxRounds = 3): ConversationStage {
  if (step <= 0) return 'reminder_1'
  const lastStep = Math.max(1, maxRounds - 1)
  // Intermediate rounds reuse reminder_2; only the real final round is allowed
  // to say "last note" (campaigns may run up to five rounds).
  if (step >= lastStep) return 'reminder_3'
  return 'reminder_2'
}

/** Build the trusted, minimal fact set for a recovery message. */
export function buildRecoveryFacts(input: RecoveryCartInput): ConversationFacts {
  return {
    storeName: input.storeName,
    currencySymbol: input.currencySymbol,
    items: input.items,
    total: input.total,
    cartUrl: input.cartUrl,
    customerName: input.customerName ?? undefined,
    discount: input.discount ?? null,
    channel: input.channel,
    stage: input.step,
  }
}

/**
 * Compose a recovery message. Always returns validated copy: model output when
 * it passes every rule, otherwise a fact-only template.
 */
export async function composeRecoveryMessage(input: RecoveryCartInput): Promise<GeneratedMessage> {
  const facts = buildRecoveryFacts(input)
  // `cartUrl` may be relative when NEXT_PUBLIC_APP_URL is unset (tests, local
  // dev). The seed only needs a stable suffix, so parsing is best-effort.
  let cartPath = input.cartUrl
  try {
    cartPath = new URL(input.cartUrl).pathname
  } catch {
    // keep the raw value
  }
  const variantSeed = `${input.storeId}:${input.channel}:${input.step}:${cartPath}`
  return generateRecoveryMessage({
    facts,
    voice: input.voice,
    stage: stageForStep(input.step, input.maxRounds),
    previousMessage: input.previousMessage,
    storeId: input.storeId,
    variantSeed,
    fallback: (fallbackFacts) =>
      buildFallbackMessage(fallbackFacts, {
        stage: stageForStep(input.step, input.maxRounds),
        seed: variantSeed,
        previousMessage: input.previousMessage,
      }),
  })
}

/**
 * The greeting/text used by WhatsApp templates. Templates render the body as
 * a parameter, so the newline-separated email body is collapsed.
 */
export function singleLineMessage(body: string): string {
  return body.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
}

/**
 * WhatsApp templates already greet the customer ({{1}} is the name), so a body
 * that opens with its own greeting stutters: "HURRY!! Priya, last chance ...
 * Hi Priya, your ...". Strip the leading greeting for that channel only.
 */
export function stripLeadingGreeting(body: string, customerName?: string | null): string {
  const first = (customerName || '').split(' ')[0]?.trim()
  const patterns: RegExp[] = [
    // Email addresses contain dots, so the generic patterns below stop early.
    /^(hi|hey|hello|yo|dear)[,]?\s+[^\s,]+@[^\s,]+[,!.]?\s*/i,
    /^(hi|hey|hello|yo|dear)\s+[^,]{1,60},\s*/i,
    /^(hi|hey|hello|yo|dear)\s+[^,]{1,60}[.!]\s+/i,
  ]
  if (first) {
    const safe = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    patterns.unshift(new RegExp(`^${safe}\\s*[,!—-]\\s*`, 'i'))
  }
  for (const pattern of patterns) {
    const stripped = body.replace(pattern, '')
    if (stripped !== body && stripped.trim().length > 0) return stripped.trim()
  }
  return body
}
