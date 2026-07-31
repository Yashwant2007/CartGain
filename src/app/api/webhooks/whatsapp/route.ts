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

    const body = await request.json()

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
