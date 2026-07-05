import { headers } from 'next/headers'
import { redisIncr, redisExpire } from './redis'

export interface RateLimitConfig {
  maxAttempts?: number
  windowMs?: number
}

const SIMPLE_WINDOW_MS = 60_000
const SIMPLE_MAX_REQUESTS = 30

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
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
    const key = `ratelimit:${ip}_${endpoint}`

    const count = await redisIncr(key)
    if (count === 1) {
      await redisExpire(key, Math.floor(windowMs / 1000))
    }

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
    return { success: true, remaining: 0, resetTime: 0 }
  }
}

export async function checkSimpleRateLimit(key: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const redisKey = `ratelimit:${key}`

  const count = await redisIncr(redisKey)
  if (count === 1) {
    await redisExpire(redisKey, SIMPLE_WINDOW_MS / 1000)
  }

  if (count > SIMPLE_MAX_REQUESTS) {
    return { allowed: false, retryAfter: 60 }
  }

  return { allowed: true, retryAfter: 0 }
}
