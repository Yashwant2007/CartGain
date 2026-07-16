import { NextRequest, NextResponse } from 'next/server'
import { processRetryPayments } from '@/lib/jobs/processRetryPayments'
import { sendAlertOnError } from '@/lib/alerter'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const result = await processRetryPayments()

    return NextResponse.json({
      message: 'Retry payments processed',
      ...result,
    })
  } catch (error) {
    console.error('Retry payments job error:', error)
    sendAlertOnError('Retry payments cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
