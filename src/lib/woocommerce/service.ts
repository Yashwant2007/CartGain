import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import type {
  PlatformConnectionConfig,
  PlatformCouponInput,
  PlatformCouponResult,
  PlatformListOptions,
  PlatformProductRecord,
} from '@/lib/platforms/types'
import { getPlatformAdapter } from '@/lib/platforms/registry'
import prisma from '@/lib/db'
import { decrypt, encrypt } from '@/lib/encryption'
import { assertPublicHttpsUrl, normalizeStoreUrl, UnsafeStoreUrlError } from './url'
import { buildConnectionProof, credentialFingerprint, deriveWebhookSecret } from './signature'
import { normalizeCartItems, normalizeCustomer, normalizeOrderEvent, normalizeProduct } from './normalize'
import { WooCommerceClient } from './client'

export class WooServiceError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message?: string) {
    super(message || code)
    this.name = 'WooServiceError'
    this.code = code
    this.status = status
  }
}

type StoreRef = {
  id: string
  name: string
  domain: string
  platform: string
  apiKey: string | null
}

type ConnectionBundle = {
  store: StoreRef
  connection: {
    id: string
    storeId: string
    status: string
    storeUrl: string | null
    webhookUrl: string | null
    webhookSecret: string | null
    externalStoreId: string | null
    lastHealthStatus: string | null
    lastHealthCheckAt: Date | null
  }
  config: PlatformConnectionConfig
}

export const CONNECTION_INTENT_TTL_MS = 10 * 60 * 1000

function jsonOrNull(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === undefined || value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

export async function createConnectionIntent(storeId: string, installId?: string) {
  const code = crypto.randomBytes(32).toString('base64url')
  const codeHash = crypto.createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(Date.now() + CONNECTION_INTENT_TTL_MS)
  await prisma.connectionIntent.create({
    data: { codeHash, storeId, platform: 'woocommerce', installId: installId ?? null, expiresAt },
  })
  return { code, expiresAt }
}

export async function consumeConnectionIntent(code: string) {
  const codeHash = crypto.createHash('sha256').update(code).digest('hex')
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.connectionIntent.updateMany({
      where: { codeHash, platform: 'woocommerce', status: 'pending', expiresAt: { gt: new Date() } },
      data: { status: 'consumed', consumedAt: new Date() },
    })
    if (claimed.count !== 1) {
      throw new WooServiceError('invalid_or_expired_code', 400)
    }
    const intent = await tx.connectionIntent.findUnique({ where: { codeHash } })
    if (!intent) throw new WooServiceError('invalid_or_expired_code', 400)
    return intent
  })
}

