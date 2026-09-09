/**
 * Central error/telemetry logger.
 *
 * - Structured console output per severity (info | warn | error | critical).
 * - Every ERROR/CRITICAL is persisted to the ErrorLog table, grouped by
 *   `signature` so the same bug shows up once with an affected count.
 * - Sanitization is applied BEFORE anything reaches the console, the DB, or an
 *   alert email (redactSensitive + token/password masking).
 * - CRITICAL errors and per-component error spikes trigger a deduplicated
 *   email alert via the existing alerter (Redis- or memory-cooldown guarded).
 *
 * This module is server-only — it imports the DB and emailer. Never import it
 * from client components.
 */

import type { NextRequest } from 'next/server'
import prisma from '@/lib/db'
import { redactSensitive } from '@/lib/data-protection'
import { sendAlert } from '@/lib/alerter'
import { redisSetNX, redisIncr, redisExpire } from '@/lib/redis'
import { currentRelease, currentEnvironment } from './version'

export type LogLevel = 'info' | 'warn' | 'error' | 'critical'
export type LogComponent =
  | 'auth'
  | 'oauth'
  | 'webhook'
  | 'billing'
  | 'queue'
  | 'database'
  | 'shopify'
  | 'ai'
  | 'messaging'
  | 'email'
  | 'dashboard'
  | 'frontend'
  | 'campaigns'
  | 'system'

export interface CaptureErrorOptions {
  component: LogComponent
  operation: string
  error?: unknown
  message?: string
  req?: NextRequest
  userId?: string | null
  storeId?: string | null
  statusCode?: number
  meta?: Record<string, unknown>
  /** Override level (default 'error'). */
  level?: 'error' | 'critical'
  /** Set false to emit console + alert but skip DB writes (e.g. in tests). */
  persist?: boolean
}

const SECRET_VALUE_PATTERNS = [
  /sk_live_/, /sk_test_/, /shpat_/, /EAAB/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /rzp_(live|test)_/, /AKIA[A-Z0-9]{16}/, /ghp_[A-Za-z0-9]{36}/,
]

function maskSecretValues(input: unknown): unknown {
  if (typeof input === 'string') {
    let out = input
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(out)) out = '[redacted-secret]'
    }
    return out
  }
  if (Array.isArray(input)) return input.map(maskSecretValues)
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = maskSecretValues(v)
    return out
  }
  return input
}

function sanitize(value: unknown): unknown {
  return maskSecretValues(redactSensitive(value))
}

function safeString(value: unknown): string {
  try {
    const cleaned = sanitize(value)
    if (typeof cleaned === 'string') return cleaned.slice(0, 2000)
    return JSON.stringify(cleaned)?.slice(0, 2000) ?? 'unknown'
  } catch {
    return String(value).slice(0, 2000)
  }
}

function extractErrorName(error: unknown): string {
  if (error instanceof Error) return error.name || 'UnknownError'
  return typeof error === 'string' ? 'StringError' : 'UnknownError'
}

function traceIdFromReq(req?: NextRequest): string | undefined {
  return req?.headers.get('x-request-id') || undefined
}

export function makeSignature(component: string, operation: string, error: unknown): string {
  return `${component}::${operation}::${extractErrorName(error)}`.slice(0, 300)
}

export interface StructuredLog {
  ts: string
  level: LogLevel
  component: string
  operation: string
  message: string
  traceId?: string
  release?: string
  environment?: string
  userId?: string
  storeId?: string
  path?: string
  meta?: unknown
}

