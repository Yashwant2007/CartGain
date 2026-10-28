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

    // Discovery is the source of truth: if Meta exposes exactly one merchant
    // number, save it now. Merchants should never have to copy a phone-number
    // id by hand (and the shared sender is not a per-store value at all).
    if (numbers.length === 1) {
      const discovered = numbers[0]
      if ((store as any).whatsappPhoneNumberId !== discovered.id) {
        try {
          await prisma.store.update({
            where: { id: store.id },
            data: { whatsappPhoneNumberId: discovered.id },
          })
        } catch (err: any) {
          if (err?.code === 'P2002') {
            return NextResponse.json({
              ok: false,
              saved: false,
              numbers,
              wabaIds: result.wabaIds,
              error:
                'That WhatsApp number is already connected to another store. Sign in to that store, or disconnect it there first.',
              lookupErrors: result.lookupErrors,
            })
          }
          throw err
        }
      }
      return NextResponse.json({
        ok: true,
        saved: true,
        numbers,
        whatsappPhoneNumberId: discovered.id,
        wabaIds: result.wabaIds,
        lookupErrors: result.lookupErrors,
      })
    }

    return NextResponse.json({
      ok: numbers.length > 0,
      saved: false,
      numbers,
      wabaIds: result.wabaIds,
      error: onlySharedFound
        ? 'Only the CartGain shared number was found. Shared routing already works without a per-store ID. To use your own number, connect your WhatsApp Business Account to CartGain first, then discover again.'
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
    // The shared sender is deployment-wide, not a per-store mapping. Treat the
    // attempt as a successful no-op so older clients do not show an error; the
    // inbound webhook deliberately ignores any legacy value anyway.
    return NextResponse.json({
      ok: true,
      ignored: true,
      sharedNumber: true,
      whatsappPhoneNumberId: null,
      message:
        'CartGain shared routing is active. There is no per-store phone-number ID to save; inbound STOP/START replies are matched by customer phone and cart history.',
    })
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
