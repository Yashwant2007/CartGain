import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createRazorpaySubscription, PLANS, resolvePlanId } from '@/lib/payment'
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
    const planConfig = PLANS[resolvedPlanId]
    if (!planConfig || planConfig.price === 0) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
    })

    const result = await createRazorpaySubscription(resolvedPlanId, session.user.email, normalizedPeriod)

    await prisma.subscription.upsert({
      where: { id: existingSub?.id || 'none' },
      update: {
        subscriptionId: result.subscriptionId,
        plan: resolvedPlanId,
        status: 'pending',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + (normalizedPeriod === 'yearly' ? 365 : 30) * 86400000),
      },
      create: {
        userId: session.user.id,
        customerId: `customer_${session.user.id}`,
        subscriptionId: result.subscriptionId,
        plan: resolvedPlanId,
        status: 'pending',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + (normalizedPeriod === 'yearly' ? 365 : 30) * 86400000),
      },
    })

    return NextResponse.json({
      subscriptionId: result.subscriptionId,
      keyId: process.env.RAZORPAY_KEY_ID,
    })
  } catch (error) {
    console.error('Create subscription error:', error)
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}
