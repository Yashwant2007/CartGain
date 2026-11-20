import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { cancelPendingRecoveryForCart } from '@/lib/recovery/recipients'
import type { WebhookEvent } from './schemas'
import { mergeCartItems, normalizeCartEvent, normalizeCustomer, normalizeOrderEvent } from './normalize'

export class WooEventError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'WooEventError'
    this.code = code
  }
}

type PlatformEventRef = { id: string }

type Context = {
  store: { id: string; domain: string; platform: string }
  connection: { id: string; status: string }
}

const EXPLICIT_CONSOURCES = new Set([
  'explicit_opt_in',
  'plugin_opt_in',
  'storefront_form',
  'checkout_checkbox',
  'recovery_opt_in',
  'checkout',
  'store_api',
  'shortcode',
  'optout_link',
])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function amount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''))
    if (Number.isFinite(parsed)) return Math.abs(parsed)
  }
  return null
}

function eventDate(event: WebhookEvent): Date {
  const occurred = event.occurredAt ? new Date(event.occurredAt) : new Date()
  return Number.isFinite(occurred.getTime()) ? occurred : new Date()
}

export async function claimPlatformEvent(input: {
  storeId: string
  platform: string
  eventId: string
  eventType: string
  connectionId: string | null
  occurredAt?: Date | null
}) {
  try {
    return await prisma.platformEvent.create({
      data: {
        storeId: input.storeId,
        platform: input.platform,
        connectionId: input.connectionId,
        eventId: input.eventId,
        eventType: input.eventType,
        status: 'received',
        occurredAt: input.occurredAt ?? null,
      },
      select: { id: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null
    throw error
  }
}

export async function updatePlatformEvent(
  eventRef: PlatformEventRef,
  status: 'processed' | 'skipped' | 'failed',
  detail?: Record<string, unknown>,
  errorCode?: string,
) {
  await prisma.platformEvent.update({
    where: { id: eventRef.id },
    data: {
      status,
      detail: detail ? (detail as never) : undefined,
      errorCode: errorCode ?? null,
      processedAt: new Date(),
    },
  })
}

async function upsertCart(event: WebhookEvent, ctx: Context) {
  const normalized = normalizeCartEvent(event.data)
  if (!normalized) throw new WooEventError('invalid_cart_payload')

  const existing = await prisma.cart.findUnique({
    where: { storeId_cartId: { storeId: ctx.store.id, cartId: normalized.cartId } },
    select: { id: true, items: true, currency: true, platformStatus: true, customerEmail: true, customerPhone: true, customerName: true, externalCustomerId: true },
  })
  const mergedItems = mergeCartItems(existing?.items, normalized.items)
  const occurredAt = eventDate(event)
  const abandoned = event.type === 'cart_abandoned'
  const platformStatus = abandoned
    ? 'abandoned'
    : event.type === 'checkout_started'
      ? 'checkout_started'
      : existing?.platformStatus ?? 'observed'

  const data = {
    platform: 'woocommerce',
    platformCartId: normalized.cartId,
    platformOrderId: null,
    platformStatus,
    currency: normalized.currency ?? existing?.currency ?? undefined,
    totalValue: normalized.total,
    items: mergedItems as never,
    customerName: normalized.customer.name ?? existing?.customerName ?? undefined,
    customerEmail: normalized.customer.email ?? existing?.customerEmail ?? undefined,
    customerPhone: normalized.customer.phone ?? existing?.customerPhone ?? undefined,
    externalCustomerId: normalized.customer.externalCustomerId ?? existing?.externalCustomerId ?? undefined,
    ...(abandoned ? { abandonedAt: occurredAt } : {}),
  }

  const cart = await prisma.cart.upsert({
    where: { storeId_cartId: { storeId: ctx.store.id, cartId: normalized.cartId } },
    create: {
      storeId: ctx.store.id,
      cartId: normalized.cartId,
      items: mergedItems as never,
      totalValue: normalized.total,
      currency: normalized.currency ?? 'USD',
      platform: 'woocommerce',
      platformCartId: normalized.cartId,
      platformStatus,
      customerName: normalized.customer.name ?? undefined,
      customerEmail: normalized.customer.email ?? undefined,
      customerPhone: normalized.customer.phone ?? undefined,
      externalCustomerId: normalized.customer.externalCustomerId ?? undefined,
      ...(abandoned ? { abandonedAt: occurredAt } : {}),
    },
    update: data,
    select: { id: true },
  })

  return { cartId: cart.id, externalCartId: normalized.cartId }
}

function consentFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  const entry = record(value)
  const enabled = entry?.enabled
  return typeof enabled === 'boolean' ? enabled : null
}

function consentTimestamp(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    const parsed = new Date(ms)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  const raw = text(value)
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

async function upsertCustomerIdentity(event: WebhookEvent, ctx: Context) {
  const root = record(event.data) ?? {}
  const cartKey = text(root.cartId) ?? text(root.cart_key) ?? text(root.cartToken)
  let cartContact: Record<string, unknown> = {}
  if (cartKey) {
    const cart = await prisma.cart.findFirst({
      where: {
        storeId: ctx.store.id,
        OR: [{ cartId: cartKey }, { platformCartId: cartKey }],
      },
      select: {
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        externalCustomerId: true,
      },
    })
    if (cart) {
      cartContact = {
        externalCustomerId: cart.externalCustomerId,
        name: cart.customerName,
        email: cart.customerEmail,
        phone: cart.customerPhone,
      }
    }
  }

  const customer = normalizeCustomer({ ...cartContact, ...(record(root.customer) ?? root) })
  if (!customer.externalCustomerId && !customer.email && !customer.phone) {
    throw new WooEventError('invalid_customer_payload')
  }

  const consent = record(root.consent)
  const consentEmail = record(consent?.email)
  const consentWhatsApp = record(consent?.whatsapp)
  const consentSource =
    text(consent?.source) ?? text(consentEmail?.source) ?? text(consentWhatsApp?.source) ?? text(root.source)
  const consentAt =
    consentTimestamp(consent?.at) ??
    consentTimestamp(consent?.timestamp) ??
    consentTimestamp(consentEmail?.timestamp) ??
    consentTimestamp(consentWhatsApp?.timestamp)
  const hasValidConsentProof =
    Boolean(consentSource && EXPLICIT_CONSOURCES.has(consentSource)) &&
    Boolean(consentAt && Number.isFinite(consentAt.getTime()))

  const consentData: Record<string, unknown> = {}
  if (hasValidConsentProof) {
    const emailFlag = consentFlag(consent?.email)
    const whatsappFlag = consentFlag(consent?.whatsapp)
    if (emailFlag !== null) {
      consentData.consentEmail = emailFlag
      consentData.emailConsentBasis = emailFlag ? 'explicit' : 'none'
      consentData.emailConsentSource = consentSource
      consentData.emailConsentAt = consentAt
    }
    if (whatsappFlag !== null) {
      consentData.consentWhatsApp = whatsappFlag
      consentData.whatsappConsentSource = consentSource
      consentData.whatsappConsentAt = consentAt
    }
    const whatsappPhone = text(consentWhatsApp?.phone)
    if (whatsappPhone) consentData.phone = whatsappPhone
  }

  const identityData = {
    platform: 'woocommerce',
    externalCustomerId: customer.externalCustomerId ?? undefined,
    platformStatus: 'identified',
    name: customer.name ?? undefined,
    email: customer.email ?? undefined,
    phone: customer.phone ?? undefined,
    lastSeenAt: eventDate(event),
    ...consentData,
  }

  const whereCustomer = customer.externalCustomerId
    ? { storeId_platform_externalCustomerId: { storeId: ctx.store.id, platform: 'woocommerce', externalCustomerId: customer.externalCustomerId } }
    : null

  let identityId: string | null = null
  if (whereCustomer) {
    const upserted = await prisma.customerIdentity.upsert({
      where: whereCustomer,
      create: { storeId: ctx.store.id, ...identityData },
      update: identityData,
      select: { id: true },
    })
    identityId = upserted.id
  } else {
    const OR: Array<Record<string, string>> = []
    if (customer.email) OR.push({ email: customer.email })
    if (customer.phone) OR.push({ phone: customer.phone })
    const existing = await prisma.customerIdentity.findFirst({
      where: { storeId: ctx.store.id, platform: 'woocommerce', OR },
      select: { id: true },
    })
    if (existing) {
      await prisma.customerIdentity.update({ where: { id: existing.id }, data: identityData })
      identityId = existing.id
    } else {
      const created = await prisma.customerIdentity.create({
        data: { storeId: ctx.store.id, ...identityData },
        select: { id: true },
      })
      identityId = created.id
    }
  }

  return { identityId, externalCustomerId: customer.externalCustomerId ?? null, explicitConsent: hasValidConsentProof }
}

async function upsertOrder(event: WebhookEvent, ctx: Context) {
  const order = normalizeOrderEvent(event.data)
  if (!order) throw new WooEventError('invalid_order_payload')

  const occurredAt = eventDate(event)
  const status =
    event.type === 'order_paid'
      ? 'completed'
      : event.type === 'order_cancelled'
        ? 'cancelled'
        : event.type === 'order_refunded'
          ? 'refunded'
          : order.status ?? 'pending'
  const refundHint = amount((record(event.data) ?? {}).refundTotal)
  const refundedTotal =
    event.type === 'order_refunded' ? Math.max(order.refundedTotal ?? 0, refundHint ?? 0) : order.refundedTotal ?? 0

  const data = {
    connectionId: ctx.connection.id,
    cartId: order.cartId ?? null,
    externalCustomerId: order.externalCustomerId ?? null,
    status,
    currency: order.currency ?? null,
    total: order.total,
    refundedTotal,
    customerEmail: order.customerEmail ?? null,
    customerPhone: order.customerPhone ?? null,
    customerName: order.customerName ?? null,
    items: order.items === undefined ? undefined : (order.items as never),
    couponCodes: order.couponCodes === undefined ? undefined : (order.couponCodes as never),
    placedAt: order.placedAt ?? (event.type === 'order_created' ? occurredAt : null),
    paidAt: event.type === 'order_paid' ? order.paidAt ?? occurredAt : order.paidAt ?? null,
    cancelledAt: event.type === 'order_cancelled' ? order.cancelledAt ?? occurredAt : order.cancelledAt ?? null,
    refundedAt: event.type === 'order_refunded' ? order.refundedAt ?? occurredAt : order.refundedAt ?? null,
    raw: (order.raw ?? Prisma.JsonNull) as never,
  }

  await prisma.platformOrder.upsert({
    where: {
      storeId_platform_platformOrderId: {
        storeId: ctx.store.id,
        platform: 'woocommerce',
        platformOrderId: order.platformOrderId,
      },
    },
    create: {
      storeId: ctx.store.id,
      platform: 'woocommerce',
      platformOrderId: order.platformOrderId,
      ...data,
    },
    update: data,
  })

  let convertedCartId: string | null = null
  if (event.type === 'order_paid' && order.cartId) {
    const cart = await prisma.cart.findUnique({
      where: { storeId_cartId: { storeId: ctx.store.id, cartId: order.cartId } },
      select: { id: true },
    })
    if (cart) {
      await prisma.cart.update({
        where: { id: cart.id },
        data: { convertedAt: occurredAt, platformOrderId: order.platformOrderId, platformStatus: 'converted' },
      })
      await cancelPendingRecoveryForCart(cart.id, 'purchased').catch(() => undefined)
      convertedCartId = cart.id
    }
  }

  return { platformOrderId: order.platformOrderId, convertedCartId }
}

export async function processWooWebhookEvent(
  event: WebhookEvent,
  ctx: Context,
  platformEvent: PlatformEventRef,
): Promise<{ status: 'processed' | 'skipped'; detail: Record<string, unknown> }> {
  const cartEvents = new Set([
    'cart_created',
    'cart_item_added',
    'cart_item_updated',
    'cart_item_removed',
    'checkout_started',
    'cart_abandoned',
  ])

  try {
    if (cartEvents.has(event.type)) {
      const detail = await upsertCart(event, ctx)
      return { status: 'processed', detail }
    }
    if (event.type === 'customer_identified') {
      const detail = await upsertCustomerIdentity(event, ctx)
      return { status: 'processed', detail }
    }
    if (event.type.startsWith('order_')) {
      const detail = await upsertOrder(event, ctx)
      return { status: 'processed', detail }
    }
    return { status: 'skipped', detail: { eventType: event.type } }
  } catch (error) {
    const code = error instanceof WooEventError ? error.code : 'processing_failed'
    await updatePlatformEvent(platformEvent, 'failed', undefined, code)
    throw error
  }
}
