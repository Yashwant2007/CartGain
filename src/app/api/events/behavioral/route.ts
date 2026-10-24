import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { getAuthContext } from '@/lib/embedded-auth'

export const dynamic = 'force-dynamic'

const ALLOWED_EVENT_TYPES = new Set([
  'product_viewed',
  'product_engagement_threshold_reached',
  'product_viewed_again',
  'cart_item_added',
  'cart_updated',
  'checkout_started',
  'checkout_abandoned',
  'payment_failed',
  'payment_cancelled',
  'order_paid',
  'order_cancelled',
])

function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers)
  const rate = await checkSimpleRateLimit(`behavioral_event_${ip}`)
  if (!rate.allowed) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 })
  }

  const { storeId, sessionId, eventType, productId, variantId, cartId, checkoutId, orderId, properties, email, phone, customerId } = body || {}

  if (typeof storeId !== 'string' || !storeId) {
    return NextResponse.json({ message: 'storeId required' }, { status: 400 })
  }
  if (typeof eventType !== 'string' || !ALLOWED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ message: 'Invalid eventType' }, { status: 400 })
  }

  // Validate store exists and is active
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, isActive: true } })
  if (!store || !store.isActive) {
    return NextResponse.json({ message: 'Store not found or inactive' }, { status: 404 })
  }

  const userAgent = req.headers.get('user-agent') || null
  const normalizedEmail = isValidEmail(email) ? email.toLowerCase().trim() : null
  const normalizedPhone = normalizePhone(phone)

  // Do not trust arbitrary browser IDs as proof of identity - keep separate
  try {
    const event = await prisma.behavioralEvent.create({
      data: {
        storeId,
        sessionId: typeof sessionId === 'string' ? sessionId : null,
        customerId: typeof customerId === 'string' ? customerId : null,
        email: normalizedEmail,
        phone: normalizedPhone,
        eventType,
        productId: typeof productId === 'string' ? productId : null,
        variantId: typeof variantId === 'string' ? variantId : null,
        cartId: typeof cartId === 'string' ? cartId : null,
        checkoutId: typeof checkoutId === 'string' ? checkoutId : null,
        orderId: typeof orderId === 'string' ? orderId : null,
        properties: properties && typeof properties === 'object' ? properties : {},
        ip,
        userAgent,
      },
    })

    return NextResponse.json({ ok: true, id: event.id })
  } catch (err) {
    console.error('behavioral event error:', err)
    return NextResponse.json({ message: 'Failed to record event' }, { status: 500 })
  }
}
