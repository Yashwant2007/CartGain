import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
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

    return NextResponse.json({ campaign }, { status: 200 })
  } catch (error) {
    console.error('Get campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function DELETE(
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

    // Delete associated messages first (due to foreign key constraint)
    await prisma.message.deleteMany({
      where: { campaignId: params.id },
    })

    // Delete associated AB tests
    await prisma.aBTest.deleteMany({
      where: { campaignId: params.id },
    })

    // Delete the campaign
    await prisma.campaign.delete({
      where: { id: params.id },
    })

    return NextResponse.json(
      { message: 'Campaign deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      isActive,
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
    } = body

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

    const updatedCampaign = await prisma.campaign.update({
      where: { id: params.id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(name && { name }),
        ...(channels && { channels }),
        ...(aiOptimized !== undefined && { aiOptimized }),
        ...(sendDelay !== undefined && { sendDelay }),
        ...(followUpDelay !== undefined && { followUpDelay }),
        ...(maxFollowUps !== undefined && { maxFollowUps }),
        ...(discountEnabled !== undefined && { discountEnabled }),
        ...(discountType && { discountType }),
        ...(discountValue !== undefined && { discountValue }),
        ...(discountCode && { discountCode }),
      },
    })

    return NextResponse.json(
      {
        message: 'Campaign updated successfully',
        campaign: updatedCampaign,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
