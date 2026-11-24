import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { CUSTOMER_PAYMENT_PROVIDER } from '@/lib/customer-payments/razorpay'

export const dynamic = 'force-dynamic'

const CREDENTIAL_KIND = 'customer_order_key_secret'

function unavailable() {
  return NextResponse.json({ message: 'Not available' }, { status: 404 })
}

async function resolveStore(userId: string, storeId: string | null) {
  if (!storeId) return null
  return prisma.store.findFirst({ where: { id: storeId, userId }, select: { id: true } })
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12)
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled('CUSTOMER_RAZORPAY_PAYMENT_LINK')) return unavailable()
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const store = await resolveStore(session.user.id, request.nextUrl.searchParams.get('storeId'))
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  const connection = await prisma.platformConnection.findUnique({
    where: { storeId_platform: { storeId: store.id, platform: CUSTOMER_PAYMENT_PROVIDER } },
    select: {
      status: true,
      webhookSecret: true,
      credentials: {
        where: { kind: CREDENTIAL_KIND, status: 'active' },
        select: { keyFingerprint: true, status: true, lastUsedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
  const credential = connection?.credentials[0]
  return NextResponse.json({
    configured: Boolean(connection && credential),
    status: credential?.status ?? 'not_configured',
    keyFingerprint: credential?.keyFingerprint ?? null,
    webhookConfigured: Boolean(connection?.webhookSecret),
    lastUsedAt: credential?.lastUsedAt ?? null,
  })
}

export async function PUT(request: NextRequest) {
  if (!isFeatureEnabled('CUSTOMER_RAZORPAY_PAYMENT_LINK')) return unavailable()
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const store = await resolveStore(session.user.id, typeof body?.storeId === 'string' ? body.storeId : null)
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  const keyId = bounded(body?.keyId, 128)
  const keySecret = bounded(body?.keySecret, 256)
  const webhookSecret = bounded(body?.webhookSecret, 256)
  if (!keyId || !keySecret || !webhookSecret) {
    return NextResponse.json({ message: 'keyId, keySecret and webhookSecret are required' }, { status: 400 })
  }

  const keyFingerprint = fingerprint(keyId)
  await prisma.$transaction(async (tx) => {
    const connection = await tx.platformConnection.upsert({
      where: { storeId_platform: { storeId: store.id, platform: CUSTOMER_PAYMENT_PROVIDER } },
      create: {
        storeId: store.id,
        platform: CUSTOMER_PAYMENT_PROVIDER,
        status: 'active',
        webhookSecret: encrypt(webhookSecret),
      },
      update: {
        status: 'active',
        revokedAt: null,
        webhookSecret: encrypt(webhookSecret),
      },
      select: { id: true },
    })
    const existing = await tx.platformCredential.findFirst({
      where: { connectionId: connection.id, platform: CUSTOMER_PAYMENT_PROVIDER, kind: CREDENTIAL_KIND },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    const data = {
      keyEncrypted: encrypt(keyId),
      secretEncrypted: encrypt(keySecret),
      keyFingerprint,
      status: 'active',
      revokedAt: null,
      expiresAt: null,
    }
    if (existing) {
      await tx.platformCredential.update({ where: { id: existing.id }, data })
    } else {
      await tx.platformCredential.create({
        data: {
          ...data,
          connectionId: connection.id,
          platform: CUSTOMER_PAYMENT_PROVIDER,
          kind: CREDENTIAL_KIND,
        },
      })
    }
  })

  return NextResponse.json({ configured: true, keyFingerprint, webhookConfigured: true })
}

export async function DELETE(request: NextRequest) {
  if (!isFeatureEnabled('CUSTOMER_RAZORPAY_PAYMENT_LINK')) return unavailable()
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const store = await resolveStore(session.user.id, request.nextUrl.searchParams.get('storeId'))
  if (!store) return NextResponse.json({ message: 'Store not found' }, { status: 404 })

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const connection = await tx.platformConnection.findUnique({
      where: { storeId_platform: { storeId: store.id, platform: CUSTOMER_PAYMENT_PROVIDER } },
      select: { id: true },
    })
    if (!connection) return
    await tx.platformCredential.updateMany({
      where: { connectionId: connection.id, platform: CUSTOMER_PAYMENT_PROVIDER, status: 'active' },
      data: { status: 'revoked', revokedAt: now },
    })
    await tx.platformConnection.update({
      where: { id: connection.id },
      data: { status: 'revoked', revokedAt: now, webhookSecret: null },
    })
  })

  return NextResponse.json({ ok: true })
}