function emitLog(entry: StructuredLog): void {
  const line = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.component}] ${entry.operation} ${entry.message}` +
    (entry.traceId ? ` (trace=${entry.traceId})` : '') +
    (entry.meta !== undefined ? ` — ${safeString(entry.meta)}` : '')
  if (entry.level === 'error' || entry.level === 'critical') console.error(line)
  else if (entry.level === 'warn') console.warn(line)
  else console.log(line)
}

/** 10-minute cooldown per component::operation for CRITICAL alert emails. */
async function notifyCriticalDeduped(component: string, operation: string, entry: StructuredLog): Promise<void> {
  const cooldownKey = `alert:critical:${component}:${operation}`
  try {
    const fresh = await redisSetNX(cooldownKey, '1', 10 * 60 * 1000)
    if (!fresh) return // alert already sent recently
  } catch {
    // Redis down — fall back to a per-process cooldown map.
    if (criticalCooldowns.has(cooldownKey)) return
    criticalCooldowns.set(cooldownKey, Date.now())
    setTimeout(() => criticalCooldowns.delete(cooldownKey), 10 * 60 * 1000).unref?.()
  }
  await sendAlert(
    `[CRITICAL] ${component} failed — ${operation}`,
    `${entry.message}\n\nTrace: ${entry.traceId || 'n/a'} · Release: ${entry.release || 'n/a'} · Env: ${entry.environment || 'n/a'}`,
  ).catch(() => {})
}

const criticalCooldowns = new Map<string, number>()

/** 15-minute cooldown per component for error-spike alerts. */
async function notifySpikeDeduped(component: string, operation: string, entry: StructuredLog): Promise<void> {
  const spikeKey = `alert:spike:${component}`
  try {
    const fresh = await redisSetNX(spikeKey, '1', 15 * 60 * 1000)
    if (!fresh) return
  } catch {
    if (spikeCooldowns.has(spikeKey)) return
    spikeCooldowns.set(spikeKey, Date.now())
    setTimeout(() => spikeCooldowns.delete(spikeKey), 15 * 60 * 1000).unref?.()
  }
  await sendAlert(
    `Error spike detected — ${component}`,
    `More than ${SPIKE_THRESHOLD} errors from [${component}] in the last hour while processing [${operation}].\n\nRecent: ${entry.message}\nTrace: ${entry.traceId || 'n/a'} · Release: ${entry.release || 'n/a'}`,
  ).catch(() => {})
}

const spikeCooldowns = new Map<string, number>()

const SPIKE_THRESHOLD = 20
const SPIKE_WINDOW_SECONDS = 3600

async function maybeAlertSpike(component: string, operation: string, entry: StructuredLog): Promise<void> {
  try {
    const key = `errrate:${component}:${Math.floor(Date.now() / (SPIKE_WINDOW_SECONDS * 1000))}`
    const count = await redisIncr(key)
    if (count === 1) await redisExpire(key, SPIKE_WINDOW_SECONDS)
    if (count === SPIKE_THRESHOLD) {
      await notifySpikeDeduped(component, operation, entry)
    }
  } catch {
    // Redis down — spikes degrade to CRITICAL-level deduped alerts only.
  }
}

/**
 * Record a server-side error. Writes a structured console line, persists to
 * ErrorLog (grouped by signature), and raises deduped alerts for CRITICAL and
 * error spikes. Never throws — observability must not take the app down.
 */
export async function captureError(options: CaptureErrorOptions): Promise<void> {
  const { component, operation, userId, storeId, statusCode, meta, persist = true } = options
  const message = options.message ?? (options.error instanceof Error ? options.error.message : safeString(options.error))
  const req = options.req
  const level = options.level ?? 'error'

  const safeMeta = meta !== undefined ? sanitize(meta) : undefined
  const entry: StructuredLog = {
    ts: new Date().toISOString(),
    level,
    component,
    operation,
    message: safeString(message),
    traceId: traceIdFromReq(req),
    release: currentRelease(),
    environment: currentEnvironment(),
    userId: userId || undefined,
    storeId: storeId || undefined,
    path: req?.nextUrl.pathname || undefined,
    meta: safeMeta,
  }

  emitLog(entry)

  if (level === 'critical') {
    await notifyCriticalDeduped(component, operation, entry)
  }

  if (persist) {
    const signature = makeSignature(component, operation, options.error)
    try {
      await prisma.errorLog.create({
        data: {
          level,
          component,
          operation,
          message: entry.message,
          stack: options.error instanceof Error ? (options.error.stack ?? undefined)?.slice(0, 8000) : undefined,
          signature,
          method: req?.method || undefined,
          path: entry.path,
          statusCode,
          traceId: entry.traceId,
          release: entry.release,
          environment: entry.environment,
          userId: userId || undefined,
          storeId: storeId || undefined,
        },
      })
    } catch (error) {
      console.error('[OBS] Failed to persist ErrorLog:', error instanceof Error ? error.message : error)
    }
  }

  if (level === 'error') {
    await maybeAlertSpike(component, operation, entry)
  }
}

/** Lightweight structured INFO/WARN logging (console only, no DB writes). */
export function logInfo(component: LogComponent | string, operation: string, message: string, meta?: Record<string, unknown>): void {
  emitLog({
    ts: new Date().toISOString(),
    level: 'info',
    component,
    operation,
    message,
    release: currentRelease(),
    environment: currentEnvironment(),
    meta: meta !== undefined ? sanitize(meta) : undefined,
  })
}

export function logWarn(component: LogComponent | string, operation: string, message: string, meta?: Record<string, unknown>): void {
  emitLog({
    ts: new Date().toISOString(),
    level: 'warn',
    component,
    operation,
    message,
    release: currentRelease(),
    environment: currentEnvironment(),
    meta: meta !== undefined ? sanitize(meta) : undefined,
  })
}