import { setupQueueListeners } from './index'
import './processor'
import { scheduleCartProcessing } from './processor'

let initialized = false

export async function initializeQueues() {
  if (initialized) {
    console.log('ℹ️ Queues already initialized')
    return
  }

  try {
    console.log('Initializing Bull queues...')

    // Setup event listeners
    setupQueueListeners()

    // Schedule recurring cart processing job
    await scheduleCartProcessing()

    initialized = true
    console.log('✅ Bull queues initialized successfully')
  } catch (error: any) {
    console.error('⚠️  Warning: Failed to initialize queues:', error.message)
    console.log('ℹ️  The app will continue running. Make sure Redis is running.')
    // Don't throw - app should still work
    initialized = true // Mark as attempted to avoid retries
  }
}
