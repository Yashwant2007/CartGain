import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { logWarn, logInfo } from '@/lib/observability/logger'
import { parseWhatsAppEvents, isWhatsAppOptInText, isWhatsAppOptOutText } from '@/lib/whatsapp/inbound'
import { resolveStoreIdByWhatsAppPhoneNumberId } from '@/lib/whatsapp/store-registry'
import { recordOptOut } from '@/lib/opt-out'
import { recordWhatsAppConsent } from '@/lib/recovery/recipients'
import { resolveWhatsAppAppSecret, resolveWhatsAppPhoneNumberId, resolveWhatsAppVerifyToken } from '@/lib/whatsapp/config'

export const dynamic = 'force-dynamic'

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// Meta signs every inbound webhook POST with X-Hub-Signature-256:
//   sha256=<HMAC-SHA256(rawBody, appSecret)>
// Everything except the sha256= prefix is the lowercase hex digest.
// Verify before trusting anything Meta claims to have sent.
// Resolve every store that can own this inbound contact.
//
// Direct store mapping (Store.whatsappPhoneNumberId) is authoritative. But most
// deployments run one business number for many stores and the column is often
// unset — the old code then dropped the STOP entirely, which is the worst
// outcome. Fall back to the stores that actually hold a cart for this phone
// number; a STOP must always land somewhere.
async function resolveInboundStoreIds(
  phoneNumberId: string | null | undefined,
  from: string | null | undefined,
): Promise<string[]> {
  const direct = await resolveStoreIdByWhatsAppPhoneNumberId(prisma, phoneNumberId, {
    sharedPhoneNumberId: resolveWhatsAppPhoneNumberId() || null,
  }).catch(() => null)
  if (direct) return [direct]

  const digits = (from || '').replace(/\D/g, '')
  if (digits.length < 8) return []

  const carts = await prisma.cart
    .findMany({
      where: { customerPhone: { contains: digits } },
      select: { storeId: true },
      distinct: ['storeId'],
      take: 20,
    })
    .catch(() => [] as Array<{ storeId: string }>)
  return Array.from(new Set(carts.map((c) => c.storeId)))
}

function verifyHubSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const expected = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader
  if (!/^[a-f0-9]{64}$/.test(expected)) return false
  const appSecret = resolveWhatsAppAppSecret()
  if (!appSecret) {
    logWarn('whatsapp', 'webhook_verify', 'Meta app secret not configured (WHATSAPP_APP_SECRET / META_APP_SECRET / FACEBOOK_APP_SECRET) — cannot verify X-Hub-Signature-256')
    return false
  }
  const actual = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return tokensEqual(actual, expected)
}

