import { NextResponse } from 'next/server'
import { getQueue, isQueueEnabled } from '@/lib/queue'
import { redisPing } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const redisLatency = await redisPing()
    const redisAvailable = redisLatency !== null
    const queueEnabled = isQueueEnabled()
    const queue = queueEnabled ? getQueue() : null

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
      redisLatencyMs: redisLatency,
      queue: queue ? 'initialized' : 'disabled',
      queueEnabled,
      jobs: jobCounts,
      status: redisAvailable && (!queueEnabled || queue) ? 'healthy' : 'degraded',
    })
  } catch (error) {
    console.error('Queue health error:', error)
    return NextResponse.json({ status: 'error', message: 'Queue health check failed' }, { status: 500 })
  }
}
