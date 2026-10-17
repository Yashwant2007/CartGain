import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { verifyOptOutToken, normalizeOptOutEmail, normalizeOptOutPhone } from '@/lib/opt-out'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?\d{8,15}$/

function confirmationHtml(contact: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;margin:0;padding:40px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="font-size:44px;margin-bottom:12px;">✅</div>
    <h1 style="font-size:20px;color:#0f172a;margin:0 0 12px;">You're unsubscribed</h1>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px;">We'll stop sending recovery and reminder messages to <strong>${contact}</strong>.</p>
    <p style="color:#94a3b8;font-size:13px;margin:0;">You can close this window.</p>
  </div>
</body></html>`
}

async function recordOptOut(storeId: string, email: string | null, phone: string | null): Promise<void> {
  const data: any = { storeId, reason: 'customer_request' }
  if (email) data.email = normalizeOptOutEmail(email)
  if (phone) data.phone = normalizeOptOutPhone(phone)

  if (data.email) {
    const existing = await prisma.optOut.findUnique({
      where: { storeId_email: { storeId, email: data.email } },
    })
    if (!existing) await prisma.optOut.create({ data })
  } else if (data.phone) {
    const existing = await prisma.optOut.findUnique({
      where: { storeId_phone: { storeId, phone: data.phone } },
    })
    if (!existing) await prisma.optOut.create({ data })
  }
}

// GET /api/opt-out
//   ?t=<signed token>  → public one-click unsubscribe from an email/WhatsApp link
//   (no token)         → authenticated merchant view of the store's opt-out list
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t')

  if (token) {
    try {
      const payload = verifyOptOutToken(token)
      if (!payload) {
        return new NextResponse('This unsubscribe link is invalid or has been altered.', { status: 400 })
      }
      const store = await prisma.store.findUnique({ where: { id: payload.storeId }, select: { id: true } })
      if (!store) {
        return new NextResponse('Store not found.', { status: 404 })
      }
      await recordOptOut(payload.storeId, payload.email ?? null, payload.phone ?? null)
      return new NextResponse(confirmationHtml(payload.email || payload.phone || 'this contact'), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    } catch (error) {
      console.error('Opt-out (token) error:', error)
      return new NextResponse('Something went wrong.', { status: 500 })
    }
  }

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.store.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    const optOuts = await prisma.optOut.findMany({
      where: { storeId: store.id },
      orderBy: { optedOutAt: 'desc' },
    })

    return NextResponse.json({ optOuts })
  } catch (error) {
    console.error('Opt-out list error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

// POST /api/opt-out
//   + valid signed token (body.t or query t)  → public unsubscribe (JSON)
//   + authenticated merchant session          → merchant-initiated opt-out
// Anything else is rejected: an unauthenticated, unsigned request must never be
// able to suppress contacts.
export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`bargain_optout_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ message: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      })
    }

    const body = await request.json().catch(() => ({}))
    const token: string | null = body?.t || request.nextUrl.searchParams.get('t')

    let storeId: string | null = null
    let email: string | null = null
    let phone: string | null = null

    if (token) {
      const payload = verifyOptOutToken(token)
      if (!payload) {
        return NextResponse.json({ message: 'Invalid or tampered opt-out token' }, { status: 403 })
      }
      storeId = payload.storeId
      email = payload.email ?? null
      phone = payload.phone ?? null
    } else {
      // No token → must be an authenticated merchant acting on their own store.
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
      }
      const store = await prisma.store.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
      })
      if (!store || store.id !== body?.storeId) {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
      }
      storeId = store.id
      if (body?.email) {
        if (typeof body.email !== 'string' || body.email.length > 254 || !EMAIL_RE.test(body.email)) {
          return NextResponse.json({ message: 'A valid email is required' }, { status: 400 })
        }
        email = body.email
      }
      if (body?.phone) {
        if (typeof body.phone !== 'string' || !PHONE_RE.test(body.phone.replace(/[\s-]/g, ''))) {
          return NextResponse.json({ message: 'A valid phone number is required' }, { status: 400 })
        }
        phone = body.phone
      }
    }

    if (!storeId || (!email && !phone)) {
      return NextResponse.json({ message: 'storeId and email or phone are required' }, { status: 400 })
    }

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } })
    if (!store) {
      return NextResponse.json({ message: 'Store not found' }, { status: 404 })
    }

    await recordOptOut(storeId, email, phone)
    return NextResponse.json({ success: true, message: 'Opt-out recorded' })
  } catch (error) {
    console.error('Opt-out error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
