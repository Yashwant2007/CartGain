import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireJobAuth } from '@/lib/job-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = await requireJobAuth(request)
  if (authError) return authError

  try {
    const carts = await prisma.cart.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        store: { select: { id: true, name: true, domain: true } },
      },
    })

    const campaigns = await prisma.campaign.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        channels: true,
        sendDelay: true,
        followUpDelay: true,
        maxFollowUps: true,
        isActive: true,
        store: { select: { id: true, name: true, domain: true } },
      },
    })

    const summary = {
      totalCarts: carts.length,
      withEmail: carts.filter(c => c.customerEmail).length,
      withPhone: carts.filter(c => c.customerPhone).length,
      withNoContact: carts.filter(c => !c.customerEmail && !c.customerPhone).length,
      converted: carts.filter(c => c.convertedAt).length,
      recovered: carts.filter(c => c.isRecovered).length,
      messaged: carts.filter(c => c.messages.length > 0).length,
      neverMessaged: carts.filter(c => c.messages.length === 0 && !c.convertedAt).length,
    }

    const cartDetails = carts.map(c => ({
      id: c.id,
      store: c.store?.name,
      storeDomain: c.store?.domain,
      customerEmail: c.customerEmail ? `${c.customerEmail.slice(0, 3)}***` : null,
      customerPhone: c.customerPhone ? `***${c.customerPhone.slice(-4)}` : null,
      customerName: c.customerName,
      totalValue: c.totalValue,
      currency: c.currency,
      itemCount: Array.isArray(c.items) ? (c.items as any[]).length : 0,
      abandonedAt: c.abandonedAt,
      convertedAt: c.convertedAt,
      isRecovered: c.isRecovered,
      messages: c.messages.map(m => ({
        channel: m.channel,
        status: m.status,
        sentAt: m.sentAt,
      })),
      minutesSinceAbandoned: Math.floor((Date.now() - c.abandonedAt.getTime()) / 60000),
    }))

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      summary,
      campaigns,
      carts: cartDetails,
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to load debug data' }, { status: 500 })
  }
}
