import { headers } from 'next/headers'
import { redisIncrOrNull, redisExpire } from './redis'

export interface RateLimitConfig {
  maxAttempts?: number
  windowMs?: number
}

const SIMPLE_WINDOW_MS = 60_000
const SIMPLE_MAX_REQUESTS = 30

// Prefer the most trusted proxy headers on Vercel/edge (x-real-ip, cf-connecting-ip),
// and only trust x-forwarded-for as a LAST resort because clients can spoof it.
// Still validate the result to avoid poisoning keys.
function isIp(value: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  if (ipv4.test(value)) {
    const parts = value.split('.').map((p) => Number(p))
    if (parts.every((n) => n >= 0 && n <= 255)) return true
    return false
  }
  const ipv6 = /^[0-9a-fA-F:]{2,45}$/
  if (ipv6.test(value)) return true
  return false
}

export function clientIp(headersList: Headers): string {
  const trusted = [
    headersList.get('x-real-ip'),
    headersList.get('cf-connecting-ip'),
    headersList.get('true-client-ip'),
  ]
  for (const candidate of trusted) {
    const v = candidate?.trim()
    if (v && isIp(v)) return v
  }
  const forwarded = headersList.get('x-forwarded-for')
  if (forwarded) {
    // On trusted proxies, the leftmost entry can be spoofed. Walk from right to
    // left to find the first valid IP that is likely not the client-spoofed one,
    // or fall back to 'unknown' if we cannot identify a trusted hop.
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean)
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (isIp(parts[i])) return parts[i]
    }
  }
  return 'unknown'
}

// ─── In-memory fallback ───────────────────────────────────────────────────────
// When Redis is down, rate limiting MUST NOT silently fail open, or auth
// endpoints (login/register/reset) would be unprotected and effectively
// brute-forceable for the duration of the outage. This per-process map keeps
// throttling active (best-effort; not shared across serverless instances).
type MemoryBucket = { count: number; resetAt: number }
const memoryBuckets = new Map<string, MemoryBucket>()
const MEMORY_CLEANUP_EVERY = 1_000
let memoryChecks = 0

function memoryInc(key: string, windowMs: number): number {
  const now = Date.now()
  const bucket = memoryBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return 1
  }
  bucket.count += 1
  if (++memoryChecks % MEMORY_CLEANUP_EVERY === 0) {
    memoryBuckets.forEach((value, key) => {
      if (value.resetAt <= now) memoryBuckets.delete(key)
    })
  }
  return bucket.count
}

// Returns the count if Redis is healthy, or null when Redis is unavailable
// so callers can fall back to the in-memory limiter.
async function redisCountOrNull(key: string, windowMs: number): Promise<number | null> {
  // redisIncrOrNull returns null (not 0) when Redis is unavailable/unconfigured,
  // so the caller falls back to the in-memory limiter instead of silently
  // allowing unlimited requests. windowMs is passed through as milliseconds.
  const count = await redisIncrOrNull(key)
  if (count === null) return null
  if (count === 1) {
    await redisExpire(key, windowMs)
  }
  return count
}

export async function checkRateLimit(
  endpoint: string,
  config: RateLimitConfig = {}
): Promise<{
  success: boolean
  remaining: number
  resetTime: number
  message?: string
}> {
  const { maxAttempts = 10, windowMs = 5 * 60 * 1000 } = config

  try {
    const headersList = await headers()
    const ip = clientIp(headersList)
    const key = `ratelimit:${ip}_${endpoint}`

    const count = (await redisCountOrNull(key, windowMs)) ?? memoryInc(key, windowMs)

    const remaining = Math.max(0, maxAttempts - count)
    const resetTime = Date.now() + windowMs

    if (count > maxAttempts) {
      return {
        success: false,
        remaining: 0,
        resetTime,
        message: `Too many attempts. Try again later.`,
      }
    }

    return { success: true, remaining, resetTime }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Never block legitimate traffic due to an unexpected internal error, but
    // note it so the degradation is visible.
    return { success: true, remaining: 0, resetTime: 0 }
  }
}

export async function checkSimpleRateLimit(key: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const redisKey = `ratelimit:${key}`

  const count = (await redisCountOrNull(redisKey, SIMPLE_WINDOW_MS)) ?? memoryInc(redisKey, SIMPLE_WINDOW_MS)

  if (count > SIMPLE_MAX_REQUESTS) {
    return { allowed: false, retryAfter: 60 }
  }

  return { allowed: true, retryAfter: 0 }
}