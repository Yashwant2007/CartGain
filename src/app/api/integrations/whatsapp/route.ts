import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { authenticate, hasPermission } from '@/lib/auth-context'
import { resolveWhatsAppPhoneNumberId } from '@/lib/whatsapp/config'

export const dynamic = 'force-dynamic'

async function resolveStore(request: NextRequest, userId: string) {
  const requested =
    request.nextUrl.searchParams.get('storeId') ||
    (await request.clone().json().catch(() => ({})))?.storeId ||
    null
  return requested
    ? prisma.store.findFirst({ where: { id: requested, userId } })
    : prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.success) {
    return NextResponse.json({ message: auth.error }, { status: auth.status })
  }
  const store = await resolveStore(request, auth.ctx.userId)
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  return NextResponse.json({
    whatsappPhoneNumberId: (store as any).whatsappPhoneNumberId || null,
    envPhoneNumberId: resolveWhatsAppPhoneNumberId() || null,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.success) {
    return NextResponse.json({ message: auth.error }, { status: auth.status })
  }
  if (!hasPermission(auth.ctx, 'write')) {
    return NextResponse.json({ message: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const storeId = String(body?.storeId || '')
  const raw = body?.whatsappPhoneNumberId
  const phoneNumberId = raw == null ? '' : String(raw).trim()

  if (phoneNumberId && !/^\d{6,32}$/.test(phoneNumberId)) {
    return NextResponse.json(
      { message: 'whatsappPhoneNumberId must be the numeric Meta phone-number id' },
      { status: 400 },
    )
  }

  const store = await prisma.store.findFirst({
    where: storeId ? { id: storeId, userId: auth.ctx.userId } : { userId: auth.ctx.userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  try {
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { whatsappPhoneNumberId: phoneNumberId || null },
    })
    return NextResponse.json({
      ok: true,
      whatsappPhoneNumberId: (updated as any).whatsappPhoneNumberId || null,
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { message: 'That phone-number id is already mapped to another store' },
        { status: 409 },
      )
    }
    console.error('Update WhatsApp phone-number mapping error:', err)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
