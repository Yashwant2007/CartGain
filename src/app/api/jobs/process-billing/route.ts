import { NextRequest, NextResponse } from 'next/server'
import { processRevenueShareBilling } from '@/lib/jobs/processRevenueShareBilling'
import { sendAlertOnError } from '@/lib/alerter'

export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = (process.env.JOB_SECRET || '').replace(/^["']|["']$/g, '').trim()
  if (!configuredSecret) return true // no secret set — allow (local/dev)

  const headerSecret = request.headers.get('x-job-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const querySecret = request.nextUrl.searchParams.get('secret')

  return (
    headerSecret === configuredSecret ||
    bearer === configuredSecret ||
    querySecret === configuredSecret
  )
}

/**
 * GET /api/jobs/process-billing
 *
 * Triggered daily at 02:00 by Vercel Cron / QStash / cron-job.org.
 * Finds all subscriptions whose billing period has ended, creates revenue-share
 * invoices, generates Razorpay payment links, and emails merchants.
 *
 * Protected by JOB_SECRET (same mechanism as /api/jobs/process-carts).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('Cron trigger: processing revenue share billing')
    const result = await processRevenueShareBilling()
    console.log('Revenue share billing complete:', result)

    return NextResponse.json({
      message: 'Revenue share billing processed',
      status: 'processed',
      result,
    })
  } catch (error) {
    console.error('Revenue share billing cron error:', error)
    sendAlertOnError('Revenue share billing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as Error).message },
      { status: 500 }
    )
  }
}

// POST — for schedulers that only support POST
export async function POST(request: NextRequest) {
  return GET(request)
}
