import { getQueue } from './index'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import type { Job } from 'bull'

let processorRegistered = false

/**
 * Register job processor - only once
 */
function registerProcessor() {
  if (processorRegistered) return

  try {
    const queue = getQueue()

    queue.process(async (job: Job) => {
      console.log(`Processing job ${job.id} at ${new Date().toISOString()}`)

      try {
        const result = await processAbandonedCarts(25)

        console.log(`Job ${job.id} result:`, result)

        return {
          success: true,
          timestamp: new Date().toISOString(),
          result,
        }
      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error.message)
        throw new Error(`Cart processing failed: ${error.message}`)
      }
    })

    processorRegistered = true
    console.log('✅ Job processor registered')
  } catch (error: any) {
    console.error('Failed to register processor:', error.message)
  }
}

export async function scheduleCartProcessing() {
  try {
    const queue = getQueue()

    // Register processor first
    registerProcessor()

    // Clear existing repeating jobs
    try {
      const repeatingJobs = await queue.getRepeatableJobs()
      for (const job of repeatingJobs) {
        if (job.key === 'process-carts-every-5-min') {
          await queue.removeRepeatableByKey(job.key)
        }
      }
    } catch (error: any) {
      console.warn('Could not clear repeating jobs:', error.message)
    }

    // Add recurring job
    await queue.add(
      { action: 'process_carts' },
      {
        repeat: {
          cron: '*/5 * * * *',
          key: 'process-carts-every-5-min',
        },
      }
    )

    console.log('✅ Cart processing scheduled: Every 5 minutes')
  } catch (error: any) {
    console.error('Failed to schedule cart processing:', error.message)
    // Don't throw - allow app to continue
  }
}

export async function addCartProcessingJob() {
  try {
    const queue = getQueue()
    registerProcessor()

    const job = await queue.add({ action: 'process_carts' })
    console.log(`Added cart processing job: ${job.id}`)
    return job
  } catch (error: any) {
    console.error('Failed to add cart processing job:', error.message)
    throw error
  }
}