export async function connectWooCommerce(input: {
  code: string
  storeUrl: string
  storeName?: string
  currency?: string
  timezone?: string
  installId: string
  proof: string
  consumerKey: string
  consumerSecret: string
  webhookUrl: string
}) {
  let storeUrl: string
  try {
    storeUrl = normalizeStoreUrl(await assertPublicHttpsUrl(input.storeUrl))
  } catch (error) {
    if (error instanceof UnsafeStoreUrlError) throw new WooServiceError('unsafe_store_url', 400, error.message)
    throw new WooServiceError('unsafe_store_url', 400)
  }

  const expectedProof = buildConnectionProof({ code: input.code, installId: input.installId, storeUrl })
  if (!crypto.timingSafeEqual(Buffer.from(expectedProof, 'hex'), Buffer.from(input.proof.toLowerCase(), 'hex'))) {
    throw new WooServiceError('invalid_proof', 400)
  }

  const intent = await consumeConnectionIntent(input.code)
  if (intent.installId && intent.installId !== input.installId) {
    throw new WooServiceError('install_id_mismatch', 400)
  }

  const adapter = getPlatformAdapter('woocommerce')
  if (!adapter) throw new WooServiceError('adapter_unavailable', 500)

  const credentials = { key: input.consumerKey, secret: input.consumerSecret }
  const verification = await adapter.verifyConnection({
    storeId: intent.storeId,
    storeUrl,
    credentials,
  })
  if (!verification.verified) {
    throw new WooServiceError('credential_verification_failed', 400)
  }

  const existingStore = await prisma.store.findUnique({
    where: { id: intent.storeId },
    select: { id: true, name: true, domain: true, platform: true, apiKey: true, currency: true, timezone: true },
  })
  if (!existingStore) throw new WooServiceError('store_not_found', 404)
  if (existingStore.platform === 'shopify' && existingStore.apiKey) {
    throw new WooServiceError('shopify_store_must_be_disconnected', 409)
  }
  const conflictingStore = await prisma.store.findFirst({
    where: { userId: (await prisma.store.findUniqueOrThrow({ where: { id: intent.storeId }, select: { userId: true } })).userId, domain: storeUrl, NOT: { id: intent.storeId } },
    select: { id: true },
  })
  if (conflictingStore) throw new WooServiceError('store_url_in_use', 409)

  const webhookSecret = deriveWebhookSecret({
    code: input.code,
    installId: input.installId,
    storeUrl,
    consumerSecret: input.consumerSecret,
  })
  const profile = verification.profile ?? {}
  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    await tx.store.update({
      where: { id: intent.storeId },
      data: {
        platform: 'woocommerce',
        name: profile.name || input.storeName || existingStore.name,
        domain: storeUrl,
        currency: profile.currency || input.currency || existingStore.currency,
        timezone: profile.timezone || input.timezone || existingStore.timezone,
        apiKey: encrypt(input.consumerKey),
        apiSecret: encrypt(input.consumerSecret),
        webhookSecret: encrypt(webhookSecret),
        externalStoreId: profile.externalId ?? null,
        platformStatus: 'connected',
        platformConnectedAt: now,
        platformLastSyncAt: now,
      },
    })

    const connection = await tx.platformConnection.upsert({
      where: { storeId_platform: { storeId: intent.storeId, platform: 'woocommerce' } },
      create: {
        storeId: intent.storeId,
        platform: 'woocommerce',
        status: 'active',
        externalStoreId: profile.externalId ?? null,
        storeUrl,
        webhookUrl: input.webhookUrl,
        webhookSecret: encrypt(webhookSecret),
        connectedAt: now,
        revokedAt: null,
        metadata: {
          name: profile.name || input.storeName || existingStore.name,
          currency: profile.currency || input.currency || existingStore.currency,
          timezone: profile.timezone || input.timezone || existingStore.timezone,
        },
      },
      update: {
        status: 'active',
        externalStoreId: profile.externalId ?? null,
        storeUrl,
        webhookUrl: input.webhookUrl,
        webhookSecret: encrypt(webhookSecret),
        connectedAt: now,
        revokedAt: null,
        metadata: {
          name: profile.name || input.storeName || existingStore.name,
          currency: profile.currency || input.currency || existingStore.currency,
          timezone: profile.timezone || input.timezone || existingStore.timezone,
        },
      },
    })

    await tx.platformCredential.updateMany({
      where: { connectionId: connection.id, status: 'active' },
      data: { status: 'revoked', revokedAt: now },
    })
    await tx.platformCredential.create({
      data: {
        connectionId: connection.id,
        platform: 'woocommerce',
        kind: 'consumer_key_secret',
        keyEncrypted: encrypt(input.consumerKey),
        secretEncrypted: encrypt(input.consumerSecret),
        keyFingerprint: credentialFingerprint(input.consumerKey),
        status: 'active',
        lastUsedAt: now,
      },
    })

    await tx.connectionIntent.updateMany({
      where: { id: intent.id, status: 'pending' },
      data: { status: 'consumed', consumedAt: now },
    })

    return connection
  })

  return {
    connected: true,
    storeId: intent.storeId,
    connectionId: result.id,
    platform: 'woocommerce',
    status: 'active',
    installId: intent.installId ?? input.installId,
    webhookUrl: input.webhookUrl,
    externalStoreId: profile.externalId ?? null,
  }
}

export async function getWooConnectionBundle(storeId: string): Promise<ConnectionBundle | null> {
  const connection = await prisma.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: 'woocommerce' } },
    include: {
      credentials: { where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!connection || connection.status !== 'active' || !connection.credentials.length) return null

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, domain: true, platform: true, apiKey: true },
  })
  if (!store) return null

  const credential = connection.credentials[0]
  let consumerKey: string
  let consumerSecret: string
  let webhookSecret: string | null = null
  try {
    consumerKey = decrypt(credential.keyEncrypted)
    consumerSecret = decrypt(credential.secretEncrypted)
    if (connection.webhookSecret) webhookSecret = decrypt(connection.webhookSecret)
  } catch {
    throw new WooServiceError('credential_decryption_failed', 500)
  }

  const storeUrl = connection.storeUrl || store.domain
  return {
    store,
    connection: {
      id: connection.id,
      storeId: connection.storeId,
      status: connection.status,
      storeUrl: connection.storeUrl,
      webhookUrl: connection.webhookUrl,
      webhookSecret: connection.webhookSecret,
      externalStoreId: connection.externalStoreId,
      lastHealthStatus: connection.lastHealthStatus,
      lastHealthCheckAt: connection.lastHealthCheckAt,
    },
    config: {
      storeId,
      storeUrl,
      credentials: { key: consumerKey, secret: consumerSecret },
      webhookSecret,
      connectionId: connection.id,
    },
  }
}

