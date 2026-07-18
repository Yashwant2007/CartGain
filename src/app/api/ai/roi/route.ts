import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

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

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)

    const totalRevenue = await prisma.recoveredCart.aggregate({
      where: { storeId },
      _sum: { netRevenue: true }
    })

    const monthlyRevenue = await prisma.recoveredCart.aggregate({
      where: { storeId, recoveredAt: { gte: thirtyDaysAgo } },
      _sum: { netRevenue: true }
    })

    const messages = await prisma.message.findMany({
      where: { cart: { storeId }, sentAt: { gte: thirtyDaysAgo } },
      select: { channel: true, status: true }
    })

    const smsCount = messages.filter((m: any) => m.channel === 'sms').length
    const whatsappCount = messages.filter((m: any) => m.channel === 'whatsapp').length
    const emailCount = messages.filter((m: any) => m.channel === 'email').length

    const SMS_RATE = 0.85
    const WHATSAPP_RATE = 0.86
    const EMAIL_RATE = 0

    const totalCost = (smsCount * SMS_RATE) + (whatsappCount * WHATSAPP_RATE) + (emailCount * EMAIL_RATE)

    const subscription = await prisma.subscription.findFirst({
      where: { userId: session.user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    })

    const plan = subscription?.plan || 'free'
    const planCosts: Record<string, number> = { free: 0, starter: 999, growth: 2999, pro: 8999, enterprise: 0 }
    const monthlyPlanCost = planCosts[plan] || 0

    const totalMonthlyCost = totalCost + monthlyPlanCost
    const monthlyRev = monthlyRevenue._sum.netRevenue || 0
    const netProfit = monthlyRev - totalMonthlyCost
    const roiMultiple = totalMonthlyCost > 0 ? monthlyRev / totalMonthlyCost : monthlyRev > 0 ? 999 : 0
    const ltv = totalRevenue._sum.netRevenue || 0

    return NextResponse.json({
      totalRecoveredRevenue: ltv,
      monthlyRecoveredRevenue: monthlyRev,
      monthlyCosts: {
        messaging: Math.round(totalCost * 100) / 100,
        subscription: monthlyPlanCost,
        total: Math.round(totalMonthlyCost * 100) / 100,
      },
      netProfit: Math.round(netProfit * 100) / 100,
      roiMultiple: Math.round(roiMultiple * 10) / 10,
      messagesSent: { sms: smsCount, whatsapp: whatsappCount, email: emailCount, total: messages.length },
      plan,
    }, { status: 200 })
  } catch (error) {
    console.error('ROI error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}