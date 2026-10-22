import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    const latency = Date.now() - start
    return NextResponse.json({ 
      status: 'ok', 
      latencyMs: latency,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
