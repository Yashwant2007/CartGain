import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkSimpleRateLimit } from '@/lib/rate-limit'

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
    console.warn('[WhatsApp Webhook] WHATSAPP_APP_SECRET not configured — cannot verify X-Hub-Signature-256')
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
      console.error('[WhatsApp Webhook] WHATSAPP_VERIFY_TOKEN not configured on server')
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

const MESSAGE_ENTRYPOINTS = ['messages', 'message_templates', 'message_template_status_update', 'account_alerts']

export async function POST(request: NextRequest) {
  try {
    const rate = await checkSimpleRateLimit(`webhook_whatsapp_${request.headers.get('x-forwarded-for') || 'unknown'}`)
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

    const entry = Array.isArray(body?.entry) ? body.entry[0] : null
    const changes = Array.isArray(entry?.changes) ? entry.changes[0] : null
    const value = changes?.value
    const field = changes?.field
    const entrypoint = Array.isArray(value?.entrypoint) ? value.entrypoint[0] : null

    if (!MESSAGE_ENTRYPOINTS.includes(entrypoint) || typeof field !== 'string') {
      return NextResponse.json({ status: 'ignored' })
    }

    // Store the incoming message payload for the recovery pipeline.
    const { redisSet } = await import('@/lib/redis')
    await redisSet('whatsapp:inbound', JSON.stringify({
      receivedAt: new Date().toISOString(),
      field,
      entrypoint,
      body,
    }), 24 * 60 * 60 * 1000).catch(() => {})

    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 400 })
  }
}
