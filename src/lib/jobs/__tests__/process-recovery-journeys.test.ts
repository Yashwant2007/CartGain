/**
 * @jest-environment node
 */
import { processRecoveryJourneys } from '../processRecoveryJourneys'
import prisma from '@/lib/db'
import { canSendToIdentity } from '@/lib/recovery/journeys/service'
import { sendEmail } from '@/lib/services/email'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp'
import { loadStoreVoiceSettings } from '@/lib/conversation/store'
import { buildOptOutUrl } from '@/lib/opt-out'
import { isWithinQuietHours } from '@/lib/conversation/variety'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    recoveryJourney: { findMany: jest.fn(), update: jest.fn() },
    recoveryReminder: { create: jest.fn() },
    cart: { findUnique: jest.fn() },
    customerIdentity: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/recovery/journeys/service', () => ({
  canSendToIdentity: jest.fn(async () => ({ ok: true })),
}))

jest.mock('@/lib/services/email', () => ({ sendEmail: jest.fn() }))
jest.mock('@/lib/services/whatsapp', () => ({ sendWhatsAppMessage: jest.fn() }))
jest.mock('@/lib/conversation/store', () => ({ loadStoreVoiceSettings: jest.fn() }))
jest.mock('@/lib/opt-out', () => ({ buildOptOutUrl: jest.fn(() => 'https://cart-gain.com/opt-out?token=t') }))
jest.mock('@/lib/conversation/variety', () => ({ isWithinQuietHours: jest.fn(() => false) }))

const prismaMock = prisma as any
const gateMock = canSendToIdentity as jest.Mock
const emailMock = sendEmail as jest.Mock
const whatsappMock = sendWhatsAppMessage as jest.Mock
const voiceMock = loadStoreVoiceSettings as jest.Mock
const optOutMock = buildOptOutUrl as jest.Mock
const quietMock = isWithinQuietHours as jest.Mock

function journey(over: Record<string, any> = {}) {
  return {
    id: 'journey-1',
    storeId: 'store-1',
    cartId: null,
    customerIdentityId: 'identity-1',
    status: 'SCHEDULED',
    scheduledFor: new Date('2026-10-28T09:00:00Z'),
    priority: 0,
    metadata: {},
    store: {
      id: 'store-1',
      name: 'Test Store',
      domain: 'test-store.myshopify.com',
      isActive: true,
    },
    ...over,
  }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://cart-gain.com'
  jest.clearAllMocks()
  prismaMock.recoveryJourney.findMany.mockResolvedValue([journey()])
  prismaMock.recoveryJourney.update.mockResolvedValue({})
  prismaMock.recoveryReminder.create.mockResolvedValue({})
  prismaMock.cart.findUnique.mockResolvedValue(null)
  prismaMock.customerIdentity.findUnique.mockResolvedValue({
    id: 'identity-1',
    email: 'buyer@example.com',
    phone: null,
    name: 'Priya Sharma',
    consentEmail: true,
    consentWhatsApp: false,
    consentSms: false,
    suppressed: false,
    optedOutAt: null,
  })
  gateMock.mockResolvedValue({ ok: true })
  emailMock.mockResolvedValue({ success: true, messageId: 'email-1' })
  whatsappMock.mockResolvedValue({ success: false })
  voiceMock.mockResolvedValue(null)
  optOutMock.mockReturnValue('https://cart-gain.com/opt-out?token=t')
  quietMock.mockReturnValue(false)
})

describe('processRecoveryJourneys', () => {
  it('sends a product-aware email to the storefront product with a valid opt-out link', async () => {
    prismaMock.recoveryJourney.findMany.mockResolvedValue([
      journey({
        metadata: {
          productTitle: 'Sneaker',
          productUrl: 'https://test-store.myshopify.com/products/sneaker',
          productImage: 'https://cdn.shopify.com/sneaker.jpg',
        },
      }),
    ])

    const result = await processRecoveryJourneys()

    expect(result).toEqual({ sent: 1, failed: 0, suppressed: 0, processed: 1 })
    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: 'Still thinking about Sneaker?',
        html: expect.stringContaining('https://test-store.myshopify.com/products/sneaker'),
      }),
    )
    expect(emailMock.mock.calls[0][0].html).toContain('https://cart-gain.com/opt-out?token=t')
    expect(optOutMock).toHaveBeenCalledWith('https://cart-gain.com', {
      storeId: 'store-1',
      email: 'buyer@example.com',
    })
    expect(prismaMock.recoveryReminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        journeyId: 'journey-1',
        channel: 'email',
        status: 'sent',
        providerId: 'email-1',
      }),
    })
    expect(prismaMock.recoveryJourney.update).toHaveBeenCalledWith({
      where: { id: 'journey-1' },
      data: expect.objectContaining({ status: 'SENT', reasonCode: null }),
    })
  })

  it('falls back to the storefront cart instead of a broken platform link', async () => {
    const result = await processRecoveryJourneys()

    expect(result.sent).toBe(1)
    expect(emailMock.mock.calls[0][0].html).toContain('https://test-store.myshopify.com/cart')
    expect(emailMock.mock.calls[0][0].html).not.toContain('cart-gain.com/cart/')
  })

  it('uses WhatsApp with the product image when WhatsApp consent exists', async () => {
    prismaMock.customerIdentity.findUnique.mockResolvedValue({
      id: 'identity-1',
      email: 'buyer@example.com',
      phone: '+919999999999',
      name: 'Priya',
      consentEmail: true,
      consentWhatsApp: true,
      consentSms: false,
      suppressed: false,
      optedOutAt: null,
    })
    prismaMock.recoveryJourney.findMany.mockResolvedValue([
      journey({
        metadata: {
          productTitle: 'Sneaker',
          productUrl: 'https://test-store.myshopify.com/products/sneaker',
          productImage: 'https://cdn.shopify.com/sneaker.jpg',
        },
      }),
    ])
    whatsappMock.mockResolvedValue({ success: true, messageId: 'wamid.1' })

    const result = await processRecoveryJourneys()

    expect(result.sent).toBe(1)
    expect(whatsappMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+919999999999',
        templateParams: expect.objectContaining({
          header: expect.objectContaining({ imageUrl: 'https://cdn.shopify.com/sneaker.jpg' }),
        }),
      }),
    )
    expect(emailMock).not.toHaveBeenCalled()
  })

  it('reschedules during quiet hours instead of sending', async () => {
    voiceMock.mockResolvedValue({ quietHoursStart: 21, quietHoursEnd: 8 })
    quietMock.mockReturnValue(true)

    const result = await processRecoveryJourneys()

    expect(result.sent).toBe(0)
    expect(emailMock).not.toHaveBeenCalled()
    expect(prismaMock.recoveryJourney.update).toHaveBeenCalledWith({
      where: { id: 'journey-1' },
      data: expect.objectContaining({ status: 'SCHEDULED' }),
    })
  })

  it('fails without sending when email consent is missing', async () => {
    gateMock.mockImplementation(async (_identity: any, channel?: string) =>
      channel === 'email' ? { ok: false, reason: 'no_email_consent' } : { ok: true },
    )

    const result = await processRecoveryJourneys()

    expect(result).toEqual({ sent: 0, failed: 1, suppressed: 0, processed: 1 })
    expect(emailMock).not.toHaveBeenCalled()
  })
})
