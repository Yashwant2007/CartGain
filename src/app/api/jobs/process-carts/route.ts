import { NextRequest, NextResponse } from 'next/server'
import { addCartProcessingJob } from '@/lib/queue/processor'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import { initializeQueues } from '@/lib/queue/init'
import { sendAlertOnError } from '@/lib/alerter'

export const dynamic = 'force-dynamic'

/**
 * Validate the request against JOB_SECRET. Accepts the secret via:
 *  - `x-job-secret` header
 *  - `Authorization: Bearer <secret>` header (Vercel Cron / QStash style)
 *  - `?secret=<secret>` query param (for schedulers that only configure a URL)
 * Returns true when authorized (or when no secret is configured, e.g. local dev).
 */
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

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Ensure queue processors are running (idempotent)
    initializeQueues().catch(() => {})

    // Try Redis queue first, fall back to direct processing
    try {
      const job = await addCartProcessingJob()
      return NextResponse.json({
        message: 'Cart processing job queued',
        jobId: job.id,
        status: 'queued',
      })
    } catch {
      console.log('Redis not available — processing carts directly')
      const result = await processAbandonedCarts(25)
      return NextResponse.json({
        message: 'Carts processed directly',
        status: 'processed',
        result,
      })
    }
  } catch (error) {
    console.error('Process carts job error:', error)
    sendAlertOnError('Cart processing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as any).message },
      { status: 500 }
    )
  }
}

// GET endpoint — used by external schedulers (QStash / cron-job.org / Vercel Cron)
export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Ensure queue processors are running (idempotent)
    initializeQueues().catch(() => {})

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      // No jobId — cron trigger, process carts directly
      console.log('Cron trigger: processing abandoned carts')
      const result = await processAbandonedCarts(25)
      return NextResponse.json({
        message: 'Carts processed',
        status: 'processed',
        result,
      })
    }

    const { getQueue } = await import('@/lib/queue')
    const queue = getQueue()
    const job = await queue.getJob(jobId)

    if (!job) {
      return NextResponse.json(
        { message: 'Job not found' },
        { status: 404 }
      )
    }

    const state = await job.getState()
    const progress = job.progress()
    const data = job.data
    const returnValue = job.returnvalue

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
      data,
      returnValue,
    })
  } catch (error) {
    console.error('Get job status error:', error)
    sendAlertOnError('Cart processing job status', error).catch(() => {})
    return NextResponse.json(
      { message: 'Failed to get job status' },
      { status: 500 }
    )
  }
}
