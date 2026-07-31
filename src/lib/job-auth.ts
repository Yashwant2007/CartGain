import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export function isJobAuthorized(request: NextRequest): boolean {
  const configuredSecret = (process.env.JOB_SECRET || process.env.CRON_SECRET || '')
    .replace(/^["']|["']$/g, '')
    .trim()

  if (!configuredSecret) {
    console.error('[JOB_AUTH] JOB_SECRET/CRON_SECRET is not set — job endpoints are disabled. Set a strong secret in production.')
    return false
  }

  const headerSecret = request.headers.get('x-job-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  const authorized =
    (headerSecret !== null && constantTimeEqual(headerSecret, configuredSecret)) ||
    (bearer !== undefined && constantTimeEqual(bearer, configuredSecret))

  return authorized
}
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function requireJobAuth(request: NextRequest): Promise<NextResponse | null> {
  if (isJobAuthorized(request)) return null

  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
}

export function isTestEndpointAllowed(): boolean {
  const allowed = process.env.ALLOW_TEST_ENDPOINTS === 'true'
  if (!allowed) {
    console.warn('[SECURITY] Test endpoint blocked — set ALLOW_TEST_ENDPOINTS=true to enable')
  }
  return allowed
}
