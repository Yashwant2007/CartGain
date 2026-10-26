import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { authenticate, hasPermission } from '@/lib/auth-context'
import { normalizeRecipientPhone } from '@/lib/recovery/recipients'
import { recordWhatsAppConsent } from '@/lib/recovery/recipients'
import { recordOptOut } from '@/lib/opt-out'
import { isWhatsAppConfigured, resolveWhatsAppPhoneNumberId } from '@/lib/whatsapp/config'
import { resolveWhatsAppAppSecret } from '@/lib/whatsapp/config'

export const dynamic = 'force-dynamic'

type RecipientRow = {
  id: string
  shopifyCustomerId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  consentWhatsApp?: boolean | null
  consentEmail?: boolean | null
  consentSms?: boolean | null
  whatsappConsentAt?: Date | null
  whatsappConsentSource?: string | null
  emailConsentAt?: Date | null
  emailConsentSource?: string | null
  optedOutAt?: Date | null
  suppressed?: boolean | null
  lastSeenAt?: Date | null
  lastContactedAt?: Date | null
  lastChannel?: string | null
  createdAt?: Date | null
}

function reasonFor(recipient: RecipientRow): string {
  if (!recipient.phone) return 'missing_phone'
  if (recipient.suppressed) return 'suppressed'
  if (recipient.optedOutAt) return 'opted_out'
  if (!normalizeRecipientPhone(recipient.phone)) return 'invalid_phone'
  if (recipient.consentWhatsApp !== true) return 'no_consent'
  return 'eligible'
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'eligible':
      return 'Eligible for WhatsApp'
    case 'missing_phone':
      return 'No phone number captured'
    case 'invalid_phone':
      return 'Phone number is not a valid international number'
    case 'no_consent':
      return 'No explicit WhatsApp opt-in'
    case 'suppressed':
      return 'Suppressed by merchant'
    case 'opted_out':
      return 'Customer opted out'
    default:
      return reason
  }
}

async function resolveStore(request: NextRequest, userId: string) {
  const requested = request.nextUrl.searchParams.get('storeId')
  const store = requested
    ? await prisma.store.findFirst({ where: { id: requested, userId } })
    : await prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  return store
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if (!auth.success) {
      return NextResponse.json({ message: auth.error }, { status: auth.status })
    }

    const store = await resolveStore(request, auth.ctx.userId)
    if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

    const filter = (request.nextUrl.searchParams.get('filter') || 'all').toLowerCase()
    const search = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 200, 500)

    // At 500 rows this is cheap and lets the page show accurate counts for every
    // filter without issuing one query per tab.
    const rows = (await prisma.customerIdentity.findMany({
      where: { storeId: store.id },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    })) as unknown as RecipientRow[]

    const decorated = rows.map((recipient) => {
      const reason = reasonFor(recipient)
      return {
        ...recipient,
        whatsappEligible: reason === 'eligible',
        whatsappStatus: reason,
        whatsappStatusLabel: reasonLabel(reason),
      }
    })

    const counts = {
      all: decorated.length,
      eligible: decorated.filter((r) => r.whatsappStatus === 'eligible').length,
      no_consent: decorated.filter((r) => r.whatsappStatus === 'no_consent').length,
      missing_phone: decorated.filter((r) => r.whatsappStatus === 'missing_phone').length,
      invalid_phone: decorated.filter((r) => r.whatsappStatus === 'invalid_phone').length,
      opted_out: decorated.filter((r) => r.whatsappStatus === 'opted_out' || r.whatsappStatus === 'suppressed').length,
      email_only: decorated.filter((r) => Boolean(r.email) && !r.phone).length,
    }

    let filtered = decorated
    if (filter === 'eligible') filtered = filtered.filter((r) => r.whatsappStatus === 'eligible')
    else if (filter === 'no_consent') filtered = filtered.filter((r) => r.whatsappStatus === 'no_consent')
    else if (filter === 'missing_phone') filtered = filtered.filter((r) => r.whatsappStatus === 'missing_phone')
    else if (filter === 'invalid_phone') filtered = filtered.filter((r) => r.whatsappStatus === 'invalid_phone')
    else if (filter === 'opted_out' || filter === 'suppressed') {
      filtered = filtered.filter((r) => r.whatsappStatus === 'opted_out' || r.whatsappStatus === 'suppressed')
    } else if (filter === 'email_only') {
      filtered = filtered.filter((r) => Boolean(r.email) && !r.phone)
    }

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.name?.toLowerCase().includes(search) ||
          r.email?.toLowerCase().includes(search) ||
          r.phone?.toLowerCase().includes(search) ||
          String(r.shopifyCustomerId || '').includes(search),
      )
    }

    return NextResponse.json({
      recipients: filtered.slice(0, limit),
      counts,
      filter,
      diagnostics: {
        whatsapp: {
          configured: isWhatsAppConfigured(),
          phoneNumberId: resolveWhatsAppPhoneNumberId() || null,
          storePhoneNumberId: (store as any).whatsappPhoneNumberId || null,
          // Inbound STOP/START only resolves the right store when this mapping
          // exists (or the deployment has exactly one active store).
          inboundWebhookMapped: Boolean((store as any).whatsappPhoneNumberId),
          webhookSecretConfigured: Boolean(resolveWhatsAppAppSecret()),
        },
        consentRule: 'WhatsApp consent is only granted by an explicit opt-in and is never inferred from Shopify email/SMS marketing flags.',
      },
    })
  } catch (error: any) {
    console.error('List recipients error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if (!auth.success) {
      return NextResponse.json({ message: auth.error }, { status: auth.status })
    }
    if (!hasPermission(auth.ctx, 'write')) {
      return NextResponse.json({ message: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '')
    const identityId = String(body?.identityId || '')
    if (!identityId) {
      return NextResponse.json({ message: 'identityId is required' }, { status: 400 })
    }

    const identity = await prisma.customerIdentity.findUnique({ where: { id: identityId } })
    if (!identity) return NextResponse.json({ message: 'Recipient not found' }, { status: 404 })

    const store = await prisma.store.findFirst({
      where: { id: identity.storeId, userId: auth.ctx.userId },
    })
    if (!store) return NextResponse.json({ message: 'Recipient not found' }, { status: 404 })

    if (action === 'grant_whatsapp_consent') {
      // A merchant can only record consent they actually hold. The explicit
      // `attested` flag keeps this from becoming an accidental "select all and
      // mark consented" button.
      if (body?.attested !== true) {
        return NextResponse.json(
          { message: 'Explicit merchant attestation is required to record consent' },
          { status: 400 },
        )
      }
      if (!identity.phone) {
        return NextResponse.json({ message: 'Recipient has no phone number' }, { status: 400 })
      }
      const updated = await recordWhatsAppConsent({
        storeId: store.id,
        phone: identity.phone,
        email: identity.email,
        shopifyCustomerId: identity.shopifyCustomerId,
        name: identity.name,
        source: 'merchant_attestation',
      })
      return NextResponse.json({ ok: true, recipient: updated })
    }

    if (action === 'suppress' || action === 'opt_out') {
      await recordOptOut(store.id, { email: identity.email, phone: identity.phone }, 'merchant_request')
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('Update recipient error:', error)
    return NextResponse.json({ message: 'Something went wrong' }, { status: 500 })
  }
}
