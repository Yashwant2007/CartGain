import { setupQueueListeners, hasRedis, startFallbackProcessor } from './index'
import { scheduleCartProcessing } from './processor'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'

let initialized = false

export async function initializeQueues() {
  if (initialized) {
    console.log('Queues already initialized')
    return
  }

  initialized = true

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
