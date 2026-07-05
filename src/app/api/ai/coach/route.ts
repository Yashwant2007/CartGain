import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateRevenueCoachSuggestions } from '@/lib/services/ai'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ message: 'storeId required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    const now = new Date()

    const abandoned30d = await prisma.cart.count({
      where: { storeId, abandonedAt: { gte: thirtyDaysAgo } }
    })
    const recovered30d = await prisma.recoveredCart.count({
      where: { storeId, recoveredAt: { gte: thirtyDaysAgo } }
    })
    const revenue30d = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
      _sum: { netRevenue: true }
    })
    const campaigns = await prisma.campaign.findMany({ where: { storeId } })
    const activeCampaigns = campaigns.filter(c => c.isActive)
    const channelsUsed = Array.from(new Set(campaigns.flatMap(c => c.channels)))

    const firstMessage = await prisma.message.findFirst({
      where: { cart: { storeId }, status: 'sent' },
      orderBy: { createdAt: 'asc' },
    })

    const avgTime = firstMessage?.createdAt
      ? (Date.now() - firstMessage.createdAt.getTime()) / 60000
      : 0

    const suggestions = await generateRevenueCoachSuggestions({
      recoveryRate: abandoned30d > 0 ? (recovered30d / abandoned30d) * 100 : 0,
      cartsAbandoned30d: abandoned30d,
      cartsRecovered30d: recovered30d,
      revenueRecovered30d: revenue30d._sum.netRevenue || 0,
      activeCampaigns: activeCampaigns.length,
      channelsUsed,
      aiOptimized: campaigns.some(c => c.aiOptimized),
      hasDiscountCampaigns: campaigns.some(c => c.discountEnabled),
      avgRecoveryTime: avgTime,
    })

    const existingSuggestions = await prisma.aiSuggestion.findMany({
      where: { storeId, type: 'revenue_coach', createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      suggestions: suggestions.suggestions,
      existing: existingSuggestions,
    }, { status: 200 })
  } catch (error) {
    console.error('Revenue coach error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { storeId, type, title, description, impact, metrics } = await request.json()

    if (!storeId || !title) {
      return NextResponse.json({ message: 'storeId and title required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const suggestion = await prisma.aiSuggestion.create({
      data: { storeId, userId: session.user.id, type: type || 'revenue_coach', title, description: description || '', impact, metrics: metrics || {} },
    })

    return NextResponse.json({ suggestion }, { status: 201 })
  } catch (error) {
    console.error('Save coach suggestion error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}