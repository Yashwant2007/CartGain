import { NextRequest, NextResponse } from 'next/server'
import { getRazorpayConfig, RazorpayConfigError } from '@/lib/billing/razorpay/config'
import { verifyRazorpayWebhookSignature } from '@/lib/billing/razorpay/signature'
import { processRazorpayWebhook } from '@/lib/billing/razorpay/service'
import { captureError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let rawBody = ''
  try {
    rawBody = await req.text()
    const config = getRazorpayConfig()
    const signature = req.headers.get('x-razorpay-signature')
    if (!verifyRazorpayWebhookSignature(rawBody, signature, config.webhookSecret)) {
      await captureError({
        level: 'error',
        component: 'billing',
        operation: 'razorpay_webhook_invalid_signature',
        message: 'Rejected Razorpay webhook with invalid signature',
        req,
        persist: true,
        statusCode: 401,
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(rawBody)
    const eventId = req.headers.get('x-razorpay-event-id') || event?.id || null
    const result = await processRazorpayWebhook(event, eventId)
    const retryable = ['no_matching_subscription', 'amount_mismatch', 'invoice_not_found'].includes(String(result?.reason || ''))
    return NextResponse.json(
      { received: true, ...result, ...(retryable ? { error: `Webhook not processed: ${result.reason}` } : {}) },
      { status: retryable ? 503 : 200 },
    )
  } catch (error) {
    if (error instanceof RazorpayConfigError) {
      return NextResponse.json({ error: error.message, code: 'RAZORPAY_CONFIG_INVALID' }, { status: 503 })
    }
    await captureError({
      level: 'error',
      component: 'billing',
      operation: 'razorpay_webhook_processing',
      error,
      req,
      persist: true,
      statusCode: 500,
      meta: { bodyLength: rawBody.length },
    })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', provider: 'razorpay' })
}
