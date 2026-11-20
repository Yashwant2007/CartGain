import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import prisma from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import {
  WEBHOOK_CONNECTION_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyWebhookSignature,
} from '@/lib/woocommerce/signature'
import { webhookEventSchema } from '@/lib/woocommerce/schemas'
import { claimPlatformEvent, processWooWebhookEvent, updatePlatformEvent } from '@/lib/woocommerce/events'

export const dynamic = 'force-dynamic'

function logReject(code: string, connectionId: string | null) {
  console.warn(`[woocommerce-webhook] rejected code=${code} connection=${connectionId ?? 'unknown'}`)
}

export async function POST(req: NextRequest) {
  const connectionId = req.headers.get(WEBHOOK_CONNECTION_HEADER)?.trim() || null
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    logReject('unreadable_body', connectionId)
    return NextResponse.json({ received: false }, { status: 400 })
  }

  if (!connectionId) {
    logReject('missing_connection', null)
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const connection = await prisma.platformConnection.findUnique({
    where: { id: connectionId },
    include: { store: { select: { id: true, domain: true, platform: true, webhookSecret: true } } },
  })
  if (!connection || connection.platform !== 'woocommerce' || connection.status !== 'active') {
    logReject('unknown_connection', connectionId)
    return NextResponse.json({ received: false }, { status: 401 })
  }

  let secret: string | null = null
  try {
    const encrypted = connection.webhookSecret || connection.store.webhookSecret
    secret = encrypted ? decrypt(encrypted) : null
  } catch {
    secret = null
  }
  if (!secret) {
    logReject('missing_secret', connectionId)
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const signatureValid = verifyWebhookSignature({
    rawBody,
    signature: req.headers.get(WEBHOOK_SIGNATURE_HEADER),
    timestamp: req.headers.get(WEBHOOK_TIMESTAMP_HEADER),
    secret,
  })
  if (!signatureValid) {
    logReject('invalid_signature', connectionId)
    await prisma.webhookDelivery
      .create({
        data: {
          storeId: connection.storeId,
          platform: 'woocommerce',
          connectionId: connection.id,
          status: 'rejected',
          signatureValid: false,
          errorCode: 'invalid_signature',
          httpStatus: 401,
        },
      })
      .catch(() => undefined)
    return NextResponse.json({ received: false }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    await prisma.webhookDelivery
      .create({
        data: {
          storeId: connection.storeId,
          platform: 'woocommerce',
          connectionId: connection.id,
          status: 'rejected',
          signatureValid: true,
          errorCode: 'invalid_json',
          httpStatus: 200,
        },
      })
      .catch(() => undefined)
    return NextResponse.json({ received: true, skipped: 'invalid_json' })
  }

  const parsed = webhookEventSchema.safeParse(payload)
  if (!parsed.success) {
    await prisma.webhookDelivery
      .create({
        data: {
          storeId: connection.storeId,
          platform: 'woocommerce',
          connectionId: connection.id,
          status: 'rejected',
          signatureValid: true,
          errorCode: 'invalid_payload',
          httpStatus: 200,
        },
      })
      .catch(() => undefined)
    return NextResponse.json({ received: true, skipped: 'invalid_payload' })
  }

  const event = parsed.data
  if (event.connectionId && event.connectionId !== connectionId) {
    logReject('connection_mismatch', connectionId)
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date()
  const platformEvent = await claimPlatformEvent({
    storeId: connection.storeId,
    platform: 'woocommerce',
    eventId: event.eventId,
    eventType: event.type,
    connectionId: connection.id,
    occurredAt: Number.isFinite(occurredAt.getTime()) ? occurredAt : null,
  })

  if (!platformEvent) {
    await prisma.webhookDelivery
      .updateMany({
        where: { storeId: connection.storeId, platform: 'woocommerce', eventId: event.eventId },
        data: { status: 'duplicate', processedAt: new Date() },
      })
      .catch(() => undefined)
    return NextResponse.json({ received: true, duplicate: true })
  }

  await prisma.webhookDelivery
    .create({
      data: {
        storeId: connection.storeId,
        platform: 'woocommerce',
        connectionId: connection.id,
        eventId: event.eventId,
        topic: event.type,
        status: 'verified',
        signatureValid: true,
        httpStatus: 200,
      },
    })
    .catch(() => undefined)

  waitUntil(
    (async () => {
      try {
        const result = await processWooWebhookEvent(
          event,
          { store: connection.store, connection: { id: connection.id, status: connection.status } },
          platformEvent,
        )
        await updatePlatformEvent(platformEvent, result.status, result.detail)
        await prisma.webhookDelivery
          .updateMany({
            where: { storeId: connection.storeId, platform: 'woocommerce', eventId: event.eventId },
            data: { status: result.status, processedAt: new Date() },
          })
          .catch(() => undefined)
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'processing_failed'
        console.error(`[woocommerce-webhook] processing failed code=${code} event=${event.eventId} type=${event.type}`)
        await updatePlatformEvent(platformEvent, 'failed', undefined, code).catch(() => undefined)
        await prisma.webhookDelivery
          .updateMany({
            where: { storeId: connection.storeId, platform: 'woocommerce', eventId: event.eventId },
            data: { status: 'failed', errorCode: code, processedAt: new Date() },
          })
          .catch(() => undefined)
      }
    })(),
  )

  return NextResponse.json({ received: true })
}
