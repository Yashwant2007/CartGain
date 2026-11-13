// ── Payment-method-aware negotiation (Module 5) ─────────────
// During a bargain the shopper often says how they intend to pay. This module
// classifies that intent deterministically (never trusting the model to guess),
// then lets the agent (a) close faster for prepaid buyers and (b) steer COD
// buyers toward prepaid with the merchant's real COD→prepaid saving — which
// directly protects revenue by cutting return-to-origin (RTO) risk. It reuses
// the merchant's existing RTO/payment settings; nothing here can ever move a
// price below the hidden floor (the engine clamp still owns that).

export type PaymentIntent = 'prepaid' | 'cod' | 'unknown'

// Explicit COD phrasing only — a bare "cash" is ambiguous (it can mean "I'll pay
// cash right now", i.e. prepaid-ish), so it is deliberately NOT matched here.
const COD_PATTERNS: RegExp[] = [
  /\bcod\b/i,
  /cash\s*on\s*delivery/i,
  /cash\s*on\s*(?:delivered|receipt)/i,
  /pay\s*(?:on|at|after|upon)\s*delivery/i,
  /pay\s*when\s*(?:it|the|i|we)/i,
  /payment\s*on\s*delivery/i,
  /delivery\s*(?:pe|par|ke\s*baad)/i,
]

// Prepaid phrasing — online rails and "pay now".
const PREPAID_PATTERNS: RegExp[] = [
  /\bupi\b/i,
  /google\s*pay/i,
  /\bgpay\b/i,
  /phone\s*pe/i,
  /\bpaytm\b/i,
  /\bbhim\b/i,
  /\bcard\b/i,
  /credit\s*card/i,
  /debit\s*card/i,
  /net\s*banking/i,
  /\bnetbanking\b/i,
  /online\s*pay/i,
  /pay\s*online/i,
  /\bprepaid\b/i,
  /pay\s*now/i,
  /\b(?:razorpay|stripe|cashfree)\b/i,
]

/**
 * Classify the shopper's intended payment method from the latest message,
 * falling back to the most recent message that carried a signal. Current
 * message wins; otherwise we walk history newest-first.
 */
export function detectPaymentIntent(message: string, history: string[] = []): PaymentIntent {
  const ordered = [message, ...history.slice().reverse()]
  for (const text of ordered) {
    if (!text) continue
    if (PREPAID_PATTERNS.some((p) => p.test(text))) return 'prepaid'
    if (COD_PATTERNS.some((p) => p.test(text))) return 'cod'
  }
  return 'unknown'
}

export interface PaymentAwarenessConfig {
  enabled: boolean
  /** Extra % the agent may pass on for a prepaid close (0 = no extra lever). */
  prepaidIncentivePercent: number
  /** Merchant runs the COD→prepaid RTO reduction program. */
  codRtoEnabled: boolean
  /** The merchant's flat prepaid saving (currency units) for switching off COD. */
  rtoIncentive: number
}

export interface PaymentAwarenessInput {
  paymentAwareEnabled?: boolean | null
  prepaidIncentivePercent?: number | null
  rtoReductionEnabled?: boolean | null
  rtoIncentive?: number | null
}

function clampPercent(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0
  return Math.min(30, Math.round(n * 100) / 100)
}

export function normalizePaymentConfig(input: PaymentAwarenessInput): PaymentAwarenessConfig {
  const rtoRaw = input.rtoIncentive
  const rtoIncentive =
    typeof rtoRaw === 'number' && Number.isFinite(rtoRaw) && rtoRaw > 0 ? Math.round(rtoRaw * 100) / 100 : 0
  return {
    enabled: input.paymentAwareEnabled === true,
    prepaidIncentivePercent: clampPercent(input.prepaidIncentivePercent),
    codRtoEnabled: input.rtoReductionEnabled === true,
    rtoIncentive,
  }
}

function formatMoney(value: number, symbol: string): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? `${symbol}${rounded}` : `${symbol}${rounded.toFixed(2)}`
}

/** Whether the agent has any truthful prepaid lever to offer. */
export function hasPrepaidLever(config: PaymentAwarenessConfig): boolean {
  return (config.codRtoEnabled && config.rtoIncentive > 0) || config.prepaidIncentivePercent > 0
}

/**
 * Floor-safe payment guidance for the system prompt. Only ever contains the
 * merchant's PUBLIC prepaid saving / extra % — never the hidden minimum.
 */
export function paymentPromptBlock(
  intent: PaymentIntent,
  config: PaymentAwarenessConfig,
  currencySymbol: string,
): string | null {
  if (!config.enabled) return null
  const parts: string[] = []
  const leverLine = (() => {
    const bits: string[] = []
    if (config.codRtoEnabled && config.rtoIncentive > 0) {
      bits.push(`a prepaid saving of ${formatMoney(config.rtoIncentive, currencySymbol)}`)
    }
    if (config.prepaidIncentivePercent > 0) {
      bits.push(`up to ${config.prepaidIncentivePercent}% extra for prepaid`)
    }
    return bits.length > 0 ? bits.join(' and ') : null
  })()

  if (intent === 'cod') {
    parts.push(
      `PAYMENT INTENT — CASH ON DELIVERY: The shopper wants to pay cash on delivery. COD orders carry a high return risk.`,
    )
    if (leverLine) {
      parts.push(
        `Warmly offer ${leverLine} if they switch to prepaid and pay online now. Frame it as a genuine saving for THEM — never as pressure, never a condition of the deal, and never claim their COD order will be refused.`,
      )
    }
  } else if (intent === 'prepaid') {
    parts.push(`PAYMENT INTENT — PREPAID: The shopper intends to pay online (UPI/card). Acknowledge it and close faster.`)
    if (config.prepaidIncentivePercent > 0) {
      parts.push(`You may pass on up to ${config.prepaidIncentivePercent}% extra for the prepaid close.`)
    }
  } else {
    parts.push(
      `PAYMENT INTENT — UNKNOWN: If the shopper is close to a deal, you may ask whether they'll pay online or choose Cash on Delivery — prepaid can unlock a small saving.`,
    )
    if (leverLine) parts.push(`If they choose prepaid, you may offer ${leverLine}.`)
  }

  if (hasPrepaidLever(config)) {
    parts.push(
      `Any prepaid saving is a gesture within your existing room — the hidden system minimum still applies and can never be breached or disclosed.`,
    )
  }
  return parts.join(' ')
}

/** The prepaid saving to surface in the API response (COD→prepaid amount), or null. */
export function prepaidSaving(config: PaymentAwarenessConfig): number | null {
  return config.codRtoEnabled && config.rtoIncentive > 0 ? config.rtoIncentive : null
}
