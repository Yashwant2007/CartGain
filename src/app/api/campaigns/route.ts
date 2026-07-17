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

    return NextResponse.json({ campaigns: items, nextCursor, hasMore })
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
