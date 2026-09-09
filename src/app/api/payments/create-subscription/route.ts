import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createRazorpaySubscription, resolvePlanId, getPlan, cancelRazorpaySubscription } from '@/lib/payment'
import { track } from '@/lib/analytics/track'
import { captureError } from '@/lib/observability/logger'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rateLimitResult = await checkRateLimit('payments-create-subscription', {
      maxAttempts: 10,
      windowMs: 5 * 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan, period } = await req.json()
    const normalizedPeriod = period === 'yearly' ? 'yearly' : 'monthly'

    if (!plan) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 })
    }

    const resolvedPlanId = resolvePlanId(plan)
    const planConfig = getPlan(plan)
    if (!planConfig || planConfig.price === 0) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    // If the user already has a live Razorpay subscription for a previous
    // checkout, cancel it so switching plans doesn't leave two active gateway
    // subscriptions charging them. Only abort if the gate cancel hard-fails —
    // an "already cancelled/inactive" sub is treated as success upstream.
    if (existingSub?.subscriptionId && (existingSub.status === 'pending' || existingSub.status === 'active')) {
      const cancelled = await cancelRazorpaySubscription(existingSub.subscriptionId)
      if (!cancelled) {
        return NextResponse.json(
          { error: "We couldn't cancel your existing subscription at the payment gateway. Please contact support." },
          { status: 502 },
        )
      }
    }

    const result = await createRazorpaySubscription(resolvedPlanId, session.user.email, normalizedPeriod)

    // Single subscription row per user (enforced by @@unique([userId])) — a
    // previous `upsert({ where: { id: existingSub?.id || 'none' } })` fallback
    // could fabricate a duplicate row on every checkout attempt without an
    // existing row, breaking every findFirst-based plan lookup.
    const periodMs = (normalizedPeriod === 'yearly' ? 365 : 30) * 86400000
    await prisma.subscription.upsert({
      where: { userId: session.user.id },
      update: {
        subscriptionId: result.subscriptionId,
        plan: resolvedPlanId,
        status: 'pending',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + periodMs),
      },
      create: {
        userId: session.user.id,
        customerId: `customer_${session.user.id}`,
        subscriptionId: result.subscriptionId,
        plan: resolvedPlanId,
        status: 'pending',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + periodMs),
      },
    })

    await track({
      name: 'cartgain_billing_started',
      userId: session.user.id,
      properties: { plan: resolvedPlanId, period: normalizedPeriod },
    })

    return NextResponse.json({
      subscriptionId: result.subscriptionId,
      keyId: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    await captureError({
      level: 'error',
      component: 'billing',
      operation: 'create_subscription',
      error,
      req,
      persist: true,
      statusCode: 500,
    })
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}
