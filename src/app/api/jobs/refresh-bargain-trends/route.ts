import { NextRequest, NextResponse } from 'next/server'
import { requireJobAuth } from '@/lib/job-auth'
import { refreshBargainTrends } from '@/lib/bargain/trend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const result = await refreshBargainTrends()
    return NextResponse.json({
      status: 'ok',
      enabled: result.enabled,
      storesRefreshed: result.stores,
      signalsRefreshed: result.signals,
      storesSkipped: result.skipped,
    })
  } catch (error) {
    console.error('[BARGAIN_TREND_REFRESH]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
