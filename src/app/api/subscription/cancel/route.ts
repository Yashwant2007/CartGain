import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { cancelRazorpaySubscription } from '@/lib/payment'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    if (subscription.plan === 'free') {
      return NextResponse.json({ error: 'Already on the free plan' }, { status: 400 })
    }

    // Cancel at the gateway FIRST so the merchant stops being billed. Only if
    // the gateway confirms (or there is nothing to cancel) do we downgrade the
    // local plan. Otherwise the app would claim "free" while Razorpay keeps
    // charging — the worst possible outcome for the merchant.
    const gatewayCancelled = await cancelRazorpaySubscription(subscription.subscriptionId)
    if (!gatewayCancelled) {
      return NextResponse.json(
        { error: "We couldn't cancel your subscription at the payment gateway. Please try again or contact support." },
        { status: 502 },
      )
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: 'free',
        status: 'active',
        subscriptionId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        smsCredits: 0,
        smsCreditsUsed: 0,
        cartsUsedInPeriod: 0,
        bargainSessionsUsed: 0,
        bargainDealsUsed: 0,
      },
    })

    return NextResponse.json({ success: true, message: 'Downgraded to free plan' })
  } catch (error) {
    console.error('Cancel subscription error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}