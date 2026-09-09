import { NextRequest, NextResponse } from 'next/server'
import { requireJobAuth } from '@/lib/job-auth'
import { getBusinessMetrics } from '@/lib/metrics'
import { captureError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = await requireJobAuth(req)
  if (auth) return auth

  try {
    const metrics = await getBusinessMetrics()
    return NextResponse.json(metrics)
  } catch (error) {
    await captureError({
      level: 'error',
      component: 'system',
      operation: 'fetch_metrics',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return NextResponse.json({ message: 'Failed to fetch metrics' }, { status: 500 })
  }
}