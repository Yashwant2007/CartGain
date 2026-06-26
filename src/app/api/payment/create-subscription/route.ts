import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createRazorpaySubscription, PLANS } from '@/lib/payment'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plan, period = 'monthly' } = await req.json()

    if (!plan) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 })
    }

    const planConfig = Object.values(PLANS).find(p => p.id === plan)
    if (!planConfig || planConfig.price === 0) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
    })

    if (existingSub?.subscriptionId && existingSub.status === 'active') {
      return NextResponse.json({ error: 'Already have an active subscription' }, { status: 400 })
    }

    const result = await createRazorpaySubscription(plan, session.user.email, period as 'monthly' | 'yearly')

    await prisma.subscription.upsert({
      where: { id: existingSub?.id || 'none' },
      update: {
        subscriptionId: result.subscriptionId,
        plan,
        status: 'pending',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + (period === 'yearly' ? 365 : 30) * 86400000),
      },
      create: {
        userId: session.user.id,
        customerId: `customer_${session.user.id}`,
        subscriptionId: result.subscriptionId,
        plan,
        status: 'pending',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + (period === 'yearly' ? 365 : 30) * 86400000),
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
