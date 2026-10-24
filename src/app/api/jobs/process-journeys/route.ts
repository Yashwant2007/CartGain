import { NextRequest, NextResponse } from 'next/server'
import { processRecoveryJourneys } from '@/lib/jobs/processRecoveryJourneys'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function verifyJobAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization')
  const secret = process.env.JOB_SECRET
  if (!secret) return true
  if (authHeader === `Bearer ${secret}`) return true
  const token = req.nextUrl.searchParams.get('token')
  return token === secret
}

export async function GET(req: NextRequest) {
  if (!verifyJobAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
