import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getQueue } from '@/lib/queue'

export const dynamic = 'force-dynamic'

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  checks: {
    database: { status: 'ok' | 'error'; latencyMs: number; error?: string }
    redis: { status: 'ok' | 'degraded' | 'error'; latencyMs?: number; error?: string }
    env: { status: 'ok' | 'degraded'; missing: string[] }
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
  ]
  const optionalVars = [
    'WHATSAPP_BUSINESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'MSG91_AUTH_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'JOB_SECRET',
    'ALERT_EMAIL',
  ]

  for (const key of requiredVars) {
    if (!process.env[key]) missing.push(key)
  }

  for (const key of optionalVars) {
    if (!process.env[key]) missing.push(key)
  }

  // Database check
  let dbStatus: HealthStatus['checks']['database'] = { status: 'ok', latencyMs: 0 }
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbStatus.latencyMs = Date.now() - dbStart
  } catch (e) {
    dbStatus = {
      status: 'error',
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
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
  } catch (e) {
    redisStatus = {
      status: 'degraded',
      error: e instanceof Error ? e.message : String(e),
    }
  }

  const overall: HealthStatus['status'] =
    dbStatus.status === 'error' ? 'error' :
    missing.some(k => requiredVars.includes(k)) || redisStatus.status === 'error' ? 'error' :
    missing.length > 0 || redisStatus.status === 'degraded' ? 'degraded' :
    'ok'

  const body: HealthStatus = {
    status: overall,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: dbStatus,
      redis: redisStatus,
      env: {
        status: missing.length === 0 ? 'ok' : 'degraded',
        missing,
      },
      version: '1.0.0',
    },
  }

  const statusCode = overall === 'error' ? 503 : overall === 'degraded' ? 200 : 200

  return NextResponse.json(body, { status: statusCode })
}
