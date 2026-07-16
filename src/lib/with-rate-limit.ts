import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, checkSimpleRateLimit } from './rate-limit'

export interface RateLimitOptions {
  maxAttempts?: number
  windowMs?: number
  key?: string
}

export async function withRateLimit(
  request: NextRequest,
  handler: () => Promise<NextResponse>,
  options: RateLimitOptions = {}
): Promise<NextResponse> {
  const { maxAttempts = 30, windowMs = 60_000 } = options

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
  const endpoint = options.key || new URL(request.url).pathname

  const result = await checkRateLimit(`${endpoint}_${ip}`, { maxAttempts, windowMs })

  if (!result.success) {
    return NextResponse.json(
      { message: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(result.resetTime / 1000)),
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
