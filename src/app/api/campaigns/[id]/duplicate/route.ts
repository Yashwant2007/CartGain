import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    })

    if (!campaign) {
      return NextResponse.json({ message: 'Campaign not found' }, { status: 404 })
    }

    // Verify user owns this campaign
    if (campaign.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Create duplicate campaign
    const duplicatedCampaign = await prisma.campaign.create({
      data: {
        storeId: campaign.storeId,
        userId: campaign.userId,
        name: `${campaign.name} (Copy)`,
        channels: campaign.channels,
        aiOptimized: campaign.aiOptimized,
        sendDelay: campaign.sendDelay,
        followUpDelay: campaign.followUpDelay,
        maxFollowUps: campaign.maxFollowUps,
        discountEnabled: campaign.discountEnabled,
        discountType: campaign.discountType,
        discountValue: campaign.discountValue,
        discountCode: campaign.discountCode,
        isActive: false, // Start as inactive
      },
    })

    return NextResponse.json(
      {
        message: 'Campaign duplicated successfully',
        campaign: duplicatedCampaign,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Duplicate campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
