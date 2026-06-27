import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { campaignUpdateSchema, validateOrThrow, handleValidationError } from '@/lib/validation'

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

    // Delete in correct order to avoid FK constraints
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { campaignId: params.id } }),
      prisma.aBTest.deleteMany({ where: { campaignId: params.id } }),
      prisma.campaign.delete({ where: { id: params.id } }),
    ])

    return NextResponse.json(
      { message: 'Campaign deleted successfully' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Delete campaign error:', error)
    const isNotFound = error?.code === 'P2025'
    return NextResponse.json(
      { message: isNotFound ? 'Campaign not found' : 'Something went wrong' },
      { status: isNotFound ? 404 : 500 }
    )
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
    const data = validateOrThrow(campaignUpdateSchema, body)

    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    })

    if (!campaign) {
      return NextResponse.json({ message: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const updatedCampaign = await prisma.campaign.update({
      where: { id: params.id },
      data: {
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.channels !== undefined && { channels: data.channels }),
        ...(data.aiOptimized !== undefined && { aiOptimized: data.aiOptimized }),
        ...(data.sendDelay !== undefined && { sendDelay: data.sendDelay }),
        ...(data.followUpDelay !== undefined && { followUpDelay: data.followUpDelay }),
        ...(data.maxFollowUps !== undefined && { maxFollowUps: data.maxFollowUps }),
        ...(data.discountEnabled !== undefined && { discountEnabled: data.discountEnabled }),
        ...(data.discountType !== undefined && { discountType: data.discountType }),
        ...(data.discountValue !== undefined && { discountValue: data.discountValue }),
        ...(data.discountCode !== undefined && { discountCode: data.discountCode }),
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
    const validationResponse = handleValidationError(error)
    if (validationResponse) return validationResponse
    console.error('Update campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
