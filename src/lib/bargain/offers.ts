/**
 * Client-side offer-suggestion building for the bargain chat.
 *
 * CRITICAL SAFETY RULE: the quick-offer chips must ONLY be derived from
 * legitimate negotiation state — the server's live counter (if any) plus
 * conservative percentages of the *listed* price. They are pure prefill values
 * for the offer box and must NEVER carry a floor-derived amount. The merchant
 * floor is computed server-side and never shipped to the browser, so anything
 * computed here sits comfortably above it by construction.
 */
import type { BargainDecision } from './api-types'

export const QUICK_OFFER_DISCOUNTS = [11, 15] as const

export function buildQuickOffers(opts: {
  lastCounter: number | null
  listedPrice: number
  sessionEnded: boolean
  decision: BargainDecision
}): number[] {
  const { lastCounter, listedPrice, sessionEnded, decision } = opts
  const out: number[] = []
  if (lastCounter != null && !sessionEnded && decision !== 'accept') {
    const v = Math.round(lastCounter)
    if (!out.includes(v)) out.push(v)
  }
  if (listedPrice > 0) {
    for (const pct of QUICK_OFFER_DISCOUNTS) {
      const v = Math.round(listedPrice * (1 - pct / 100))
      if (!out.includes(v)) out.push(v)
    }
  }
  return out.slice(0, 3)
}