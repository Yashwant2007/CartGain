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

    // Calculate message metrics.
    //
    // "Sent" means the provider accepted the message; "delivered" means the
    // provider confirmed delivery. The two used to be the same expression, so
    // the delivery rate was always 100% and a merchant could never see how
    // many messages actually reached the inbox.
    const totalMessagesSent = messages.filter((m) => m.status === 'sent' || m.status === 'delivered').length
    const totalMessagesDelivered = messages.filter((m) => m.status === 'delivered').length
    const totalMessagesClicked = messages.filter((m) => m.clickedAt).length
    // A converted cart can have several messages with `convertedAt` set. Count
    // distinct carts so a two-step recovery is not counted twice.
    const totalMessagesConverted = new Set(
      messages.filter((m) => m.convertedAt).map((m) => m.cartId),
    ).size

    const skippedMessages = messages.filter((m) => m.status === 'skipped')
    const skipReasonCounts = new Map<string, number>()
    for (const message of skippedMessages) {
      const reason = message.reasonCode || 'unknown'
      skipReasonCounts.set(reason, (skipReasonCounts.get(reason) || 0) + 1)
    }
    const skipReasons = Array.from(skipReasonCounts.entries())
      .map(([reasonCode, count]) => ({ reasonCode, count }))
      .sort((a, b) => b.count - a.count)

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

    // Deduped per-cart channel attribution. RecoveredCart is one row per cart,
    // so this cannot double-count a cart that received both channels.
    const channelAttribution = new Map<string, { recoveredCarts: number; revenue: number }>()
    for (const rc of recoveredCartDetails) {
      const channel = rc.channel || 'unknown'
      const entry = channelAttribution.get(channel) || { recoveredCarts: 0, revenue: 0 }
      entry.recoveredCarts += 1
      entry.revenue += rc.netRevenue
      channelAttribution.set(channel, entry)
    }
    const recoveredCartsByChannel = Array.from(channelAttribution.entries()).map(
      ([channel, value]) => ({ channel, ...value }),
    )

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
      skippedMessages: skippedMessages.length,
      skipReasons,
      attributedRecoveredCarts: recoveredCartDetails.length,
      recoveredCartsByChannel,
      createdAt: campaign.createdAt,
    }

    return NextResponse.json({ analytics }, { status: 200 })
  } catch (error) {
    console.error('Get campaign analytics error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
