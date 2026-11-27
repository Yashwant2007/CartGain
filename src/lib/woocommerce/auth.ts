import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAuthContext, unauthorizedResponse } from '@/lib/embedded-auth'
import prisma from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import {
  PLUGIN_STORE_HEADER,
  WEBHOOK_CONNECTION_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  verifyPluginRequest,
} from './signature'

type MerchantContext = {
  ok: true
  userId: string
  storeId: string
  store: { id: string; name: string; domain: string; platform: string }
}

type MerchantResult = MerchantContext | { ok: false; response: NextResponse }

async function requireWooPluginStore(req: NextRequest): Promise<MerchantResult> {
  const connectionId = req.headers.get(WEBHOOK_CONNECTION_HEADER)?.trim()
  const storeId = req.headers.get(PLUGIN_STORE_HEADER)?.trim()
  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER)
  const timestamp = req.headers.get(WEBHOOK_TIMESTAMP_HEADER)
  if (!connectionId || !storeId || !signature || !timestamp) {
    return { ok: false, response: unauthorizedResponse() }
  }

  const connection = await prisma.platformConnection.findUnique({
    where: { id: connectionId },
    include: {
      store: { select: { id: true, name: true, domain: true, platform: true, webhookSecret: true } },
    },
  })
  if (
    !connection ||
    connection.platform !== 'woocommerce' ||
    connection.status !== 'active' ||
    connection.storeId !== storeId ||
    connection.store.platform === 'shopify'
  ) {
    return { ok: false, response: unauthorizedResponse() }
  }

  let secret: string | null = null
  try {
    const encrypted = connection.webhookSecret || connection.store.webhookSecret
    secret = encrypted ? decrypt(encrypted) : null
  } catch {
    secret = null
  }
  if (!secret) return { ok: false, response: unauthorizedResponse() }

  let rawBody = ''
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      rawBody = await req.clone().text()
    } catch {
      return { ok: false, response: unauthorizedResponse() }
    }
  }

  const valid = verifyPluginRequest({
    rawBody,
    signature,
    timestamp,
    storeId,
    secret,
  })
  if (!valid) return { ok: false, response: unauthorizedResponse() }

  return {
    ok: true,
    userId: `plugin:${connection.id}`,
    storeId: connection.store.id,
    store: {
      id: connection.store.id,
      name: connection.store.name,
      domain: connection.store.domain,
      platform: connection.store.platform,
    },
  }
}

export async function requireWooMerchantStore(req: NextRequest): Promise<MerchantResult> {
  const auth = await getAuthContext(req)
  if (!auth?.user?.id) return requireWooPluginStore(req)

  let store = auth.store?.id
    ? await prisma.store.findFirst({
        where: { id: auth.store.id, userId: auth.user.id },
        select: { id: true, name: true, domain: true, platform: true },
      })
    : null

  if (!store || store.platform !== 'woocommerce') {
    store =
      (await prisma.store.findFirst({
        where: { userId: auth.user.id, platform: 'woocommerce' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, domain: true, platform: true },
      })) ??
      (auth.store
        ? await prisma.store.findFirst({
            where: { id: auth.store.id, userId: auth.user.id, platform: { not: 'shopify' } },
            select: { id: true, name: true, domain: true, platform: true },
          })
        : null)
  }

  if (!store) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'No WooCommerce store is connected to this account' },
        { status: 404 },
      ),
    }
  }

  return { ok: true, userId: auth.user.id, storeId: store.id, store }
}
