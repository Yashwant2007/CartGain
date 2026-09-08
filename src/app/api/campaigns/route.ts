import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { campaignCreateSchema, validateOrThrow, ValidationError, handleValidationError } from '@/lib/validation'
import { getSubscription } from '@/lib/subscription'
import { PLANS } from '@/lib/payment'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId')

    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        userId: session.user.id,
      },
    })

    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const cursor = request.nextUrl.searchParams.get('cursor')
    const take = Math.min(parseInt(request.nextUrl.searchParams.get('take') || '50'), 200)

    const campaigns = await prisma.campaign.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = campaigns.length > take
    const items = hasMore ? campaigns.slice(0, take) : campaigns
    const nextCursor = hasMore ? items[items.length - 1].id : null

    // Per-campaign recovery stats for the list cards (real numbers, not the
    // hardcoded zeros the dashboard used to render). Two aggregate queries:
    // distinct (campaignId, cartId) message pairs plus recovered carts per store.
    const statsByCampaign: Record<string, { totalCarts: number; recovered: number; recoveryRate: number; revenue: number }> = {}
    if (items.length > 0) {
      const messageRows = await prisma.message.groupBy({
        by: ['campaignId', 'cartId'],
        where: { campaignId: { in: items.map((c) => c.id) } },
      })
      const recoveredRows = await prisma.recoveredCart.findMany({
        where: { storeId },
        select: { cartId: true, recoveredValue: true },
      })
      const recoveredByCartId = new Map(recoveredRows.map((r) => [r.cartId, r.recoveredValue]))
      const cartCounts = new Map<string, number>()
      const cartRecovered = new Map<string, Set<string>>()
      const cartRevenue = new Map<string, number>()
      for (const row of messageRows) {
        cartCounts.set(row.campaignId, (cartCounts.get(row.campaignId) ?? 0) + 1)
        const recoveredValue = recoveredByCartId.get(row.cartId)
        if (recoveredValue !== undefined) {
          if (!cartRecovered.has(row.campaignId)) cartRecovered.set(row.campaignId, new Set())
          cartRecovered.get(row.campaignId)!.add(row.cartId)
          cartRevenue.set(row.campaignId, (cartRevenue.get(row.campaignId) ?? 0) + recoveredValue)
        }
      }
      for (const campaign of items) {
        const totalCarts = cartCounts.get(campaign.id) ?? 0
        const recovered = cartRecovered.get(campaign.id)?.size ?? 0
        statsByCampaign[campaign.id] = {
          totalCarts,
          recovered,
          recoveryRate: totalCarts > 0 ? Math.round((recovered / totalCarts) * 100) : 0,
          revenue: cartRevenue.get(campaign.id) ?? 0,
        }
      }
    }

    return NextResponse.json({ campaigns: items, nextCursor, hasMore, statsByCampaign })
  } catch (error) {
    console.error('List campaigns error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = validateOrThrow(campaignCreateSchema, body)

    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findUnique({ where: { id: data.storeId } })

    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const subscription = await getSubscription(session.user.id)
    if (!subscription) {
      return NextResponse.json({ message: 'No subscription found. Please choose a plan first.' }, { status: 402 })
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ message: 'Your subscription is not active. Please renew your plan.' }, { status: 402 })
    }

    const planConfig = Object.values(PLANS).find(p => p.id === subscription.plan)
    const maxCampaigns = planConfig?.maxCampaigns ?? Infinity

    if (maxCampaigns !== Infinity) {
      const existingCount = await prisma.campaign.count({
        where: { userId: session.user.id },
      })
      if (existingCount >= maxCampaigns) {
        return NextResponse.json({
          message: `Campaign limit reached. Your ${planConfig?.name || 'current'} plan allows up to ${maxCampaigns} campaigns. Upgrade to create more.`,
        }, { status: 403 })
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        storeId: data.storeId,
        userId: store.userId,
        name: data.name,
        channels: data.channels,
        aiOptimized: data.aiOptimized,
        sendDelay: data.sendDelay,
        followUpDelay: data.followUpDelay,
        maxFollowUps: data.maxFollowUps,
        discountEnabled: data.discountEnabled,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountCode: data.discountCode,
        isActive: data.isActive,
      },
    })

    return NextResponse.json(
      {
        message: 'Campaign created successfully',
        campaign,
      },
      { status: 201 }
    )
  } catch (error) {
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('Create campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
