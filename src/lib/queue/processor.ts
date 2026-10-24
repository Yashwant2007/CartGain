import { getQueue } from './index'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import { processRevenueShareBilling } from '@/lib/jobs/processRevenueShareBilling'

let processorRegistered = false

function registerProcessor() {
  if (processorRegistered) return

  try {
    const queue = getQueue()
    if (!queue) return

    queue.process(async (job: any) => {
      console.log(`Processing job ${job.id} (${job.data?.action}) at ${new Date().toISOString()}`)

      try {
        if (job.data?.action === 'process_billing') {
          const result = await processRevenueShareBilling()
          console.log(`Job ${job.id} billing result:`, result)
          return { success: true, timestamp: new Date().toISOString(), result }
        }

        const result = await processAbandonedCarts(25)
        console.log(`Job ${job.id} carts result:`, result)
        return { success: true, timestamp: new Date().toISOString(), result }
      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error.message)
        throw new Error(`Job ${job.data?.action} failed: ${error.message}`)
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
    if (!queue) return

    registerProcessor()

    // Remove old repeatable jobs to avoid lock issues
    try {
      const repeatableJobs = await queue.getRepeatableJobs()
      for (const job of repeatableJobs) {
        await queue.removeRepeatableByKey(job.key).catch(() => {})
      }
    } catch {}

    await queue.add(
      { action: 'process_carts' },
      {
        repeat: {
          cron: '*/5 * * * *',
        },
        jobId: 'process-carts-recurring',
      }
    )

    await queue.add(
      { action: 'process_billing' },
      {
        repeat: {
          cron: '0 2 * * *',
        },
        jobId: 'process-billing-daily',
      }
    )

    console.log('✅ Cart processing scheduled: Every 5 minutes')
    console.log('✅ Revenue share billing scheduled: Daily at 02:00')
  } catch (error: any) {
    console.error('Failed to schedule cart processing:', error.message)
  }
}

export async function addCartProcessingJob() {
  try {
    const queue = getQueue()
    if (!queue) {
      const { processAbandonedCarts } = await import('@/lib/jobs/processAbandonedCarts')
      return await processAbandonedCarts(25)
    }
    registerProcessor()

    const job = await queue.add({ action: 'process_carts' }, { attempts: 1 })
    console.log(`Added cart processing job: ${job.id}`)
    return job
  } catch (error: any) {
    console.error('Failed to add cart processing job:', error.message)
    throw error
  }
}