export async function getWooStatus(storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, domain: true, platform: true, platformStatus: true, platformLastSyncAt: true },
  })
  const connection = await prisma.platformConnection.findUnique({
    where: { storeId_platform: { storeId, platform: 'woocommerce' } },
    include: {
      credentials: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { products: true, orders: true } },
    },
  })

  if (!connection) {
    return {
      connected: false,
      storeId,
      platform: 'woocommerce',
      status: store?.platformStatus ?? 'disconnected',
      webhookConfigured: false,
      credential: null,
      health: null,
      lastSyncAt: store?.platformLastSyncAt?.toISOString() ?? null,
      counts: { products: 0, orders: 0 },
    }
  }

  const credential = connection.credentials[0]
  return {
    connected: connection.status === 'active' && credential?.status === 'active',
    storeId,
    platform: 'woocommerce',
    status: connection.status,
    storeUrl: connection.storeUrl || store?.domain || null,
    webhookUrl: connection.webhookUrl,
    webhookConfigured: Boolean(connection.webhookSecret),
    credential: credential
      ? { status: credential.status, fingerprint: credential.keyFingerprint, createdAt: credential.createdAt.toISOString() }
      : null,
    health: connection.lastHealthStatus
      ? { status: connection.lastHealthStatus, checkedAt: connection.lastHealthCheckAt?.toISOString() ?? null }
      : null,
    lastSyncAt: store?.platformLastSyncAt?.toISOString() ?? null,
    counts: { products: connection._count.products, orders: connection._count.orders },
  }
}

export async function disconnectWooCommerce(storeId: string) {
  const bundle = await getWooConnectionBundle(storeId)
  let remoteRevocation = 'skipped'

  if (bundle) {
    try {
      const client = new WooCommerceClient(bundle.config)
      await client.revokePluginKeys()
      remoteRevocation = 'succeeded'
    } catch {
      remoteRevocation = 'failed'
    }
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.platformConnection.updateMany({
      where: { storeId, platform: 'woocommerce' },
      data: { status: 'revoked', revokedAt: now, webhookSecret: null },
    }),
    prisma.platformCredential.updateMany({
      where: { connectionId: bundle?.connection.id ?? '', status: 'active' },
      data: { status: 'revoked', revokedAt: now },
    }),
    prisma.store.updateMany({
      where: { id: storeId, platform: 'woocommerce' },
      data: { apiKey: null, apiSecret: null, webhookSecret: null, platformStatus: 'revoked', platformLastSyncAt: now },
    }),
    prisma.connectionIntent.updateMany({
      where: { storeId, platform: 'woocommerce', status: 'pending' },
      data: { status: 'revoked' },
    }),
  ])

  return { disconnected: true, remoteRevocation }
}

export async function checkWooHealth(storeId: string) {
  const bundle = await getWooConnectionBundle(storeId)
  if (!bundle) throw new WooServiceError('not_connected', 404)

  const adapter = getPlatformAdapter('woocommerce')
  if (!adapter) throw new WooServiceError('adapter_unavailable', 500)

  const result = await adapter.healthCheck(bundle.config)
  await prisma.platformConnection.update({
    where: { id: bundle.connection.id },
    data: {
      lastHealthCheckAt: result.checkedAt,
      lastHealthStatus: result.status,
      lastHealthDetail: result.errorCode ?? null,
    },
  })
  return {
    ok: result.ok,
    status: result.status,
    checks: result.checks,
    checkedAt: result.checkedAt.toISOString(),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  }
}

function productUpsertData(
  storeId: string,
  connectionId: string,
  item: PlatformProductRecord,
  variantKey: string,
) {
  return {
    storeId,
    connectionId,
    platform: 'woocommerce',
    platformProductId: item.platformProductId,
    variantKey,
    platformVariantId: item.platformVariantId ?? null,
    parentProductId: item.parentProductId ?? null,
    kind: item.kind,
    name: item.name ?? null,
    description: item.description ?? null,
    imageUrl: item.imageUrl ?? null,
    regularPrice: item.regularPrice ?? null,
    salePrice: item.salePrice ?? null,
    sku: item.sku ?? null,
    categories: item.categories === undefined ? undefined : (item.categories as never),
    inventoryQuantity: item.inventoryQuantity ?? null,
    stockStatus: item.stockStatus ?? null,
    attributes: item.attributes === undefined ? undefined : (item.attributes as never),
    variations: item.variations === undefined ? undefined : (item.variations as never),
    status: item.status ?? null,
    raw: jsonOrNull(item.raw),
    syncedAt: new Date(),
  }
}

