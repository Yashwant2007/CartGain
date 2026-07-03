import { NextRequest, NextResponse } from 'next/server'
import { processRetryPayments } from '@/lib/jobs/processRetryPayments'
import { sendAlertOnError } from '@/lib/alerter'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = (process.env.JOB_SECRET || '').replace(/^["']|["']$/g, '').trim()
  if (!configuredSecret) return true

  const headerSecret = request.headers.get('x-job-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return (
    headerSecret === configuredSecret ||
    bearer === configuredSecret ||
    querySecret === configuredSecret
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const result = await processRetryPayments()

    return NextResponse.json({
      message: 'Retry payments processed',
      ...result,
    })
  } catch (error) {
    console.error('Retry payments job error:', error)
    sendAlertOnError('Retry payments cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const result = await processRetryPayments()

    return NextResponse.json({
      message: 'Retry payments processed',
      ...result,
    })
  } catch (error) {
    console.error('Retry payments job error:', error)
    sendAlertOnError('Retry payments cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as Error).message },
      { status: 500 }
    )
  }
}
