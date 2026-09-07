let quotaBreakerUntil = 0
let breakerLoggedAt = 0

const QUOTA_BREAKER_MS = 15 * 60_000

export function isQuotaTripped(now: number = Date.now()): boolean {
  return now < quotaBreakerUntil
}

export function tripQuotaBreaker(now: number = Date.now()): void {
  if (isQuotaTripped(now)) return
  quotaBreakerUntil = now + QUOTA_BREAKER_MS
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

export function resetQuotaBreakerForTests(): void {
  quotaBreakerUntil = 0
  breakerLoggedAt = 0
}