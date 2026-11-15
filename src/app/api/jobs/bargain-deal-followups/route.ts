import { NextRequest, NextResponse } from 'next/server'
import { processBargainDealFollowups } from '@/lib/jobs/processBargainDealFollowups'
import { requireJobAuth } from '@/lib/job-auth'
import { sendAlertOnError } from '@/lib/alerter'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET|POST /api/jobs/bargain-deal-followups — remind shoppers who accepted a
// bargain but never paid (Phase 5). Job-authenticated like every other job.
async function run(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError
  try {
    const result = await processBargainDealFollowups()
    return NextResponse.json({ status: 'ok', ...result })
  } catch (err: any) {
    await sendAlertOnError('bargain-deal-followups', err)
    return NextResponse.json({ status: 'error', message: err?.message ?? 'failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
