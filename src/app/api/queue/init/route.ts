import { NextRequest, NextResponse } from 'next/server'
import { initializeQueues } from '@/lib/queue/init'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    await initializeQueues()

    return NextResponse.json({
      message: 'Queues initialized successfully',
      status: 'ready',
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      {
        message: 'Queue initialization attempted',
        status: 'warning',
        note: 'Make sure Redis is running on localhost:6379',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  }
}
