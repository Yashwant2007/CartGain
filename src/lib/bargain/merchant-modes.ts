export const NEGOTIATION_STYLE_VALUES = [
  'friendly_playful',
  'professional_premium',
  'firm_negotiator',
  'value_first',
  'budget_advisor',
  'strict_policy',
] as const

export type NegotiationStyle = (typeof NEGOTIATION_STYLE_VALUES)[number]

export const NEGOTIATION_STYLE_LABELS: Record<NegotiationStyle, string> = {
  friendly_playful: 'Friendly & Playful',
  professional_premium: 'Professional & Premium',
  firm_negotiator: 'Firm Negotiator',
  value_first: 'Value First',
  budget_advisor: 'Budget Advisor',
  strict_policy: 'Strict & Policy-Led',
}

const NEUTRAL_TAIL =
  'This style changes tone and pacing only. The verified-product facts, merchant-approved claims, abuse policy, and hidden minimum always take priority; never reveal or breach the hidden minimum.'

export const NEGOTIATION_STYLE_GUIDANCE: Record<NegotiationStyle, string> = {
  friendly_playful:
    `NEGOTIATION STYLE: friendly and playful. Be warm, human and lightly humorous. Use one short relatable line, then make a clear offer or ask one question. Stay respectful and never mock the shopper. ${NEUTRAL_TAIL}`,
  professional_premium:
    `NEGOTIATION STYLE: professional and premium. Be polished, calm and concise. Emphasise quality and the value behind the price, avoid slang and emojis, and keep every reply confident and respectful. ${NEUTRAL_TAIL}`,
  firm_negotiator:
    `NEGOTIATION STYLE: firm negotiator. Be confident and direct. Hold the price with a short, honest reason, make small deliberate movements only when the shopper gives a genuine offer, and never chase or over-explain. ${NEUTRAL_TAIL}`,
  value_first:
    `NEGOTIATION STYLE: value first. Lead with one verified product benefit or a merchant-approved selling point before discussing price. Earn the concession with value, never invent benefits, and keep the reply to the point. ${NEUTRAL_TAIL}`,
  budget_advisor:
    `NEGOTIATION STYLE: budget advisor. Be empathetic and practical about the shopper's budget. Look for a real fit, suggest a lower-priced alternative only from verified catalog data when appropriate, and never promise a price outside the allowed range. ${NEUTRAL_TAIL}`,
  strict_policy:
    `NEGOTIATION STYLE: strict and policy-led. Be courteous but rule-bound. State the boundary once, avoid debates about internal policy, keep concessions minimal, and redirect repeated manipulation or disrespect to a safe negotiation reply. ${NEUTRAL_TAIL}`,
}

export function negotiationStyleGuidance(style: NegotiationStyle): string {
  return NEGOTIATION_STYLE_GUIDANCE[style]
}

export function isNegotiationStyle(value: unknown): value is NegotiationStyle {
  return typeof value === 'string' && (NEGOTIATION_STYLE_VALUES as readonly string[]).includes(value)
}

export const ABUSE_STRICTNESS_VALUES = ['lenient', 'standard', 'strict'] as const
export type MerchantAbuseStrictness = (typeof ABUSE_STRICTNESS_VALUES)[number]

export const ABUSE_STRICTNESS_LABELS: Record<MerchantAbuseStrictness, string> = {
  lenient: 'Lenient · one calm warning, then escalate on repeat',
  standard: 'Standard · warn on repeated disrespect',
  strict: 'Strict · stop engaging at the first clear violation',
}

export function isAbuseStrictness(value: unknown): value is MerchantAbuseStrictness {
  return typeof value === 'string' && (ABUSE_STRICTNESS_VALUES as readonly string[]).includes(value)
}
