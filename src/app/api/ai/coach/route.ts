import { NextRequest, NextResponse } from 'next/server'
import { checkSimpleRateLimit } from '@/lib/rate-limit'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { generateRevenueCoachSuggestions, generateCoachHeuristic } from '@/lib/services/ai'
import { isInsufficientQuotaError, shouldLogQuota } from '@/lib/ai-quota'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  let abandoned30d = 0
  let recovered30d = 0
  let revenue30d = 0
  let campaigns: Array<{ isActive: boolean; aiOptimized: boolean; discountEnabled: boolean; channels: string[] }> = []
  let firstMessage: { createdAt: Date } | null = null

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const aiRate = await checkSimpleRateLimit(`ai_${session.user.id}`)
    if (!aiRate.allowed) {
      return NextResponse.json({ message: 'Too many AI requests. Please try again later.' }, { status: 429 })
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

    const [
      abandoned30dCount,
      recovered30dCount,
      revenue30dAgg,
      campaignRows,
      firstMessageRow,
    ] = await prisma.$transaction([
      prisma.cart.count({
        where: { storeId, abandonedAt: { gte: thirtyDaysAgo } }
      }),
      prisma.recoveredCart.count({
        where: { storeId, recoveredAt: { gte: thirtyDaysAgo } }
      }),
      prisma.recoveredCart.aggregate({
        where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
        _sum: { netRevenue: true }
      }),
      prisma.campaign.findMany({ where: { storeId } }),
      prisma.message.findFirst({
        where: { cart: { storeId }, status: 'sent' },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    abandoned30d = abandoned30dCount
    recovered30d = recovered30dCount
    revenue30d = revenue30dAgg._sum.netRevenue || 0
    campaigns = campaignRows as any
    firstMessage = firstMessageRow

    const activeCampaigns = campaigns.filter((c: any) => c.isActive)
    const channelsUsed: string[] = Array.from(new Set(campaigns.flatMap((c: any) => c.channels)))

    const avgTime = firstMessage?.createdAt
      ? (Date.now() - firstMessage.createdAt.getTime()) / 60000
      : 0

    const suggestions = await generateRevenueCoachSuggestions({
      recoveryRate: abandoned30d > 0 ? (recovered30d / abandoned30d) * 100 : 0,
      cartsAbandoned30d: abandoned30d,
      cartsRecovered30d: recovered30d,
      revenueRecovered30d: revenue30d,
      activeCampaigns: activeCampaigns.length,
      channelsUsed,
      aiOptimized: campaigns.some((c: any) => c.aiOptimized),
      hasDiscountCampaigns: campaigns.some((c: any) => c.discountEnabled),
      avgRecoveryTime: avgTime,
    })

    const existingSuggestions = await prisma.aiSuggestion.findMany({
      where: { storeId, type: 'revenue_coach', createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [])

    return NextResponse.json({
      suggestions: suggestions.suggestions,
      existing: existingSuggestions,
    }, { status: 200 })
  } catch (error) {
    if (isInsufficientQuotaError(error)) {
      if (shouldLogQuota()) console.warn('Revenue coach: OpenAI quota exhausted — using heuristic suggestions')
    } else if ((error as any)?.status !== 429) {
      console.error('Revenue coach error:', error)
    }

    const heuristic = generateCoachHeuristic({
      recoveryRate: abandoned30d > 0 ? (recovered30d / abandoned30d) * 100 : 0,
      cartsAbandoned30d: abandoned30d,
      cartsRecovered30d: recovered30d,
      revenueRecovered30d: revenue30d,
      activeCampaigns: campaigns.filter((c) => c.isActive).length,
      channelsUsed: Array.from(new Set(campaigns.flatMap((c) => c.channels))),
      aiOptimized: campaigns.some((c) => c.aiOptimized),
      hasDiscountCampaigns: campaigns.some((c) => c.discountEnabled),
      avgRecoveryTime: firstMessage?.createdAt
        ? (Date.now() - firstMessage.createdAt.getTime()) / 60000
        : 0,
    })
    return NextResponse.json({
      suggestions: heuristic.suggestions,
      existing: [],
      _fallback: true,
    }, { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { storeId, type, title, description, impact, metrics } = await request.json()

    if (!storeId || typeof storeId !== 'string' || !title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json({ message: 'storeId and title (max 200 chars) are required' }, { status: 400 })
    }

    if (typeof description !== 'undefined' && typeof description !== 'string') {
      return NextResponse.json({ message: 'description must be a string' }, { status: 400 })
    }

    const validImpact = ['high', 'medium', 'low']
    if (typeof impact !== 'undefined' && !validImpact.includes(impact)) {
      return NextResponse.json({ message: 'impact must be high, medium or low' }, { status: 400 })
    }

    if (typeof metrics !== 'undefined' && (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics))) {
      return NextResponse.json({ message: 'metrics must be an object' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } })
    if (!store || store.userId !== session.user.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const suggestion = await prisma.aiSuggestion.create({
      data: { storeId, userId: session.user.id, type: typeof type === 'string' && type ? type : 'revenue_coach', title, description: description || '', impact: impact || null, metrics: metrics || {} },
    })

    return NextResponse.json({ suggestion }, { status: 201 })
  } catch (error) {
    console.error('Save coach suggestion error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}