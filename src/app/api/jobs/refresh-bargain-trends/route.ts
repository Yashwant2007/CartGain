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
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[BARGAIN_TREND_REFRESH]', error?.message ?? error)
    return NextResponse.json({ message: 'Trend refresh failed' }, { status: 500 })
  }
}
