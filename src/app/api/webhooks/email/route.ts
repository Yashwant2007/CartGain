import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import prisma from '@/lib/db'
import { logInfo, logWarn } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

/**
 * Resend delivery webhook.
 *
 * Email providers acknowledge a send long before the mailbox does. Without
 * this endpoint "delivered" would either be a guess (the old behaviour: set at
 * send time) or permanently empty. Resend signs every event with Svix, and
 * the `email_id` it reports is the same id stored on `Message.providerId`, so
 * a receipt can be matched to exactly one message.
 *
 * Events handled:
 *   email.delivered  → status delivered, deliveredAt set
 *   email.bounced    → status failed
 *   email.complained → status failed (a spam complaint is not a delivery)
 */
function svixSecret(): Buffer | null {
  const raw = process.env.RESEND_WEBHOOK_SECRET
  if (!raw) return null
  const withoutPrefix = raw.startsWith('whsec_') ? raw.slice('whsec_'.length) : raw
  try {
    return Buffer.from(withoutPrefix, 'base64')
  } catch {
    return null
  }
}

function verifySvix(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null }
): boolean {
  const secret = svixSecret()
  if (!secret) return false
  if (!headers.id || !headers.timestamp || !headers.signature) return false

  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) return false
  // 5 minutes of tolerance — enough for clock skew, small enough to blunt replay.
  if (Math.abs(Date.now() / 1000 - timestamp) > 5 * 60) return false

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(signedContent, 'utf8').digest('base64')

  const candidates = headers.signature
    .split(' ')
    .map((part) => {
      const [, value] = part.split(',')
      return value || ''
    })
    .filter(Boolean)

  return candidates.some((candidate) => {
    const a = Buffer.from(candidate)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    const valid = verifySvix(rawBody, {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    })
    if (!valid) {
      logWarn('email', 'webhook_verify', 'Rejected email webhook with missing/invalid Svix signature')
      return NextResponse.json({ status: 'invalid_signature' }, { status: 401 })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ status: 'invalid_json' }, { status: 400 })
    }

    const type = typeof body?.type === 'string' ? body.type : ''
    const providerId = body?.data?.email_id
    if (!providerId || typeof providerId !== 'string') {
      return NextResponse.json({ status: 'ignored' })
    }

    if (type === 'email.delivered') {
      const updated = await prisma.message.updateMany({
        where: { providerId, deliveredAt: null },
        data: { status: 'delivered', deliveredAt: new Date() },
      })
      logInfo('email', 'delivery_status', 'Email delivered', { providerId, updated: updated.count })
      return NextResponse.json({ status: 'ok' })
    }

    if (type === 'email.bounced' || type === 'email.failed' || type === 'email.complained') {
      const updated = await prisma.message.updateMany({
        where: { providerId },
        data: { status: 'failed' },
      })
      logInfo('email', 'delivery_status', `Email ${type}`, { providerId, updated: updated.count })
      return NextResponse.json({ status: 'ok' })
    }

    return NextResponse.json({ status: 'ignored' })
  } catch (error) {
    logWarn('email', 'webhook_error', 'Email webhook failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
