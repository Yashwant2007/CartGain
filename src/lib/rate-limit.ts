import { headers } from 'next/headers'

// In-memory rate limit store (for MVP - use Redis in production)
// Format: { ip_endpoint: { attempts: number, resetTime: number } }
const rateLimitStore = new Map<string, { attempts: number; resetTime: number }>()

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  const entries = Array.from(rateLimitStore.entries())
  for (const [key, data] of entries) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  maxAttempts?: number
  windowMs?: number // milliseconds
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
  const { maxAttempts = 10, windowMs = 5 * 60 * 1000 } = config // 5 minutes default

  try {
    const headersList = await headers()
    const ip =
      headersList.get('x-forwarded-for') ||
      headersList.get('x-real-ip') ||
      'unknown'

    const key = `${ip}_${endpoint}`
    const now = Date.now()
    const data = rateLimitStore.get(key)

    if (!data || data.resetTime < now) {
      // First request or window expired
      rateLimitStore.set(key, {
        attempts: 1,
        resetTime: now + windowMs,
      })

      return {
        success: true,
        remaining: maxAttempts - 1,
        resetTime: now + windowMs,
      }
    }

    // Increment counter
    data.attempts++

    if (data.attempts > maxAttempts) {
      const secondsRemaining = Math.ceil(
        (data.resetTime - now) / 1000
      )

      return {
        success: false,
        remaining: 0,
        resetTime: data.resetTime,
        message: `Too many attempts. Try again in ${secondsRemaining} seconds.`,
      }
    }

    return {
      success: true,
      remaining: maxAttempts - data.attempts,
      resetTime: data.resetTime,
    }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Fail open - allow request if rate limiter fails
    return {
      success: true,
      remaining: 0,
      resetTime: 0,
    }
  }
}
