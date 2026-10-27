import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Retention policy (matches privacy policy, DPDP Act 2023):
// - Cart PII (email/phone/name/items): anonymized 90 days after abandonment
// - Bargain sessions + messages: deleted 90 days after start (transient negotiation data)
// - Data access logs: deleted after 180 days
// - Verification tokens: deleted 7 days after expiry
// - Customer data exports: deleted after 180 days
// Opt-out records are KEPT indefinitely — they are consent records, not processed data.

const CART_RETENTION_DAYS = 90
const BARGAIN_RETENTION_DAYS = 90
const LEARNING_EVENT_RETENTION_DAYS = 180
const LEARNING_OUTCOME_RETENTION_DAYS = 90
const EXPERIENCE_EVENT_RETENTION_DAYS = 180
const LOG_RETENTION_DAYS = 180
const TOKEN_RETENTION_DAYS = 7
const EXPORT_RETENTION_DAYS = 180 // customer data exports deleted after 180 days

// GET is accepted as an alias for POST so external schedulers (cron-job.org and
// friends default to GET) can drive this job without a method-specific config.
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const now = new Date()
    const cartCutoff = new Date(now.getTime() - CART_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const bargainCutoff = new Date(now.getTime() - BARGAIN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const logCutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const tokenCutoff = new Date(now.getTime() - TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const exportCutoff = new Date(now.getTime() - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const learningOutcomeCutoff = new Date(now.getTime() - LEARNING_OUTCOME_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const learningEventDefaultCutoff = new Date(now.getTime() - LEARNING_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const experienceEventCutoff = new Date(now.getTime() - EXPERIENCE_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    // 1. Anonymize old carts (keep the row for billing/analytics integrity,
    //    remove all PII so the data can no longer identify a person).
    const anonymized = await prisma.cart.updateMany({
      where: {
        abandonedAt: { lt: cartCutoff },
        customerEmail: { not: null },
      },
      data: {
        customerEmail: null,
        customerPhone: null,
        customerName: null,
        items: '[]',
      },
    })

    // 2. Delete old bargain learning rows, then sessions (cascades messages).
    const learningConfigModel = (prisma as any).bargainLearningConfig
    const learningConfigs = await (learningConfigModel?.findMany?.({
      select: { storeId: true, eventRetentionDays: true },
    }) ?? Promise.resolve([]))
    const learningEventModel = (prisma as any).bargainLearningEvent
    const configuredStores: string[] = []
    let learningEventCount = 0
    for (const config of Array.isArray(learningConfigs) ? learningConfigs : []) {
      const storeId = String(config.storeId)
      configuredStores.push(storeId)
      const days = Math.min(730, Math.max(7, Number(config.eventRetentionDays) || LEARNING_EVENT_RETENTION_DAYS))
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      const deleted = await learningEventModel?.deleteMany?.({ where: { storeId, createdAt: { lt: cutoff } } })
      learningEventCount += Number(deleted?.count) || 0
    }
    const orphanEvents = await (learningEventModel?.deleteMany?.({
      where: {
        storeId: { notIn: configuredStores },
        createdAt: { lt: learningEventDefaultCutoff },
      },
    }) ?? Promise.resolve({ count: 0 }))
    learningEventCount += Number(orphanEvents?.count) || 0
    const learningOutcomes = await ((prisma as any).bargainLearningOutcome?.deleteMany({
      where: { createdAt: { lt: learningOutcomeCutoff } },
    }) ?? Promise.resolve({ count: 0 }))
    const experienceEvents = await prisma.bargainExperienceEvent.deleteMany({
      where: { receivedAt: { lt: experienceEventCutoff } },
    })
    const bargainSessions = await prisma.bargainSession.deleteMany({
      where: { startedAt: { lt: bargainCutoff } },
    })

    // 3. Delete old access logs.
    const logs = await prisma.dataAccessLog.deleteMany({
      where: { createdAt: { lt: logCutoff } },
    })

    // 4. Delete stale verification tokens.
    const tokens = await prisma.verificationToken.deleteMany({
      where: { expires: { lt: tokenCutoff } },
    })

    // 5. Delete old customer data exports (contain customer PII).
    const exports = await prisma.customerDataExport.deleteMany({
      where: { createdAt: { lt: exportCutoff } },
    })

    return NextResponse.json({
      message: 'Data retention applied',
      status: 'ok',
      anonymizedCarts: anonymized.count,
      deletedBargainSessions: bargainSessions.count,
      deletedBargainLearningEvents: learningEventCount,
      deletedBargainLearningOutcomes: learningOutcomes.count,
      deletedBargainExperienceEvents: experienceEvents.count,
      deletedAccessLogs: logs.count,
      deletedVerificationTokens: tokens.count,
      deletedCustomerDataExports: exports.count,
      policy: {
        cartPIIAnonymizedAfterDays: CART_RETENTION_DAYS,
        bargainSessionsDeletedAfterDays: BARGAIN_RETENTION_DAYS,
        bargainLearningEventsDeletedAfterDays: LEARNING_EVENT_RETENTION_DAYS,
        bargainLearningOutcomesDeletedAfterDays: LEARNING_OUTCOME_RETENTION_DAYS,
        bargainExperienceEventsDeletedAfterDays: EXPERIENCE_EVENT_RETENTION_DAYS,
        accessLogsDeletedAfterDays: LOG_RETENTION_DAYS,
        verificationTokensDeletedAfterDays: TOKEN_RETENTION_DAYS,
        customerDataExportsDeletedAfterDays: EXPORT_RETENTION_DAYS,
      },
    })
  } catch (error) {
    console.error('Data retention job error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
