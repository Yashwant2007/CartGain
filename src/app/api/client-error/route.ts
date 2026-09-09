import { NextRequest, NextResponse } from 'next/server'
import { captureError } from '@/lib/observability/logger'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_MESSAGE = 2000
const MAX_STACK = 8000
const MAX_BATCH = 10

interface ClientErrorInput {
  message?: unknown
  stack?: unknown
  operation?: unknown
}

// Client error ingestion. Accepts sanitized, anonymous frontend exceptions and
// stores them in ErrorLog (component=frontend) so uncaught JS errors are
// visible from the same surface as server errors. Public endpoint, rate limited
// per IP, values truncated server-side regardless of what the client sends.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rate = await checkSimpleRateLimit(`client_error_${ip}`)
  if (!rate.allowed) {
    return NextResponse.json({}, { status: 429 })
  }

  let body: { events?: ClientErrorInput[]; page?: unknown } & ClientErrorInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({}, { status: 400 })
  }

  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [body]
  const page = String(body?.page ?? req.nextUrl.pathname ?? '').slice(0, 300)

  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const message = String(event?.message ?? 'Unknown client error').slice(0, MAX_MESSAGE)
    const stack = typeof event?.stack === 'string' ? event.stack.slice(0, MAX_STACK) : undefined
    const operation = String(event?.operation ?? 'uncaught').slice(0, 200)

    // Never persist raw secrets or PII — captureError sanitizes on the way through.
    await captureError({
      level: 'error',
      component: 'frontend',
      operation,
      message,
      meta: stack ? { stack, page } : { page },
      req,
      persist: true,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}