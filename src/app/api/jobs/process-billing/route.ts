import { NextRequest, NextResponse } from 'next/server'
import { processRevenueShareBilling } from '@/lib/jobs/processRevenueShareBilling'
import { sendAlertOnError } from '@/lib/alerter'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const result = await processRevenueShareBilling()

    return NextResponse.json({
      message: 'Revenue share billing processed',
      status: 'processed',
      result,
    })
  } catch (error) {
    console.error('Revenue share billing cron error:', error)
    sendAlertOnError('Revenue share billing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
