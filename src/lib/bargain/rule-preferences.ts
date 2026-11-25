import type { NegotiationContext, NegotiationResult } from '@/lib/bargain/engine'
import type { PaymentAwarenessConfig, PaymentIntent } from '@/lib/bargain/payment'
import type { ShippingConfig } from '@/lib/bargain/shipping'
import { computeShipping, shippingUpsellLine } from '@/lib/bargain/shipping'

type RulePreferenceContext = NegotiationContext & {
  negotiationMode?: 'conservative' | 'balanced' | 'flexible'
  negotiationStyle?: string
  shipping?: ShippingConfig
  payment?: { intent: PaymentIntent; config: PaymentAwarenessConfig }
}

const MODE_LINES: Record<string, string | null> = {
  conservative: "I'll keep this close to the listed price while you decide.",
  balanced: null,
  flexible: "I'm aiming to close this for you today.",
}

const STYLE_LINES: Record<string, string | null> = {
  friendly_playful: "I'll keep this friendly and straightforward.",
  professional_premium: "I'll keep the offer clear and precise.",
  firm_negotiator: "I'll hold firm while still being fair.",
  value_first: "Let's focus on the value you're getting.",
  budget_advisor: "I'll keep your budget in view.",
  strict_policy: "I'll stay within our store policy.",
}

function sentence(value: string | null | undefined): string | null {
  if (!value) return null
  const text = value.trim()
  if (!text) return null
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function money(value: number, symbol: string): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? `${symbol}${rounded}` : `${symbol}${rounded.toFixed(2)}`
}

function paymentLine(intent: PaymentIntent, config: PaymentAwarenessConfig, symbol: string): string | null {
  if (!config.enabled) return null
  const bits: string[] = []
  if (config.codRtoEnabled && config.rtoIncentive > 0) {
    bits.push(`a prepaid saving of ${money(config.rtoIncentive, symbol)}`)
  }
  if (config.prepaidIncentivePercent > 0) {
    bits.push(`up to ${config.prepaidIncentivePercent}% extra for prepaid`)
  }
  if (bits.length === 0) return null
  const lever = bits.join(' and ')
  if (intent === 'cod') return sentence(`Switching to prepaid can unlock ${lever}`)
  if (intent === 'unknown') return sentence(`Paying online can unlock ${lever}`)
  return null
}

export function applyRulePreferences(result: NegotiationResult, ctx: RulePreferenceContext): NegotiationResult {
  if (result.decision !== 'counter' || result.counterOffer == null) return result

  const additions: string[] = []
  const modeLine = sentence(MODE_LINES[ctx.negotiationMode ?? 'balanced'])
  if (modeLine) additions.push(modeLine)
  const styleLine = sentence(STYLE_LINES[ctx.negotiationStyle ?? ''])
  if (styleLine) additions.push(styleLine)

  if (ctx.shipping?.enabled) {
    const quote = computeShipping({
      config: ctx.shipping,
      unitPrice: result.counterOffer,
      quantity: ctx.bulkQuantity,
    })
    const upsell = shippingUpsellLine(quote, ctx.currencySymbol, { config: ctx.shipping })
    if (upsell) additions.push(upsell)
  }

  if (ctx.payment) {
    const lever = paymentLine(ctx.payment.intent, ctx.payment.config, ctx.currencySymbol)
    if (lever) additions.push(lever)
  }

  if (additions.length === 0) return result
  return { ...result, reply: `${result.reply.trim()} ${additions.join(' ')}`.trim() }
}
