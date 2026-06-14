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

    // Get all messages for this campaign
    const messages = await prisma.message.findMany({
      where: { campaignId: campaign.id },
    })

    // Calculate message metrics
    const totalMessagesSent = messages.length
    const totalMessagesDelivered = messages.filter((m) => m.status !== 'failed' && m.deliveredAt).length
    const totalMessagesClicked = messages.filter((m) => m.clickedAt).length
    const totalMessagesConverted = messages.filter((m) => m.convertedAt).length

    const deliveryRate = totalMessagesSent > 0 ? (totalMessagesDelivered / totalMessagesSent) * 100 : 0
    const clickRate = totalMessagesSent > 0 ? (totalMessagesClicked / totalMessagesSent) * 100 : 0
    const conversionRate = totalMessagesSent > 0 ? (totalMessagesConverted / totalMessagesSent) * 100 : 0

    // Get carts associated with this campaign
    const carts = await prisma.cart.findMany({
      where: {
        messages: {
          some: {
            campaignId: campaign.id,
          },
        },
      },
    })

    // Calculate cart recovery metrics
    const totalCarts = carts.length
    const recoveredCarts = carts.filter((c) => c.isRecovered).length
    const recoveryRate = totalCarts > 0 ? (recoveredCarts / totalCarts) * 100 : 0

    // Get revenue from recovered carts
    const recoveredCartDetails = await prisma.recoveredCart.findMany({
      where: {
        cart: {
          messages: {
            some: {
              campaignId: campaign.id,
            },
          },
        },
      },
    })

    const totalRevenue = recoveredCartDetails.reduce((sum, rc) => sum + rc.netRevenue, 0)
    const revenuePerCart = recoveredCarts > 0 ? totalRevenue / recoveredCarts : 0

    const analytics = {
      id: campaign.id,
      name: campaign.name,
      channels: campaign.channels,
      totalMessagesSent,
      totalMessagesDelivered,
      totalMessagesClicked,
      totalMessagesConverted,
      deliveryRate,
      clickRate,
      conversionRate,
      totalCarts,
      recoveredCarts,
      recoveryRate,
      totalRevenue,
      revenuePerCart,
      createdAt: campaign.createdAt,
    }

    return NextResponse.json({ analytics }, { status: 200 })
  } catch (error) {
    console.error('Get campaign analytics error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
