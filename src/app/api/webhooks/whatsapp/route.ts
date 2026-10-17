import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkSimpleRateLimit, clientIp } from '@/lib/rate-limit'
import { logWarn, logInfo } from '@/lib/observability/logger'
import { parseWhatsAppEvents, isWhatsAppOptOutText } from '@/lib/whatsapp/inbound'

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
function verifyHubSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const expected = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader
  if (!/^[a-f0-9]{64}$/.test(expected)) return false
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    logWarn('whatsapp', 'webhook_verify', 'WHATSAPP_APP_SECRET not configured — cannot verify X-Hub-Signature-256')
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

    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN

    if (!expectedToken) {
      logWarn('whatsapp', 'webhook_verify', 'WHATSAPP_VERIFY_TOKEN not configured on server')
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
    // (the previous single `redisSet` key silently overwrote all but the last
    // event). Status events update delivery tracking; inbound messages are the
    // customer's reply channel and may carry an opt-out.
    const { redisLPush } = await import('@/lib/redis')
    const receivedAt = new Date().toISOString()
    let delivered = 0
    let inboundMessages = 0

    for (const event of events) {
      await redisLPush('whatsapp:inbound', JSON.stringify({ receivedAt, ...event }), 500).catch(() => {})

      if (event.kind === 'status') {
        delivered++
        logInfo('whatsapp', 'delivery_status', `WhatsApp delivery status: ${event.status}`, {
          wamid: event.wamid,
          status: event.status,
        })
      } else {
        inboundMessages++
        if (isWhatsAppOptOutText(event.text)) {
          // NOTE: mapping an inbound WhatsApp number → store needs a per-store
          // phone_number_id registry (not yet modelled). Until then we surface
          // the opt-out loudly instead of silently ignoring it.
          logWarn('whatsapp', 'inbound_opt_out', 'Inbound WhatsApp opt-out keyword received', {
            from: event.from,
            phoneNumberId: event.phoneNumberId,
          })
        } else {
          logInfo('whatsapp', 'inbound_message', 'Inbound WhatsApp message received', {
            from: event.from,
            phoneNumberId: event.phoneNumberId,
          })
        }
      }
    }

    return NextResponse.json({ status: 'ok', statuses: delivered, messages: inboundMessages })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 400 })
  }
}
