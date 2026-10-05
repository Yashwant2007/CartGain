import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getQueue } from '@/lib/queue'
import { getAiHealth } from '@/lib/ai-client'
import { currentEnvironment, currentRelease } from '@/lib/observability/version'

export const dynamic = 'force-dynamic'

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  environment: string
  release: string
  checks: {
    database: { status: 'ok' | 'error'; latencyMs: number; error?: string }
    redis: { status: 'ok' | 'degraded' | 'error'; latencyMs?: number; error?: string }
    env: { status: 'ok' | 'degraded'; missing: string[]; unpadded?: boolean }
    ai: {
      status: 'ok' | 'degraded'
      activeTier: 'primary' | 'fallback' | 'none'
      primary: { configured: boolean }
      fallback: { configured: boolean; tripped: boolean; model: string; baseUrl: string }
    }
    version: string
  }
}

export async function GET() {
  const start = Date.now()
  const missing: string[] = []

  const requiredVars = [
    'DATABASE_URL',
    'NEXTAUTH_URL',
    'NEXTAUTH_SECRET',
    'RESEND_API_KEY',
    'OPENAI_API_KEY',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'ENCRYPTION_KEY',
    // Shopify drives installs, OAuth and every webhook delivery. When these
    // went missing nothing else reported it: the health check stayed green
    // while installs redirected to an error page and every webhook 401'd.
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
  ]
  const optionalVars = [
    'WHATSAPP_BUSINESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'JOB_SECRET',
    'ALERT_EMAIL',
  ]

  const requiredMissing = missing.filter((k) => requiredVars.includes(k))
  const optionalMissing = missing.filter((k) => optionalVars.includes(k))

  for (const key of requiredVars) {
    if (!process.env[key]) requiredMissing.push(key)
  }

  for (const key of optionalVars) {
    if (!process.env[key]) optionalMissing.push(key)
  }

  // Secrets pasted into the Vercel dashboard frequently arrive with a
  // trailing newline. Read sites now trim, so this cannot silently break
  // HMAC again — but padding is a reliable tell that the value was pasted
  // rather than copied from the Partner Dashboard, and the same sloppiness
  // tends to affect other vars. Surface it instead of trusting it.
  const unpadded: string[] = []
  for (const key of [...requiredVars, ...optionalVars]) {
    const value = process.env[key]
    if (value && value !== value.trim()) unpadded.push(key)
  }

  // Names go to the logs, not the response: /api/health is unauthenticated, so
  // the response must not reveal which variables this app depends on.
  if (unpadded.length > 0) {
    console.warn(
      `[health] ${unpadded.length} env var(s) carry surrounding whitespace: ${unpadded.join(', ')}. ` +
      `Read sites trim, so these still work — re-paste them without padding.`,
    )
  }

  // Database check
  let dbStatus: HealthStatus['checks']['database'] = { status: 'ok', latencyMs: 0 }
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbStatus.latencyMs = Date.now() - dbStart
  } catch {
    dbStatus = {
      status: 'error',
      latencyMs: Date.now() - start,
      error: 'Database unreachable',
    }
  }

  // Redis / queue check
  let redisStatus: HealthStatus['checks']['redis'] = { status: 'ok' }
  try {
    const redisStart = Date.now()
    const queue = getQueue()
    if (queue && typeof queue.isReady === 'function') {
      await queue.isReady()
      redisStatus.latencyMs = Date.now() - redisStart
    } else if (queue) {
      redisStatus = { status: 'ok', latencyMs: Date.now() - redisStart }
    } else {
      redisStatus = { status: 'degraded', error: 'Queue not initialized (Redis unavailable, using direct processing)' }
    }
  } catch {
    redisStatus = {
      status: 'degraded',
      error: 'Redis unavailable',
    }
  }

  const ai = getAiHealth()
  const aiStatus: HealthStatus['checks']['ai'] = {
    status: ai.activeTier === 'none' ? 'degraded' : 'ok',
    activeTier: ai.activeTier,
    primary: { configured: ai.primary.configured },
    fallback: {
      configured: ai.fallback.configured,
      tripped: ai.fallback.tripped,
      model: ai.fallback.model,
      baseUrl: ai.fallback.baseUrl,
    },
  }

  const overall: HealthStatus['status'] =
    dbStatus.status === 'error' ? 'error' :
    requiredMissing.length > 0 || redisStatus.status === 'error' ? 'error' :
    redisStatus.status === 'degraded' || aiStatus.status === 'degraded' || optionalMissing.length > 0 ? 'degraded' :
    'ok'

  const body: HealthStatus = {
    status: overall,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: currentEnvironment(),
    release: currentRelease(),
    checks: {
      database: dbStatus,
      redis: redisStatus,
      env: {
        status: requiredMissing.length === 0 ? 'ok' : 'degraded',
        // Never expose WHICH variables are missing — an attacker would learn our stack.
        missing: requiredMissing.length > 0 ? ['N'] : [],
        // Boolean only, for the same reason: a count or list would leak the stack.
        unpadded: unpadded.length > 0,
      },
      ai: aiStatus,
      version: '1.0.0',
    },
  }

  const statusCode = overall === 'error' ? 503 : overall === 'degraded' ? 200 : 200

  return NextResponse.json(body, { status: statusCode })
}