export async function GET(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get('hub.mode')
    const token = request.nextUrl.searchParams.get('hub.verify_token')
    const challenge = request.nextUrl.searchParams.get('hub.challenge')

    const expectedToken = resolveWhatsAppVerifyToken()

    if (!expectedToken) {
      logWarn('whatsapp', 'webhook_verify', 'WhatsApp verify token not configured (WHATSAPP_VERIFY_TOKEN / META_VERIFY_TOKEN / FACEBOOK_VERIFY_TOKEN)')
      return new NextResponse('Webhook not configured', { status: 500 })
    }

    if (
      mode === 'subscribe' &&
      token &&
      challenge &&
      tokensEqual(token, expectedToken)
    ) {
      return new NextResponse(challenge, { status: 200 })
    }

    return new NextResponse('Forbidden — token mismatch', { status: 403 })
  } catch {
    return new NextResponse('Server error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`webhook_whatsapp_${clientIp(request.headers)}`)
    if (!rate.allowed) {
      return NextResponse.json({ status: 'rate_limited' }, { status: 429 })
    }

    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')

    // Fail-closed: an unsigned/unverifiable inbound message from Meta is rejected.
    if (!verifyHubSignature(rawBody, signature)) {
      return NextResponse.json({ status: 'invalid_signature' }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

    const events = parseWhatsAppEvents(body)
    if (events.length === 0) {
      return NextResponse.json({ status: 'ignored' })
    }

    // Persist every event to a bounded, append-only list so none are lost
    const { redisLPush } = await import('@/lib/redis')
    const receivedAt = new Date().toISOString()
    let delivered = 0
    let read = 0
    let inboundMessages = 0

    for (const event of events) {
      await redisLPush('whatsapp:inbound', JSON.stringify({ receivedAt, ...event }), 500).catch(() => {})

      if (event.kind === 'status') {
        if (event.status === 'delivered') delivered++
        if (event.status === 'read') read++
        // Match the receipt back to the message that produced it
        if (event.wamid) {
          const storeId = await resolveStoreIdByWhatsAppPhoneNumberId(
            prisma,
            event.phoneNumberId,
            { sharedPhoneNumberId: resolveWhatsAppPhoneNumberId() || null },
          ).catch(() => null)
          const where = {
            providerId: event.wamid,
            ...(storeId ? { cart: { storeId } } : {}),
          }
          if (event.status === 'read') {
            await prisma.message
              .updateMany({
                where,
                data: { status: 'read', deliveredAt: new Date() },
              })
              .catch(() => {})
            await prisma.recoveryReminder
              .updateMany({
                where: { providerId: event.wamid, ...(storeId ? { storeId } : {}) },
                data: { status: 'read', deliveredAt: new Date() },
              })
              .catch(() => {})
          } else if (event.status === 'delivered') {
            await prisma.message
              .updateMany({
                where: { ...where, status: { not: 'read' } },
                data: { status: 'delivered', deliveredAt: new Date() },
              })
              .catch(() => {})
            await prisma.recoveryReminder
              .updateMany({
                where: { providerId: event.wamid, ...(storeId ? { storeId } : {}) },
                data: { status: 'delivered', deliveredAt: new Date() },
              })
              .catch(() => {})
          } else if (event.status === 'failed') {
            await prisma.message
              .updateMany({ where, data: { status: 'failed' } })
              .catch(() => {})
            await prisma.recoveryReminder
              .updateMany({
                where: { providerId: event.wamid, ...(storeId ? { storeId } : {}) },
                data: { status: 'failed', failedAt: new Date(), reasonCode: 'provider_failed' },
              })
              .catch(() => {})
          }
        }
        logInfo('whatsapp', 'delivery_status', `WhatsApp delivery status: ${event.status}`, {
          wamid: event.wamid,
          status: event.status,
        })
      } else {
        inboundMessages++
        if (isWhatsAppOptOutText(event.text)) {
          const storeIds = event.from
            ? await resolveInboundStoreIds(event.phoneNumberId, event.from)
            : []

          if (storeIds.length > 0 && event.from) {
            let persisted = 0
            for (const storeId of storeIds) {
              const ok = await recordOptOut(storeId, { phone: event.from })
                .then(() => true)
                .catch((error) => {
                  logWarn('whatsapp', 'inbound_opt_out', 'Failed to persist inbound WhatsApp opt-out', {
                    from: event.from,
                    phoneNumberId: event.phoneNumberId,
                    storeId,
                    error: error instanceof Error ? error.message : String(error),
                  })
                  return false
                })
              if (ok) persisted++
            }
            if (persisted > 0) {
              logInfo('whatsapp', 'inbound_opt_out', 'Inbound WhatsApp opt-out persisted', {
                from: event.from,
                phoneNumberId: event.phoneNumberId,
                stores: persisted,
              })
            }
          } else {
            logWarn('whatsapp', 'inbound_opt_out', 'Inbound WhatsApp opt-out received but no store could be resolved', {
              from: event.from,
              phoneNumberId: event.phoneNumberId,
            })
          }
        } else if (isWhatsAppOptInText(event.text)) {
          const storeIds = event.from
            ? await resolveInboundStoreIds(event.phoneNumberId, event.from)
            : []

          if (storeIds.length > 0 && event.from) {
            let saved = 0
            for (const storeId of storeIds) {
              const ok = await recordWhatsAppConsent({
                storeId,
                phone: event.from,
                source: 'whatsapp_keyword',
              })
                .then((identity) => Boolean(identity))
                .catch((error) => {
                  logWarn('whatsapp', 'inbound_opt_in', 'Failed to persist inbound WhatsApp opt-in', {
                    from: event.from,
                    phoneNumberId: event.phoneNumberId,
                    storeId,
                    error: error instanceof Error ? error.message : String(error),
                  })
                  return false
                })
              if (ok) saved++
            }
            if (saved > 0) {
              logInfo('whatsapp', 'inbound_opt_in', 'Inbound WhatsApp opt-in persisted', {
                from: event.from,
                phoneNumberId: event.phoneNumberId,
                stores: saved,
              })
            }
          } else {
            logWarn('whatsapp', 'inbound_opt_in', 'Inbound WhatsApp opt-in received but no store could be resolved', {
              from: event.from,
              phoneNumberId: event.phoneNumberId,
            })
          }
        } else {
          logInfo('whatsapp', 'inbound_message', 'Inbound WhatsApp message received', {
            from: event.from,
            phoneNumberId: event.phoneNumberId,
          })
        }
      }
    }

    return NextResponse.json({ status: 'ok', statuses: delivered + read, messages: inboundMessages, delivered, read })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 400 })
  }
}
