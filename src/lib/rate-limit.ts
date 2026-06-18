import { headers } from 'next/headers'
import { redisIncr, redisExpire } from './redis'

export interface RateLimitConfig {
  maxAttempts?: number
  windowMs?: number
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
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'
    const key = `ratelimit:${ip}_${endpoint}`

    const count = await redisIncr(key)
    if (count === 1) {
      await redisExpire(key, windowMs)
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
