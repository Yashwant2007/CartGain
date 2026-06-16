import { NextRequest, NextResponse } from 'next/server'
import { addCartProcessingJob } from '@/lib/queue/processor'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const configuredSecret = process.env.JOB_SECRET
    if (configuredSecret) {
      const incomingSecret = request.headers.get('x-job-secret')
      if (incomingSecret !== configuredSecret) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
      }
    }

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
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as any).message },
      { status: 500 }
    )
  }
}

// GET endpoint — used by Vercel Cron Jobs to process carts
export async function GET(request: NextRequest) {
  try {
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
    return NextResponse.json(
      { message: 'Failed to get job status' },
      { status: 500 }
    )
  }
}