export async function syncWooProducts(
  storeId: string,
  options: { page?: number; perPage?: number; maxPages?: number; since?: string } = {},
) {
  const bundle = await getWooConnectionBundle(storeId)
  if (!bundle) throw new WooServiceError('not_connected', 404)
  const adapter = getPlatformAdapter('woocommerce')
  if (!adapter) throw new WooServiceError('adapter_unavailable', 500)

  const perPage = options.perPage ?? 50
  const maxPages = options.maxPages ?? 5
  let products = 0
  let variations = 0
  let pages = 0

  for (let page = options.page ?? 1; page < (options.page ?? 1) + maxPages; page += 1) {
    const rawPage = await adapter.listProducts(bundle.config, {
      page,
      perPage,
      after: options.since ?? null,
    } as PlatformListOptions)
    pages += 1
    for (const raw of rawPage) {
      const normalized = normalizeProduct(raw)
      if (!normalized.product) continue
      const data = productUpsertData(storeId, bundle.connection.id, normalized.product, '')
      await prisma.platformProduct.upsert({
        where: {
          storeId_platform_platformProductId_variantKey: {
            storeId,
            platform: 'woocommerce',
            platformProductId: normalized.product.platformProductId,
            variantKey: '',
          },
        },
        create: data,
        update: data,
      })
      products += 1

      const client = new WooCommerceClient(bundle.config)
      const rawVariations = await client.listVariations(normalized.product.platformProductId, { perPage: 100 })
      const normalizedVariations = normalizeProduct(raw, rawVariations).variations
      for (const variation of normalizedVariations) {
        const variantData = productUpsertData(
          storeId,
          bundle.connection.id,
          variation,
          variation.variantKey ?? variation.platformVariantId ?? '',
        )
        await prisma.platformProduct.upsert({
          where: {
            storeId_platform_platformProductId_variantKey: {
              storeId,
              platform: 'woocommerce',
              platformProductId: variation.platformProductId,
              variantKey: variation.variantKey ?? variation.platformVariantId ?? '',
            },
          },
          create: variantData,
          update: variantData,
        })
        variations += 1
      }
    }
    if (rawPage.length < perPage) break
  }

  await prisma.store.update({ where: { id: storeId }, data: { platformLastSyncAt: new Date() } })
  return { products, variations, pages }
}

export async function syncWooProductPayloads(storeId: string, rawProducts: unknown[]) {
  const bundle = await getWooConnectionBundle(storeId)
  if (!bundle) throw new WooServiceError('not_connected', 404)

  let products = 0
  let variations = 0
  for (const raw of rawProducts) {
    const source =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
    const rawVariations = Array.isArray(source?.variations) ? source.variations : []
    const normalized = normalizeProduct(raw, rawVariations)
    if (!normalized.product) continue

    const productData = productUpsertData(storeId, bundle.connection.id, normalized.product, '')
    await prisma.platformProduct.upsert({
      where: {
        storeId_platform_platformProductId_variantKey: {
          storeId,
          platform: 'woocommerce',
          platformProductId: normalized.product.platformProductId,
          variantKey: '',
        },
      },
      create: productData,
      update: productData,
    })
    products += 1

    for (const variation of normalized.variations) {
      const variantKey = variation.variantKey ?? variation.platformVariantId ?? ''
      const variantData = productUpsertData(storeId, bundle.connection.id, variation, variantKey)
      await prisma.platformProduct.upsert({
        where: {
          storeId_platform_platformProductId_variantKey: {
            storeId,
            platform: 'woocommerce',
            platformProductId: variation.platformProductId,
            variantKey,
          },
        },
        create: variantData,
        update: variantData,
      })
      variations += 1
    }
  }

  await prisma.store.update({ where: { id: storeId }, data: { platformLastSyncAt: new Date() } })
  return { products, variations, pages: 1, source: 'plugin' as const }
}

