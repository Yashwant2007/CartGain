export type AiTier = 'primary' | 'fallback'

let primaryBreakerUntil = 0
let fallbackBreakerUntil = 0
let breakerLoggedAt = 0

const QUOTA_BREAKER_MS = 15 * 60_000

function envMs(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name])
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

// A 429 is usually a per-minute token/request bucket, not a dead provider.
// Keeping the tier out of rotation for 15 minutes turned one burst into 15
// minutes of canned replies for every shopper; recover quickly instead.
export function rateLimitBreakerMs(): number {
  return envMs('AI_RATE_LIMIT_COOLDOWN_MS', 30_000, 1_000, 5 * 60_000)
}

export function isTierTripped(tier: AiTier, now: number = Date.now()): boolean {
  return now < (tier === 'primary' ? primaryBreakerUntil : fallbackBreakerUntil)
}

export function tripTierBreaker(
  tier: AiTier,
  now: number = Date.now(),
  durationMs: number = QUOTA_BREAKER_MS,
): void {
  if (isTierTripped(tier, now)) return
  const until = now + Math.max(1_000, Math.round(durationMs))
  if (tier === 'primary') primaryBreakerUntil = until
  else fallbackBreakerUntil = until
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