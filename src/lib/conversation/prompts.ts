/**
 * Prompt orchestration for the shared conversation layer.
 *
 * Prompts are VERSIONED. When the copy rules change, the version changes too,
 * and the version is stored on the message row — so a merchant can always
 * answer "which rules produced this message?", and a bad prompt can be
 * rolled back by moving the version.
 *
 * The prompt states the same constraints the validator enforces. That is
 * deliberate: the prompt makes the model *likely* to comply, the validator
 * makes compliance *guaranteed*.
 */
import { ConversationFacts } from './facts'
import { BrandVoice, maxEmojis, maxWords, voicePromptBlock } from './voice'

export const CONVERSATION_PROMPT_VERSION = 'recovery-v2'

export type ConversationStage = 'reminder_1' | 'reminder_2' | 'reminder_3'

const STAGE_OBJECTIVE: Record<ConversationStage, string> = {
  reminder_1: 'First reminder: remind them of what they chose and give one clear next step. Warm, brief, no pressure.',
  reminder_2: 'Second reminder: acknowledge they may still be deciding, and (if an offer exists) mention it once, naturally.',
  reminder_3: 'Final reminder: say plainly that this is the last message about this cart, and stop. No false urgency, no threats.',
}

function factsBlock(facts: ConversationFacts): string {
  const lines: string[] = []
  lines.push(`Store: ${facts.storeName}`)
  if (facts.customerName) lines.push(`Customer first name: ${facts.customerName}`)
  lines.push(`Items: ${facts.items.map((i) => `${i.name} x${i.quantity} (${facts.currencySymbol}${i.price})`).join('; ') || 'none'}`)
  lines.push(`Cart total: ${facts.currencySymbol}${facts.total.toFixed(2)}`)
  if (facts.discount) {
    const value =
      facts.discount.type === 'percentage'
        ? `${facts.discount.value}% off`
        : facts.discount.type === 'free_shipping'
          ? 'free shipping'
          : `${facts.currencySymbol}${facts.discount.value} off`
    lines.push(`Authorised offer: code ${facts.discount.code} (${value})`)
  }
  if (facts.verified?.bestseller) lines.push('Verified fact: this is a bestseller in our own sales data.')
  if (facts.verified?.lowStock) lines.push('Verified fact: our inventory shows low stock.')
  if (facts.verified?.reviewCount) lines.push(`Verified fact: this product has ${facts.verified.reviewCount} reviews.`)
  if (!facts.verified?.bestseller && !facts.verified?.lowStock && !facts.verified?.reviewCount) {
    lines.push('Verified facts about popularity, stock, reviews and guarantees: NONE. Do not mention them.')
  }
  return lines.join('\n')
}

export function buildRecoveryPrompt(args: {
  facts: ConversationFacts
  voice: BrandVoice
  stage: ConversationStage
  /** The previous message, so the model does not repeat itself. */
  previousMessage?: string | null
}): { system: string; user: string; version: string } {
  const { facts, voice, stage } = args
  const isEmail = facts.channel === 'email'
  const emojiRule =
    voice.emojiIntensity === 'off'
      ? 'Use no emoji.'
      : `Use at most ${maxEmojis(voice, facts.channel)} emoji in the whole message, and only where it adds meaning.`
  const wordLimit = maxWords(voice, facts.channel)

  const system = `You write customer-facing messages for ${facts.storeName}, an online store.

${voicePromptBlock(voice)}

TASK
${STAGE_OBJECTIVE[stage]}

FACTS (the ONLY things you are allowed to state)
${factsBlock(facts)}

HARD RULES
- Every statement you make must be supported by a line above. If a fact is missing, you do not mention it.
- Never state or imply that something is popular, a bestseller, trending, reviewed, in stock or running out unless a "Verified fact" line says so.
- Never claim a discount, a code, a price, a saving or a deadline that is not in the FACTS.
- Never say the cart "expires", that stock is "limited", that this is your "last chance" unless the FACTS say so.
- Never compare us to other stores and never promise guarantees, refunds or outcomes.
- Never pretend to be a person: no "I personally checked", no "my team", no "I am a real human".
- Do not invent a discount code, a URL, a delivery date or a product benefit that is not in the FACTS.
- Output format: ${isEmail ? 'JSON with keys "subject" (max 60 characters) and "body" (plain text, no HTML, no markdown).' : 'plain text only, no JSON, no quotes, no markdown, no HTML.'}
- Word limit for the message body: ${wordLimit}. ${emojiRule}
- Do not include the cart URL — it is added separately.

Write it now.`

  const user = `${factsBlock(facts)}
${
  args.previousMessage
    ? `\nYour previous message to this customer was:\n"${args.previousMessage}"\nDo not repeat it. Say something new.`
    : ''
}`

  return { system, user, version: CONVERSATION_PROMPT_VERSION }
}
