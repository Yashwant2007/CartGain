/**
 * @jest-environment node
 *
 * The recipient registry is the single source of truth for WhatsApp consent.
 * These tests pin the merge rules that make webhook ordering harmless and the
 * opt-in/opt-out transitions the recovery job relies on.
 */
import {
  cancelPendingRecoveryForCart,
  markRecipientContacted,
  recordWhatsAppConsent,
  suppressRecipient,
  upsertRecipient,
} from '../recipients'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    customerIdentity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    recoveryJourney: { updateMany: jest.fn() },
    recoveryReminder: { updateMany: jest.fn() },
    message: { updateMany: jest.fn() },
    optOut: { deleteMany: jest.fn() },
  },
}))

const prismaMock = prisma as any

function row(over: Record<string, any> = {}) {
  return {
    id: 'id-2',
    storeId: 'store-1',
    shopifyCustomerId: null,
    name: null,
    email: null,
    phone: '+919999999999',
    consentWhatsApp: false,
    consentEmail: false,
    consentSms: false,
    suppressed: false,
    optedOutAt: null,
    consentAt: null,
    emailConsentAt: null,
    whatsappConsentAt: null,
    lastSeenAt: null,
    lastContactedAt: null,
    lastChannel: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  prismaMock.customerIdentity.findMany.mockResolvedValue([])
  prismaMock.customerIdentity.create.mockImplementation(async ({ data }: any) => ({
    id: 'id-new',
    ...data,
  }))
  prismaMock.customerIdentity.update.mockImplementation(async ({ where, data }: any) => ({
    id: where.id,
    ...data,
  }))
  prismaMock.customerIdentity.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.customerIdentity.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.recoveryJourney.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.recoveryReminder.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.message.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.optOut.deleteMany.mockResolvedValue({ count: 0 })
})

describe('upsertRecipient', () => {
  it('creates a contact from a cart without granting consent', async () => {
    await upsertRecipient({
      storeId: 'store-1',
      phone: '+91 99999 99999',
      email: 'Buyer@Example.com',
      name: '  Buyer  ',
      source: 'shopify_cart',
    })

    expect(prismaMock.customerIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 'store-1',
        phone: '+919999999999',
        email: 'buyer@example.com',
        name: 'Buyer',
        consentSource: 'shopify_cart',
      }),
    })
    const data = prismaMock.customerIdentity.create.mock.calls[0][0].data
    expect(data).not.toHaveProperty('consentWhatsApp')
    expect(data).not.toHaveProperty('suppressed')
  })

  it('merges duplicate rows, keeping consent and suppression, before updating', async () => {
    prismaMock.customerIdentity.findMany.mockResolvedValue([
      row({
        id: 'id-1',
        email: 'buyer@example.com',
        phone: null,
        whatsappConsentAt: new Date('2026-02-01'),
        whatsappConsentSource: 'whatsapp_keyword',
      }),
      row({ id: 'id-2', consented: false, consentWhatsApp: true, consentEmail: true }),
    ])

    await upsertRecipient({
      storeId: 'store-1',
      shopifyCustomerId: 'gid://shopify/Customer/1',
      phone: '+919999999999',
      email: 'buyer@example.com',
    })

    expect(prismaMock.recoveryJourney.updateMany).toHaveBeenCalledWith({
      where: { customerIdentityId: { in: ['id-2'] } },
      data: { customerIdentityId: 'id-1' },
    })
    expect(prismaMock.customerIdentity.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-2'] } },
    })
    console.log('CALLS', JSON.stringify(prismaMock.customerIdentity.update.mock.calls, null, 2))
    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith({
      where: { id: 'id-1' },
      data: expect.objectContaining({
        consentWhatsApp: true,
        consentEmail: true,
        whatsappConsentSource: 'whatsapp_keyword',
      }),
    })
  })

  it('never overwrites an existing value with a missing one', async () => {
    prismaMock.customerIdentity.findMany.mockResolvedValue([
      row({ id: 'id-1', name: 'Buyer', email: 'buyer@example.com', phone: '+919999999999' }),
    ])

    await upsertRecipient({ storeId: 'store-1', phone: '+919999999999' })

    expect(prismaMock.customerIdentity.update.mock.calls[0][0].data).toMatchObject({
      name: 'Buyer',
      email: 'buyer@example.com',
      phone: '+919999999999',
    })
  })

  it('returns null when there is no usable identifier', async () => {
    expect(await upsertRecipient({ storeId: 'store-1' })).toBeNull()
    expect(prismaMock.customerIdentity.findMany).not.toHaveBeenCalled()
  })
})

describe('consent transitions', () => {
  it('records an explicit opt-in with provenance and clears the opt-out row', async () => {
    prismaMock.customerIdentity.findMany.mockResolvedValue([
      row({ id: 'id-1', suppressed: true, optedOutAt: new Date(), consentWhatsApp: false }),
    ])

    await recordWhatsAppConsent({
      storeId: 'store-1',
      phone: '+919999999999',
      source: 'merchant_attestation',
      at: new Date('2026-10-26T10:00:00Z'),
    })

    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith({
      where: { id: 'id-1' },
      data: expect.objectContaining({
        consentWhatsApp: true,
        suppressed: false,
        optedOutAt: null,
        whatsappConsentSource: 'merchant_attestation',
        whatsappConsentAt: new Date('2026-10-26T10:00:00Z'),
      }),
    })
    expect(prismaMock.optOut.deleteMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        OR: [{ phone: '+919999999999' }, { phone: '919999999999' }],
      },
    })
  })

  it('creates a suppressed contact when an unknown number unsubscribes', async () => {
    await suppressRecipient('store-1', { phone: '+919999999999' })

    expect(prismaMock.customerIdentity.create).toHaveBeenCalled()
    expect(prismaMock.customerIdentity.update).toHaveBeenCalledWith({
      where: { id: 'id-new' },
      data: expect.objectContaining({
        consentEmail: false,
        consentWhatsApp: false,
        suppressed: true,
        optedOutAt: expect.any(Date),
      }),
    })
  })
})

describe('queue cancellation and contact stamps', () => {
  it('skips pending rows and cancels journeys/reminders for a purchase', async () => {
    const result = await cancelPendingRecoveryForCart('cart-1', 'purchased')

    expect(prismaMock.message.updateMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', status: 'pending' },
      data: { status: 'skipped', reasonCode: 'purchased' },
    })
    expect(prismaMock.recoveryJourney.updateMany).toHaveBeenCalled()
    expect(prismaMock.recoveryReminder.updateMany).toHaveBeenCalled()
    expect(result).toEqual({ messages: 0, journeys: 0 })
  })

  it('stamps the last contacted channel on the recipient', async () => {
    await markRecipientContacted({
      storeId: 'store-1',
      phone: '+919999999999',
      channel: 'whatsapp',
      at: new Date('2026-10-26T10:00:00Z'),
    })

    expect(prismaMock.customerIdentity.updateMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', OR: [{ phone: '+919999999999' }] },
      data: {
        lastContactedAt: new Date('2026-10-26T10:00:00Z'),
        lastChannel: 'whatsapp',
      },
    })
  })
})
