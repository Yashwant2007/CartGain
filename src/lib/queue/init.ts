import { setupQueueListeners, hasRedis, startFallbackProcessor, isQueueEnabled } from './index'
import { scheduleCartProcessing } from './processor'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'

let initialized = false

export async function initializeQueues() {
  if (initialized) {
    console.log('Queues already initialized')
    return
  }

  initialized = true

  // Vercel has no long-lived worker. The cart sweep is invoked by cron/GitHub
  // and processes inline, so creating Bull connections (or an in-process
  // interval) only produces ETIMEDOUT noise. Opt in only for a real worker.
  if (!isQueueEnabled()) {
    console.log('Redis queue disabled (ENABLE_REDIS_QUEUE is not true) - using inline processing')
    return
  }

  if (hasRedis()) {
    try {
      console.log('Initializing Bull queues with Redis...')
      setupQueueListeners()
      await scheduleCartProcessing()
      console.log('Bull queues initialized successfully')
      return
    } catch (error: any) {
      console.warn('Redis init failed:', error.message)
    }
  }

  console.log('Starting fallback processor (no Redis)')
  startFallbackProcessor(processAbandonedCarts)
}
