import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'
import { RazorpayConfigError } from '@/lib/billing/razorpay/config'
import { RazorpayBillingError, verifyRazorpayCheckout } from '@/lib/billing/razorpay/service'
import { captureError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit('razorpay-verify', { maxAttempts: 20, windowMs: 10 * 60 * 1000 })
  if (!rate.success) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  try {
    const auth = await getAuthContext(req)
    if (!auth?.user?.id) return unauthorizedResponse()

    const body = await req.json().catch(() => ({}))
    const subscriptionId = typeof body?.subscriptionId === 'string' ? body.subscriptionId.trim() : ''
    const paymentId = typeof body?.paymentId === 'string' ? body.paymentId.trim() : ''
    const signature = typeof body?.signature === 'string' ? body.signature.trim() : ''
    const storeId = typeof body?.storeId === 'string' ? body.storeId : auth.store?.id
    if (!subscriptionId || !paymentId || !signature || !storeId) {
      return NextResponse.json({ error: 'Missing Razorpay verification fields.' }, { status: 400 })
    }

    const result = await verifyRazorpayCheckout({
      userId: auth.user.id,
      storeId,
      subscriptionId,
      paymentId,
      signature,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof RazorpayBillingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (error instanceof RazorpayConfigError) {
      return NextResponse.json({ error: error.message, code: 'RAZORPAY_CONFIG_INVALID' }, { status: 503 })
    }
    await captureError({
      level: 'error',
      component: 'billing',
      operation: 'razorpay_verify_payment',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return NextResponse.json({ error: 'Could not verify Razorpay payment.' }, { status: 500 })
  }
}
