import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { track, CLIENT_FIREABLE_EVENTS } from '@/lib/analytics/track'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Client-fired product events. Session-authenticated + allowlisted + rate
// limited, so a logged-in merchant can report lifecycle moments (onboarding
// started/completed) without opening an arbitrary event-writing surface.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  const rate = await checkSimpleRateLimit(`analytics_event_${ip}`)
  if (!rate.allowed) {
    return NextResponse.json({}, { status: 429 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  let name: unknown
  let requestedStoreId: unknown
  try {
    const body = await req.json()
    name = body?.name
    requestedStoreId = body?.storeId
  } catch {
    return NextResponse.json({ message: 'Invalid request' }, { status: 400 })
  }

  if (typeof name !== 'string' || !CLIENT_FIREABLE_EVENTS.has(name)) {
    return NextResponse.json({ message: 'Event not allowed' }, { status: 400 })
  }

  // The event must be attributed to the store the merchant is actually
  // looking at. The old code always used the user's OLDEST store, so a
  // multi-store merchant's funnel events landed on the wrong tenant.
  let store: { id: string } | null = null
  if (typeof requestedStoreId === 'string' && requestedStoreId) {
    store = await prisma.store.findFirst({
      where: { id: requestedStoreId, userId: session.user.id },
      select: { id: true },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }
  } else {
    store = await prisma.store.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
  }

  await track({
    name,
    userId: session.user.id,
    storeId: store?.id,
  })

  return NextResponse.json({ ok: true })
}