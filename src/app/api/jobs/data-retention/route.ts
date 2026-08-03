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
// Opt-out records are KEPT indefinitely — they are consent records, not processed data.

const CART_RETENTION_DAYS = 90
const BARGAIN_RETENTION_DAYS = 90
const LOG_RETENTION_DAYS = 180
const TOKEN_RETENTION_DAYS = 7

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const now = new Date()
    const cartCutoff = new Date(now.getTime() - CART_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const bargainCutoff = new Date(now.getTime() - BARGAIN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const logCutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const tokenCutoff = new Date(now.getTime() - TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000)

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

    // 2. Delete old bargain sessions (cascades BargainMessage rows).
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

    return NextResponse.json({
      message: 'Data retention applied',
      status: 'ok',
      anonymizedCarts: anonymized.count,
      deletedBargainSessions: bargainSessions.count,
      deletedAccessLogs: logs.count,
      deletedVerificationTokens: tokens.count,
      policy: {
        cartPIIAnonymizedAfterDays: CART_RETENTION_DAYS,
        bargainSessionsDeletedAfterDays: BARGAIN_RETENTION_DAYS,
        accessLogsDeletedAfterDays: LOG_RETENTION_DAYS,
        verificationTokensDeletedAfterDays: TOKEN_RETENTION_DAYS,
      },
    })
  } catch (error) {
    console.error('Data retention job error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
