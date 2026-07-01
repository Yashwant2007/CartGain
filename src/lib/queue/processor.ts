import { getQueue } from './index'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import { processRevenueShareBilling } from '@/lib/jobs/processRevenueShareBilling'

let processorRegistered = false

/**
 * Register job processor - only once
 */
function registerProcessor() {
  if (processorRegistered) return

  try {
    const queue = getQueue()

    queue.process(async (job: any) => {
      console.log(`Processing job ${job.id} (${job.data.action}) at ${new Date().toISOString()}`)

      try {
        if (job.data.action === 'process_billing') {
          const result = await processRevenueShareBilling()
          console.log(`Job ${job.id} billing result:`, result)
          return { success: true, timestamp: new Date().toISOString(), result }
        }

        // Default: cart processing
        const result = await processAbandonedCarts(25)
        console.log(`Job ${job.id} carts result:`, result)
        return { success: true, timestamp: new Date().toISOString(), result }
      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error.message)
        throw new Error(`Job ${job.data.action} failed: ${error.message}`)
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

    // Clear stale repeating jobs
    try {
      const repeatingJobs = await queue.getRepeatableJobs()
      for (const job of repeatingJobs) {
        if (job.key === 'process-carts-every-5-min' || job.key === 'process-billing-daily') {
          await queue.removeRepeatableByKey(job.key)
        }
      }
    } catch (error: any) {
      console.warn('Could not clear repeating jobs:', error.message)
    }

    // Cart processing — every 5 minutes
    await queue.add(
      { action: 'process_carts' },
      {
        repeat: {
          cron: '*/5 * * * *',
          key: 'process-carts-every-5-min',
        },
      }
    )

    // Revenue-share billing — daily at 02:00
    await queue.add(
      { action: 'process_billing' },
      {
        repeat: {
          cron: '0 2 * * *',
          key: 'process-billing-daily',
        },
      }
    )

    console.log('✅ Cart processing scheduled: Every 5 minutes')
    console.log('✅ Revenue share billing scheduled: Daily at 02:00')
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
