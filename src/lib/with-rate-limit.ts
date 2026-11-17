import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, checkSimpleRateLimit } from './rate-limit'

export interface RateLimitOptions {
  maxAttempts?: number
  windowMs?: number
  key?: string
}

export function retryAfterSeconds(resetTime: number, now: number = Date.now()): number {
  if (!Number.isFinite(resetTime) || resetTime <= 0 || !Number.isFinite(now)) return 1
  const seconds = Math.ceil((resetTime - now) / 1000)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1
}

export async function withRateLimit(
  request: NextRequest,
  handler: () => Promise<NextResponse>,
  options: RateLimitOptions = {}
): Promise<NextResponse> {
  const { maxAttempts = 30, windowMs = 60_000 } = options

  const endpoint = options.key || new URL(request.url).pathname

  const result = await checkRateLimit(endpoint, { maxAttempts, windowMs })

  if (!result.success) {
    return NextResponse.json(
      { message: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds(result.resetTime)),
          'X-RateLimit-Limit': String(maxAttempts),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  const response = await handler()
  response.headers.set('X-RateLimit-Limit', String(maxAttempts))
  response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  return response
}
