import { NextRequest, NextResponse } from 'next/server'
import { addCartProcessingJob } from '@/lib/queue/processor'
import { processAbandonedCarts } from '@/lib/jobs/processAbandonedCarts'
import { initializeQueues } from '@/lib/queue/init'
import { sendAlertOnError } from '@/lib/alerter'
import { syncAbandonedCheckouts } from '@/lib/shopify'
import { getRedis, redisSet, redisGet } from '@/lib/redis'
import prisma from '@/lib/db'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

const CURSOR_KEY = 'store_cursor'

async function getStoreCursor(): Promise<string | undefined> {
  const redis = getRedis()
  if (redis) {
    const cursor = await redisGet(CURSOR_KEY)
    if (cursor) return cursor
  }
  return undefined
}

async function saveStoreCursor(cursor: string | undefined): Promise<void> {
  if (!cursor) return
  const redis = getRedis()
  if (redis) {
    await redisSet(CURSOR_KEY, cursor, 30 * 60 * 1000)
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    initializeQueues().catch(() => {})

    try {
      const job = await addCartProcessingJob()
      return NextResponse.json({
        message: 'Cart processing job queued',
        jobId: job.id,
        status: 'queued',
      })
    } catch {
      const cursor = await getStoreCursor()
      const result = await processAbandonedCarts(25, cursor)
      if (result.nextCursor) {
        await saveStoreCursor(result.nextCursor)
      }
      return NextResponse.json({
        message: 'Carts processed directly',
        status: 'processed',
        result,
      })
    }
  } catch (error) {
    console.error('Process carts job error:', error)
    sendAlertOnError('Cart processing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    initializeQueues().catch(() => {})

    const jobId = request.nextUrl.searchParams.get('jobId')

    if (!jobId) {
      let syncedCheckouts = 0
      try {
        const cursor = await getStoreCursor()
        const stores = await prisma.store.findMany({
          where: { platform: 'shopify', isActive: true, apiKey: { not: null } },
          select: { id: true, domain: true, apiKey: true, shopifyRefreshToken: true, shopifyTokenExpiresAt: true },
          orderBy: { id: 'asc' },
        })
        let targetStores = stores
        if (cursor) {
          const cursorIdx = stores.findIndex(s => s.id === cursor)
          if (cursorIdx >= 0) targetStores = stores.slice(cursorIdx + 1)
        }
        const batch = targetStores.slice(0, 1)
        if (batch.length > 0) {
          const result = await syncAbandonedCheckouts(batch[0]).catch(() => 0)
          if (result === -1) {
            console.log(`Skipping store ${batch[0].domain} due to auth failure`)
          } else {
            syncedCheckouts = result
          }
          await saveStoreCursor(batch[0].id)
        }
      } catch (err) {
        console.error('Shopify checkout sync error:', err)
      }

      const cursor = await getStoreCursor()
      const result = await processAbandonedCarts(25, cursor)
      if (result.nextCursor) {
        await saveStoreCursor(result.nextCursor)
      }
      return NextResponse.json({
        message: 'Carts processed',
        status: 'processed',
        syncedCheckouts,
        result,
      })
    }

    const { getQueue } = await import('@/lib/queue')
    const queue = getQueue()
    const job = await queue.getJob(jobId)

    if (!job) {
      return NextResponse.json(
        { message: 'Job not found' },
        { status: 404 }
      )
    }

    const state = await job.getState()
    const progress = job.progress()

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
    })
  } catch (error) {
    console.error('Get job status error:', error)
    sendAlertOnError('Cart processing job status', error).catch(() => {})
    return NextResponse.json(
      { message: 'Failed to get job status' },
      { status: 500 }
    )
  }
}
