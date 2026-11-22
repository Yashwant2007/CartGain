import { NextRequest, NextResponse } from 'next/server'
import { processRevenueShareBilling } from '@/lib/jobs/processRevenueShareBilling'
import { processRazorpayBilling } from '@/lib/jobs/processRazorpayBilling'
import { sendAlertOnError } from '@/lib/alerter'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const shopifyResult = await processRevenueShareBilling()
    let razorpayResult: Awaited<ReturnType<typeof processRazorpayBilling>> | null = null
    try {
      razorpayResult = await processRazorpayBilling()
    } catch (error) {
      console.warn('Razorpay billing sweep skipped:', error instanceof Error ? error.message : error)
    }

    return NextResponse.json({
      message: 'Revenue share billing processed',
      status: 'processed',
      result: shopifyResult,
      razorpayResult,
    })
  } catch (error) {
    console.error('Revenue share billing cron error:', error)
    sendAlertOnError('Revenue share billing cron', error).catch(() => {})
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
