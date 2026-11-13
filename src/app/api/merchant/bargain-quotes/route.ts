import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { revokeQuote, QUOTE_STATUSES } from '@/lib/bargain/quote'
import { isFeatureEnabled } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

async function resolveStore(userId: string, storeId: string | null) {
  if (!storeId) return null
  return prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } })
}

// GET /api/merchant/bargain-quotes?storeId=…&status=… — list recent quotes.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }
  const storeId = request.nextUrl.searchParams.get('storeId')
  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }

  const statusParam = request.nextUrl.searchParams.get('status')
  const status = statusParam && (QUOTE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : undefined

  const quotes = await prisma.bargainQuote.findMany({
    where: { storeId: store.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    // Never select floorPrice into an API response; keep the projection explicit.
    select: {
      id: true,
      status: true,
      shopifyProductId: true,
      variantId: true,
      quantity: true,
      originalPrice: true,
      finalPrice: true,
      discountPercent: true,
      currency: true,
      discountCode: true,
      orderId: true,
      expiresAt: true,
      acceptedAt: true,
      redeemedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ quotes })
}

// POST /api/merchant/bargain-quotes — revoke a quote (merchant kill switch).
export async function POST(request: NextRequest) {
  if (!isFeatureEnabled('BARGAIN_QUOTE')) {
    return NextResponse.json({ message: 'Not available' }, { status: 404 })
  }
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  const storeId = typeof body?.storeId === 'string' ? body.storeId : null
  const quoteId = typeof body?.quoteId === 'string' ? body.quoteId : null
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : 'merchant_revoked'

  const store = await resolveStore(session.user.id, storeId)
  if (!store) {
    return NextResponse.json({ message: 'Store not found' }, { status: 404 })
  }
  if (!quoteId) {
    return NextResponse.json({ message: 'quoteId is required' }, { status: 400 })
  }

  const quote = await prisma.bargainQuote.findFirst({ where: { id: quoteId, storeId: store.id }, select: { id: true, status: true } })
  if (!quote) {
    return NextResponse.json({ message: 'Quote not found' }, { status: 404 })
  }

  const result = await revokeQuote(quote.id, reason)
  if (!result) {
    return NextResponse.json({ message: `Cannot revoke a ${quote.status} quote` }, { status: 409 })
  }
  return NextResponse.json({ ok: true, status: result.status })
}