async function upsertWooCustomer(storeId: string, raw: unknown) {
  const customer = normalizeCustomer(raw)
  if (!customer.externalCustomerId) return false
  const existingByContact = await prisma.customerIdentity.findFirst({
    where: {
      storeId,
      OR: [customer.email ? { email: customer.email } : {}, customer.phone ? { phone: customer.phone } : {}].filter(
        (entry) => Object.keys(entry).length > 0,
      ),
    },
    select: { id: true },
  })

  const data = {
    platform: 'woocommerce',
    externalCustomerId: customer.externalCustomerId,
    platformStatus: 'customer',
    name: customer.name ?? undefined,
    email: customer.email ?? undefined,
    phone: customer.phone ?? undefined,
    lastSeenAt: new Date(),
  }
  if (existingByContact) {
    await prisma.customerIdentity.update({ where: { id: existingByContact.id }, data })
  } else {
    await prisma.customerIdentity.upsert({
      where: {
        storeId_platform_externalCustomerId: {
          storeId,
          platform: 'woocommerce',
          externalCustomerId: customer.externalCustomerId,
        },
      },
      create: { storeId, ...data },
      update: data,
    })
  }
  return true
}

export async function syncWooOrders(
  storeId: string,
  options: { page?: number; perPage?: number; maxPages?: number; since?: string } = {},
) {
  const bundle = await getWooConnectionBundle(storeId)
  if (!bundle) throw new WooServiceError('not_connected', 404)
  const adapter = getPlatformAdapter('woocommerce')
  if (!adapter) throw new WooServiceError('adapter_unavailable', 500)

  const perPage = options.perPage ?? 50
  const maxPages = options.maxPages ?? 5
  let orders = 0
  let pages = 0

  for (let page = options.page ?? 1; page < (options.page ?? 1) + maxPages; page += 1) {
    const rawPage = await adapter.listOrders(bundle.config, { page, perPage, after: options.since ?? null })
    pages += 1
    for (const raw of rawPage) {
      const order = normalizeOrderEvent(raw)
      if (!order) continue
      const data = {
        connectionId: bundle.connection.id,
        cartId: order.cartId ?? null,
        externalCustomerId: order.externalCustomerId ?? null,
        status: order.status ?? null,
        currency: order.currency ?? null,
        total: order.total,
        refundedTotal: order.refundedTotal ?? 0,
        customerEmail: order.customerEmail ?? null,
        customerPhone: order.customerPhone ?? null,
        customerName: order.customerName ?? null,
        items: order.items === undefined ? undefined : (order.items as never),
        couponCodes: order.couponCodes === undefined ? undefined : (order.couponCodes as never),
        placedAt: order.placedAt ?? null,
        paidAt: order.paidAt ?? null,
        cancelledAt: order.cancelledAt ?? null,
        refundedAt: order.refundedAt ?? null,
        raw: jsonOrNull(order.raw),
      }
      await prisma.platformOrder.upsert({
        where: {
          storeId_platform_platformOrderId: {
            storeId,
            platform: 'woocommerce',
            platformOrderId: order.platformOrderId,
          },
        },
        create: { storeId, platform: 'woocommerce', platformOrderId: order.platformOrderId, ...data },
        update: data,
      })
      orders += 1
    }
    if (rawPage.length < perPage) break
  }

  let customers = 0
  try {
    const client = new WooCommerceClient(bundle.config)
    const customerPage = await client.listCustomers({ perPage: 100 })
    for (const raw of customerPage) {
      if (await upsertWooCustomer(storeId, raw)) customers += 1
    }
  } catch {
    customers = 0
  }

  await prisma.store.update({ where: { id: storeId }, data: { platformLastSyncAt: new Date() } })
  return { orders, customers, pages }
}

export async function createWooCouponForStore(
  storeId: string,
  coupon: PlatformCouponInput,
): Promise<PlatformCouponResult> {
  const bundle = await getWooConnectionBundle(storeId)
  if (!bundle) throw new WooServiceError('not_connected', 404)
  const adapter = getPlatformAdapter('woocommerce')
  if (!adapter) throw new WooServiceError('adapter_unavailable', 500)
  return adapter.createCoupon(bundle.config, coupon)
}

export async function revokeWooCouponForStore(storeId: string, code: string): Promise<boolean> {
  const bundle = await getWooConnectionBundle(storeId)
  if (!bundle) return false
  const adapter = getPlatformAdapter('woocommerce')
  if (!adapter) return false
  return adapter.revokeCoupon(bundle.config, code)
}

export async function getWooCartItems(cartId: string): Promise<ReturnType<typeof normalizeCartItems>> {
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, select: { items: true } })
  return normalizeCartItems(cart?.items)
}
