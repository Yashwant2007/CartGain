import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateCampaignSetup } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { storeId } = await request.json()

    if (!storeId) {
      return NextResponse.json({ message: 'storeId required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const config = await generateCampaignSetup({
      name: store.name,
      domain: store.domain,
      currency: store.currency,
    })

    if (!config) {
      return NextResponse.json({ message: 'Failed to generate campaign config' }, { status: 500 })
    }

    const existing = await prisma.campaign.findFirst({ where: { storeId } })

    let campaign
    if (existing) {
      campaign = await prisma.campaign.update({
        where: { id: existing.id },
        data: {
          name: config.campaignName,
          channels: config.channels,
          aiOptimized: config.aiOptimized,
          sendDelay: config.sendDelay,
          followUpDelay: config.followUpDelay,
          maxFollowUps: config.maxFollowUps,
          discountEnabled: config.discountEnabled,
          discountType: config.discountEnabled ? config.discountType : null,
          discountValue: config.discountEnabled ? config.discountValue : null,
          discountCode: config.discountEnabled ? config.discountCode : null,
          isActive: true,
        },
      })
    } else {
      campaign = await prisma.campaign.create({
        data: {
          storeId,
          userId: session.user.id,
          name: config.campaignName,
          channels: config.channels,
          aiOptimized: config.aiOptimized,
          sendDelay: config.sendDelay,
          followUpDelay: config.followUpDelay,
          maxFollowUps: config.maxFollowUps,
          discountEnabled: config.discountEnabled,
          discountType: config.discountEnabled ? config.discountType : null,
          discountValue: config.discountEnabled ? config.discountValue : null,
          discountCode: config.discountEnabled ? config.discountCode : null,
          isActive: true,
        },
      })
    }

    await prisma.aiSuggestion.create({
      data: {
        storeId,
        userId: session.user.id,
        type: 'campaign_tip',
        title: 'AI Campaign Setup Complete',
        description: `AI configured "${campaign.name}" with ${config.channels.join(', ')} channels, ${config.sendDelay}min delay, ${config.maxFollowUps} follow-ups${config.discountEnabled ? `, and ${config.discountValue}% discount` : ''}.`,
        impact: 'high',
        metrics: { channels: config.channels, sendDelay: config.sendDelay, discountEnabled: config.discountEnabled } as any,
      },
    })

    return NextResponse.json({ campaign, config }, { status: 201 })
  } catch (error) {
    console.error('Setup campaign error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}