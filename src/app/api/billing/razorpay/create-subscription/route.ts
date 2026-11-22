import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'
import { RazorpayConfigError } from '@/lib/billing/razorpay/config'
import { RazorpayPlanMismatchError, type RazorpayBillingPeriod } from '@/lib/billing/razorpay/plans'
import { RazorpayBillingError, startWooCommerceRazorpaySubscription } from '@/lib/billing/razorpay/service'
import { isWooCommercePlatform, resolveBillingStore } from '@/lib/billing/store-subscription'
import { captureError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit('razorpay-create-subscription', { maxAttempts: 10, windowMs: 5 * 60 * 1000 })
  if (!rate.success) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  try {
    const auth = await getAuthContext(req)
    if (!auth?.user?.id) return unauthorizedResponse()

    const body = await req.json().catch(() => ({}))
    const period: RazorpayBillingPeriod = body?.period === 'yearly' ? 'yearly' : 'monthly'
    const planId = typeof body?.plan === 'string' ? body.plan : ''
    if (!planId) return NextResponse.json({ error: 'Plan is required', code: 'PLAN_REQUIRED' }, { status: 400 })

    const store = await resolveBillingStore(auth.user.id, body?.storeId || auth.store?.id)
    if (!store || !isWooCommercePlatform(store.platform)) {
      return NextResponse.json(
        {
          error: 'Connect a WooCommerce store before choosing Razorpay billing.',
          code: 'WOOCOMMERCE_NOT_CONNECTED',
        },
        { status: 400 },
      )
    }

    const connection = await prisma.platformConnection.findFirst({
      where: { storeId: store.id, platform: 'woocommerce', status: 'active' },
      select: { id: true },
    })
    if (!connection) {
      return NextResponse.json(
        {
          error: 'Your WooCommerce connection is not active. Reconnect it in Integrations, then try again.',
          code: 'WOOCOMMERCE_RECONNECT_REQUIRED',
        },
        { status: 409 },
      )
    }

    const result = await startWooCommerceRazorpaySubscription({
      store: {
        id: store.id,
        userId: auth.user.id,
        name: store.name,
        domain: store.domain,
        platform: store.platform,
      },
      planId,
      period,
      email: auth.user.email,
      name: auth.user.name,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RazorpayBillingError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    if (error instanceof RazorpayConfigError || error instanceof RazorpayPlanMismatchError) {
      return NextResponse.json({ error: error.message, code: 'RAZORPAY_CONFIG_INVALID' }, { status: 503 })
    }
    await captureError({
      level: 'error',
      component: 'billing',
      operation: 'razorpay_create_subscription',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return NextResponse.json({ error: 'Could not start Razorpay checkout.', code: 'RAZORPAY_CHECKOUT_FAILED' }, { status: 500 })
  }
}
