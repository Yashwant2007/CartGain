import { NextRequest, NextResponse } from 'next/server'
import { processRecoveryJourneys } from '@/lib/jobs/processRecoveryJourneys'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// This is the legacy behavioural-journey sender. The live recovery engine is
// `process-abandoned-carts`; keeping a second sender enabled by default would
// duplicate messages and bypass its round/consent accounting. It is opt-in and
// still requires the shared job secret.
function journeysEnabled(): boolean {
  return process.env.ENABLE_BEHAVIORAL_JOURNEYS === 'true'
}

export async function GET(req: NextRequest) {
  const authError = await requireJobAuth(req)
  if (authError) return authError
  if (!journeysEnabled()) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      reason: 'Set ENABLE_BEHAVIORAL_JOURNEYS=true to use the legacy sender',
    })
  }
  try {
    const result = await processRecoveryJourneys(100)
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('process-journeys error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
