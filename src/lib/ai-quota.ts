export type AiTier = 'primary' | 'fallback'

let primaryBreakerUntil = 0
let fallbackBreakerUntil = 0
let breakerLoggedAt = 0

const QUOTA_BREAKER_MS = 15 * 60_000

export function isTierTripped(tier: AiTier, now: number = Date.now()): boolean {
  return now < (tier === 'primary' ? primaryBreakerUntil : fallbackBreakerUntil)
}

export function tripTierBreaker(tier: AiTier, now: number = Date.now()): void {
  if (isTierTripped(tier, now)) return
  if (tier === 'primary') primaryBreakerUntil = now + QUOTA_BREAKER_MS
  else fallbackBreakerUntil = now + QUOTA_BREAKER_MS
}

export function shouldLogQuota(now: number = Date.now()): boolean {
  const shouldLog = now - breakerLoggedAt >= QUOTA_BREAKER_MS
  if (shouldLog) breakerLoggedAt = now
  return shouldLog
}

export function isInsufficientQuotaError(err: any): boolean {
  const status = err?.status ?? err?.statusCode
  const code = err?.code ?? err?.error?.code
  return status === 402 || code === 'insufficient_quota'
}

export function resetQuotaBreakForTests(): void {
  primaryBreakerUntil = 0
  fallbackBreakerUntil = 0
  breakerLoggedAt = 0
}