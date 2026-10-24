import { NextResponse } from 'next/server'
import { hasRedis } from '@/lib/queue'
import { getQueue } from '@/lib/queue'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const redisAvailable = hasRedis()
    const queue = getQueue()
    
    let jobCounts: any = null
    if (queue) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ])
        jobCounts = { waiting, active, completed, failed, delayed }
      } catch (e) {
        console.error('Failed to get queue counts:', e)
      }
    }
    
    return NextResponse.json({
      redis: redisAvailable,
      queue: queue ? 'initialized' : 'fallback',
      jobs: jobCounts,
      status: redisAvailable && queue ? 'healthy' : 'degraded',
    })
  } catch (error) {
    console.error('Queue health error:', error)
    return NextResponse.json({ status: 'error', message: 'Queue health check failed' }, { status: 500 })
  }
}
