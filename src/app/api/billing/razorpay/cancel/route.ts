import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'
import { RazorpayConfigError } from '@/lib/billing/razorpay/config'
import { RazorpayBillingError, cancelWooCommerceRazorpaySubscription } from '@/lib/billing/razorpay/service'
import { captureError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req)
    if (!auth?.user?.id) return unauthorizedResponse()

    const body = await req.json().catch(() => ({}))
    const storeId = typeof body?.storeId === 'string' ? body.storeId : auth.store?.id
    if (!storeId) {
      return NextResponse.json({ error: 'A WooCommerce store is required.', code: 'STORE_REQUIRED' }, { status: 400 })
    }

    const result = await cancelWooCommerceRazorpaySubscription(auth.user.id, storeId)
    return NextResponse.json(result)
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
      operation: 'razorpay_cancel_subscription',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return NextResponse.json({ error: 'Could not cancel Razorpay subscription.' }, { status: 500 })
  }
}
