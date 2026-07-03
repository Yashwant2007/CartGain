import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Debug endpoint — shows the last 20 carts + their messages so you can
 * quickly see what's stored and whether messages were attempted.
 *
 * Protected by JOB_SECRET (same as the cron job).
 * Hit it at: GET /api/debug/carts?secret=YOUR_JOB_SECRET
 * Or without a secret in dev (when JOB_SECRET is unset).
 */
function isAuthorized(request: NextRequest): boolean {
  const configured = (process.env.JOB_SECRET || '').trim()
  if (!configured) return true
  const query = request.nextUrl.searchParams.get('secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return query === configured || bearer === configured
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Last 20 carts across all stores, newest first
    const carts = await prisma.cart.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        store: { select: { id: true, name: true, domain: true } },
      },
    })

    // Active campaigns
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
        content: m.content,
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
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
