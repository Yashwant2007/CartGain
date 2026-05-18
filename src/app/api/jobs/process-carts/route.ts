import { NextRequest, NextResponse } from 'next/server'
import { addCartProcessingJob } from '@/lib/queue/processor'

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

    // Add job to Bull queue manually
    const job = await addCartProcessingJob()

    return NextResponse.json({
      message: 'Cart processing job queued',
      jobId: job.id,
      status: 'queued',
    })
  } catch (error) {
    console.error('Process carts job error:', error)
    return NextResponse.json(
      { message: 'Something went wrong', error: (error as any).message },
      { status: 500 }
    )
  }
}

// GET endpoint to check job status
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { message: 'jobId parameter required' },
        { status: 400 }
      )
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
