import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

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

    const campaigns = await prisma.campaign.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ campaigns })
  } catch (error) {
    console.error('List campaigns error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      storeId,
      name,
      channels,
      aiOptimized = true,
      sendDelay = 15,
      followUpDelay = 180,
      maxFollowUps = 2,
      discountEnabled = false,
      discountType,
      discountValue,
      discountCode,
      isActive = true,
    } = body

    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!storeId || !name || !Array.isArray(channels) || channels.length === 0) {
      return NextResponse.json(
        { message: 'storeId, name, and at least one channel are required' },
        { status: 400 }
      )
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })

    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const campaign = await prisma.campaign.create({
      data: {
        storeId,
        userId: store.userId,
        name,
        channels,
        aiOptimized,
        sendDelay,
        followUpDelay,
        maxFollowUps,
        discountEnabled,
        discountType,
        discountValue,
        discountCode,
        isActive,
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
    console.error('Create campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
