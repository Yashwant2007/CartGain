/**
 * Product event tracking (CartGain funnel).
 *
 * Zero third-party: events are written to the ProductEvent table in Postgres.
 * Environment separation: events are only recorded in production (or when
 * ENABLE_DEV_ANALYTICS=true) so dev/preview traffic never pollutes the funnel.
 *
 * Privacy: only accepts a userId/storeId (strings) and a small sanitized
 * `properties` bag. Never pass message contents, customer PII, payments, etc.
 */

import prisma from '@/lib/db'
import { redactSensitive } from '@/lib/data-protection'
import { currentEnvironment, currentRelease, isProduction } from '@/lib/observability/version'
import type { Prisma } from '@prisma/client'

export interface TrackEvent {
  name: string
  userId?: string | null
  storeId?: string | null
  properties?: Record<string, unknown>
}

const NAME_PATTERN = /^cartgain_[a-z0-9_]{2,64}$/

/** Allowed on the client-fired analytics endpoint (slash the noise). */
export const CLIENT_FIREABLE_EVENTS: ReadonlySet<string> = new Set([
  'cartgain_onboarding_started',
  'cartgain_onboarding_completed',
])

export function isValidEventName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

/**
 * Record a funnel event. Fire-and-forget: never blocks or throws on the hot
 * path. Production-only (unless ENABLE_DEV_ANALYTICS=true). Properties are
 * sanitized before store.
 */
export async function track(event: TrackEvent): Promise<void> {
  if (!isValidEventName(event.name)) {
    console.warn(`[ANALYTICS] Dropping event with invalid name: ${event.name}`)
    return
  }

  if (!isProduction() && process.env.ENABLE_DEV_ANALYTICS !== 'true') {
    return
  }

  const properties = event.properties ? (redactSensitive(event.properties) as Record<string, unknown>) : undefined

  try {
    await prisma.productEvent.create({
      data: {
        name: event.name,
        environment: currentEnvironment(),
        release: currentRelease(),
        userId: event.userId || undefined,
        storeId: event.storeId || undefined,
        properties: (properties ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (error) {
    console.error('[ANALYTICS] Failed to record event:', error instanceof Error ? error.message : error)
  }
}