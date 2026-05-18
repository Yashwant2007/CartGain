import { NextRequest, NextResponse } from 'next/server'
import { initializeQueues } from '@/lib/queue/init'

export const dynamic = 'force-dynamic'

/**
 * Initialize Bull queues and schedule recurring jobs
 * Call this endpoint once when your app starts
 */
export async function GET(request: NextRequest) {
  try {
    await initializeQueues()

    return NextResponse.json({
      message: 'Queues initialized successfully',
      status: 'ready',
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Initialization error:', error)
    return NextResponse.json(
      {
        message: 'Queue initialization attempted',
        status: 'warning',
        error: error.message,
        note: 'Make sure Redis is running on localhost:6379',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  }
}
