/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    platformEvent: { create: jest.fn(), update: jest.fn() },
    cart: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    customerIdentity: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    platformOrder: { upsert: jest.fn() },
  },
}))

jest.mock('@/lib/recovery/recipients', () => ({
  cancelPendingRecoveryForCart: jest.fn(async () => undefined),
}))

import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { cancelPendingRecoveryForCart } from '@/lib/recovery/recipients'
import type { WebhookEvent } from '../schemas'
import { claimPlatformEvent, processWooWebhookEvent } from '../events'

const mockPrisma = prisma as any
const mockCancel = cancelPendingRecoveryForCart as jest.Mock

const ctx = {
  store: { id: 'store-1', domain: 'https://shop.example.com', platform: 'woocommerce' },
  connection: { id: 'conn-1', status: 'active' },
}
const eventRef = { id: 'event-row-1' }
const occurredAt = '2026-01-02T03:04:05.000Z'

function event(input: Partial<WebhookEvent>): WebhookEvent {
  return {
    eventId: 'evt-12345678',
    type: 'cart_created',
    occurredAt,
    data: {},
    ...input,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.platformEvent.create.mockResolvedValue(eventRef)
  mockPrisma.platformEvent.update.mockResolvedValue({})
  mockPrisma.cart.upsert.mockResolvedValue({ id: 'cart-row-1' })
  mockPrisma.cart.update.mockResolvedValue({ id: 'cart-row-1' })
  mockPrisma.customerIdentity.upsert.mockResolvedValue({ id: 'identity-1' })
  mockPrisma.customerIdentity.create.mockResolvedValue({ id: 'identity-1' })
  mockPrisma.platformOrder.upsert.mockResolvedValue({ id: 'order-row-1' })
})

describe('claimPlatformEvent', () => {
  it('claims a new event', async () => {
    await expect(
      claimPlatformEvent({
        storeId: ctx.store.id,
        platform: 'woocommerce',
        eventId: 'evt-12345678',
        eventType: 'cart_abandoned',
        connectionId: 'conn-1',
      }),
    ).resolves.toEqual(eventRef)
  })

  it('returns null when the unique event was already claimed', async () => {
    mockPrisma.platformEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )
    await expect(
      claimPlatformEvent({
        storeId: ctx.store.id,
        platform: 'woocommerce',
        eventId: 'evt-12345678',
        eventType: 'cart_abandoned',
        connectionId: 'conn-1',
      }),
    ).resolves.toBeNull()
  })
})

describe('processWooWebhookEvent', () => {
  it('merges cart items without losing inventory and marks abandoned carts', async () => {
    mockPrisma.cart.findUnique.mockResolvedValue({
      id: 'cart-row-1',
      items: [
        {
          key: '7:default',
          productId: '7',
          quantity: 1,
          price: 20,
          inventory: 4,
          stockStatus: 'instock',
        },
      ],
      currency: 'USD',
      platformStatus: 'observed',
    })

    const result = await processWooWebhookEvent(
      event({
        type: 'cart_abandoned',
        data: {
          cart: {
            id: 'cart-1',
            total: '20.00',
            currency: 'USD',
            items: [{ product_id: 7, quantity: 2, price: '20.00' }],
          },
        },
      }),
      ctx,
      eventRef,
    )

    expect(result).toMatchObject({ status: 'processed' })
    const upsert = mockPrisma.cart.upsert.mock.calls[0][0]
    expect(upsert.update.platformStatus).toBe('abandoned')
    expect(upsert.update.abandonedAt).toEqual(new Date(occurredAt))
    expect(upsert.update.items).toHaveLength(1)
    expect(upsert.update.items[0]).toMatchObject({ quantity: 2, inventory: 4, stockStatus: 'instock' })
  })

  it('records only explicit consent with a valid source and timestamp', async () => {
    await processWooWebhookEvent(
      event({
        type: 'customer_identified',
        data: {
          customer: { id: 5, email: 'buyer@example.com' },
          consent: { source: 'storefront_form', at: occurredAt, email: true, whatsapp: true },
        },
      }),
      ctx,
      eventRef,
    )

    const upsert = mockPrisma.customerIdentity.upsert.mock.calls[0][0]
    expect(upsert.create).toMatchObject({
      consentEmail: true,
      consentWhatsApp: true,
      emailConsentSource: 'storefront_form',
      whatsappConsentSource: 'storefront_form',
      emailConsentAt: new Date(occurredAt),
    })

    jest.clearAllMocks()
    mockPrisma.customerIdentity.upsert.mockResolvedValue({ id: 'identity-1' })
    await processWooWebhookEvent(
      event({
        type: 'customer_identified',
        data: {
          customer: { id: 5, email: 'buyer@example.com' },
          consent: { source: 'inferred', at: occurredAt, email: true, whatsapp: true },
        },
      }),
      ctx,
      eventRef,
    )
    const second = mockPrisma.customerIdentity.upsert.mock.calls[0][0]
    expect(second.create).not.toHaveProperty('consentEmail')
    expect(second.create).not.toHaveProperty('consentWhatsApp')
  })

  it('accepts plugin consent payloads and links them to the cart contact', async () => {
    mockPrisma.cart.findFirst.mockResolvedValue({
      customerName: 'Ada Lovelace',
      customerEmail: 'ada@example.com',
      customerPhone: '+15551234567',
      externalCustomerId: '5',
    })

    await processWooWebhookEvent(
      event({
        type: 'customer_identified',
        data: {
          cartId: 'cart-1',
          source: 'checkout',
          consent: {
            email: { enabled: true, source: 'checkout', timestamp: 1767320645 },
            whatsapp: { enabled: false, source: 'checkout', timestamp: 1767320645, phone: '+15551234567' },
          },
        },
      }),
      ctx,
      eventRef,
    )

    const upsert = mockPrisma.customerIdentity.upsert.mock.calls[0][0]
    expect(upsert.create).toMatchObject({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      consentEmail: true,
      consentWhatsApp: false,
      emailConsentSource: 'checkout',
      whatsappConsentSource: 'checkout',
      phone: '+15551234567',
    })
    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: 'store-1' }) }),
    )
  })

  it('marks a cart converted and cancels recovery only when an order is paid', async () => {
    const orderData = { order: { id: '9001', cart_id: 'cart-1', total: '100.00', customer_id: 5 } }
    mockPrisma.cart.findUnique.mockResolvedValue({ id: 'cart-row-1' })

    await processWooWebhookEvent(event({ type: 'order_created', data: orderData }), ctx, eventRef)
    expect(mockPrisma.cart.update).not.toHaveBeenCalled()
    expect(mockCancel).not.toHaveBeenCalled()
    expect(mockPrisma.platformOrder.upsert.mock.calls[0][0].update.status).toBe('pending')

    mockPrisma.platformOrder.upsert.mockClear()
    const result = await processWooWebhookEvent(event({ type: 'order_paid', data: orderData }), ctx, eventRef)

    expect(result).toMatchObject({ status: 'processed', detail: { convertedCartId: 'cart-row-1' } })
    expect(mockPrisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-row-1' },
      data: { convertedAt: new Date(occurredAt), platformOrderId: '9001', platformStatus: 'converted' },
    })
    expect(mockCancel).toHaveBeenCalledWith('cart-row-1', 'purchased')
    expect(mockPrisma.platformOrder.upsert.mock.calls[0][0].update.status).toBe('completed')
  })
})
