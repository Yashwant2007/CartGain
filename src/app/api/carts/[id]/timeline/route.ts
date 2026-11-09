import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { authenticate } from '@/lib/auth-context'
import { buildCartTimeline } from '@/lib/recovery/timeline'

export const dynamic = 'force-dynamic'

function digits(value: string | null | undefined): string | null {
  const clean = (value || '').replace(/\D/g, '')
  return clean.length >= 8 ? clean : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await authenticate(request)
    if (!auth.success) {
      return NextResponse.json({ message: auth.error }, { status: auth.status })
    }

    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ message: 'storeId is required' }, { status: 400 })
    }

    const store = await prisma.store.findFirst({
      where: { id: storeId, userId: auth.ctx.userId },
      select: { id: true },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const cart = await prisma.cart.findFirst({
      where: { id: params.id, storeId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })
    if (!cart) {
      return NextResponse.json({ message: 'Cart not found' }, { status: 404 })
    }

    // Prefer the campaign that actually produced the messages (the merchant may
    // have edited or replaced the active campaign since), then fall back to the
    // store's active campaign so a pending cart still shows its plan.
    const latestMessage = [...cart.messages]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const campaign = latestMessage
      ? await prisma.campaign.findFirst({ where: { id: latestMessage.campaignId, storeId } })
      : await prisma.campaign.findFirst({
          where: { storeId, isActive: true },
          orderBy: { createdAt: 'desc' },
        })

    const phone = digits(cart.customerPhone)
    const email = cart.customerEmail?.trim().toLowerCase() || null
    const identity = phone || email
      ? await prisma.customerIdentity.findFirst({
          where: {
            storeId,
            OR: [
              ...(phone ? [{ phone: { contains: phone } }] : []),
              ...(email ? [{ email }] : []),
            ],
          },
          orderBy: { lastSeenAt: 'desc' },
        })
      : null

    const expiryDaysRaw = Number(process.env.RECOVERY_CAMPAIGN_EXPIRY_DAYS ?? 14)
    const expiryDays = Number.isFinite(expiryDaysRaw) ? expiryDaysRaw : 14

    const timeline = buildCartTimeline({
      cart,
      messages: cart.messages,
      campaign: campaign
        ? {
            channels: campaign.channels,
            maxFollowUps: campaign.maxFollowUps,
            sendDelay: campaign.sendDelay,
            followUpDelay: campaign.followUpDelay,
          }
        : null,
      identity,
      expiryDays,
    })

    return NextResponse.json({
      cart: {
        id: cart.id,
        customerName: cart.customerName,
        customerEmail: cart.customerEmail,
        customerPhone: cart.customerPhone,
        totalValue: cart.totalValue,
        currency: cart.currency,
        abandonedAt: cart.abandonedAt,
        convertedAt: cart.convertedAt,
        isRecovered: cart.isRecovered,
        recoveredVia: cart.recoveredVia,
      },
      campaign: campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            channels: campaign.channels,
            sendDelay: campaign.sendDelay,
            followUpDelay: campaign.followUpDelay,
            maxFollowUps: campaign.maxFollowUps,
          }
        : null,
      ...timeline,
    })
  } catch (error) {
    console.error('Cart timeline error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
