import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { authenticate, hasPermission } from '@/lib/auth-context'
import { resolveWhatsAppPhoneNumberId } from '@/lib/whatsapp/config'
import { discoverWhatsAppPhoneNumbers } from '@/lib/whatsapp/discovery'

export const dynamic = 'force-dynamic'

async function findStore(userId: string, storeId?: string | null) {
  return storeId
    ? prisma.store.findFirst({ where: { id: storeId, userId } })
    : prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
}

async function resolveStore(request: NextRequest, userId: string) {
  const requested =
    request.nextUrl.searchParams.get('storeId') ||
    (await request.clone().json().catch(() => ({})))?.storeId ||
    null
  return findStore(userId, requested)
}

export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.success) {
    return NextResponse.json({ message: auth.error }, { status: auth.status })
  }
  const store = await resolveStore(request, auth.ctx.userId)
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  const envPhoneNumberId = resolveWhatsAppPhoneNumberId() || null
  return NextResponse.json({
    whatsappPhoneNumberId: (store as any).whatsappPhoneNumberId || null,
    envPhoneNumberId,
    sharedNumber: Boolean(envPhoneNumberId),
    storeMappedToSharedNumber:
      Boolean(envPhoneNumberId) && (store as any).whatsappPhoneNumberId === envPhoneNumberId,
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
  const action = String(body?.action || 'save').toLowerCase()
  const store = await findStore(auth.ctx.userId, storeId || null)
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  const sharedPhoneNumberId = resolveWhatsAppPhoneNumberId()

  if (action === 'discover') {
    const result = await discoverWhatsAppPhoneNumbers({
      wabaId: typeof body?.wabaId === 'string' ? body.wabaId.trim() : undefined,
    })
    const numbers = result.numbers.filter((number) => number.id !== sharedPhoneNumberId)
    const onlySharedFound = result.ok && numbers.length === 0
    return NextResponse.json({
      ok: numbers.length > 0,
      numbers,
      wabaIds: result.wabaIds,
      error: onlySharedFound
        ? 'Only the CartGain shared number was found. Connect your own WhatsApp Business Account to CartGain first, then discover again.'
        : result.error,
      lookupErrors: result.lookupErrors,
    })
  }

  if (action === 'clear') {
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { whatsappPhoneNumberId: null },
    })
    return NextResponse.json({
      ok: true,
      whatsappPhoneNumberId: (updated as any).whatsappPhoneNumberId || null,
    })
  }

  if (action !== 'save') {
    return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
  }

  const raw = body?.whatsappPhoneNumberId
  const phoneNumberId = raw == null ? '' : String(raw).trim()

  if (phoneNumberId && !/^\d{6,32}$/.test(phoneNumberId)) {
    return NextResponse.json(
      { message: 'whatsappPhoneNumberId must be the numeric Meta phone-number id' },
      { status: 400 },
    )
  }

  if (phoneNumberId && sharedPhoneNumberId && phoneNumberId === sharedPhoneNumberId) {
    return NextResponse.json(
      {
        code: 'SHARED_NUMBER',
        message:
          'CartGain sends from this shared WhatsApp number, so it must not be mapped to a single store. Leave the mapping empty; inbound STOP/START messages are matched to your store by phone and cart history.',
      },
      { status: 400 },
    )
  }

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
