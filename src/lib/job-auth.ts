import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export function isJobAuthorized(request: NextRequest): boolean {
  const configuredSecret = (process.env.JOB_SECRET || '').replace(/^["']|["']$/g, '').trim()

  if (!configuredSecret) {
    console.warn('[JOB_AUTH] JOB_SECRET is not set — jobs are publicly accessible! Set a strong JOB_SECRET in production.')
    return true
  }

  const headerSecret = request.headers.get('x-job-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const querySecret = request.nextUrl.searchParams.get('secret')

  const authorized =
    headerSecret === configuredSecret ||
    bearer === configuredSecret ||
    querySecret === configuredSecret

  return authorized
}

export async function requireJobAuth(request: NextRequest): Promise<NextResponse | null> {
  if (isJobAuthorized(request)) return null

  const session = await getServerSession(authOptions)
  if (session?.user?.id) return null

  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
}

export function isTestEndpointAllowed(): boolean {
  const allowed = process.env.ALLOW_TEST_ENDPOINTS === 'true'
  if (!allowed) {
    console.warn('[SECURITY] Test endpoint blocked — set ALLOW_TEST_ENDPOINTS=true to enable')
  }
  return allowed
}
