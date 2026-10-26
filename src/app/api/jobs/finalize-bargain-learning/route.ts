import { NextRequest, NextResponse } from 'next/server'
import { requireJobAuth } from '@/lib/job-auth'
import { finalizeStaleLearningOutcomes } from '@/lib/bargain/learning/outcomes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const result = await finalizeStaleLearningOutcomes()
    return NextResponse.json({
      status: 'ok',
      scanned: result.scanned,
      finalized: result.finalized,
    })
  } catch (error) {
    console.error('[BARGAIN_LEARNING_FINALIZE]', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
