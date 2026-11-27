/**
 * @jest-environment node
 */
import { GET } from '../route'
import prisma from '@/lib/db'
import { verifyOptInConfirmation } from '@/lib/recovery/opt-in-confirmation'
import { recordRecipientConsent } from '@/lib/recovery/recipients'
import { createOrUpdateJourney } from '@/lib/recovery/journeys/service'
import { buildProductContext } from '@/lib/bargain/product-fetcher'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    store: { findFirst: jest.fn() },
    recoveryJourney: { findFirst: jest.fn() },
  },
}))

jest.mock('@/lib/recovery/opt-in-confirmation', () => ({
  verifyOptInConfirmation: jest.fn(),
}))

jest.mock('@/lib/recovery/recipients', () => ({
  recordRecipientConsent: jest.fn(),
}))

jest.mock('@/lib/recovery/journeys/service', () => ({
  createOrUpdateJourney: jest.fn(),
}))

jest.mock('@/lib/bargain/product-fetcher', () => ({
  buildProductContext: jest.fn(),
}))

const prismaMock = prisma as any
const verifyMock = verifyOptInConfirmation as jest.Mock
const consentMock = recordRecipientConsent as jest.Mock
const journeyMock = createOrUpdateJourney as jest.Mock
const productMock = buildProductContext as jest.Mock

function request(token = 'valid') {
  return { nextUrl: new URL(`https://cart-gain.com/api/recovery/confirm?token=${token}`) } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyMock.mockReturnValue({
    storeId: 'store-1',
    email: 'buyer@example.com',
    productId: 'gid://shopify/Product/1',
    sessionId: 'session-1',
    name: 'Priya',
  })
  prismaMock.store.findFirst.mockResolvedValue({
    id: 'store-1',
    domain: 'test.myshopify.com',
    currency: 'USD',
    platform: 'shopify',
  })
  consentMock.mockResolvedValue({
    id: 'identity-1',
    consentEmail: true,
    suppressed: false,
    optedOutAt: null,
  })
  prismaMock.recoveryJourney.findFirst.mockResolvedValue(null)
  journeyMock.mockResolvedValue({ id: 'journey-1' })
  productMock.mockResolvedValue({ fetchFailed: false, title: 'Sneaker' })
})

describe('GET /api/recovery/confirm', () => {
  it('rejects an invalid token', async () => {
    verifyMock.mockReturnValue(null)
    const res = await GET(request('bad'))
    expect(res.status).toBe(400)
    expect(consentMock).not.toHaveBeenCalled()
  })

  it('grants email consent only after the signed link is opened', async () => {
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(consentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        email: 'buyer@example.com',
        source: 'email_confirmation',
        consentEmail: true,
        overrideOptOut: false,
      }),
    )
  })

  it('schedules a verified product reminder after confirmation', async () => {
    await GET(request())
    expect(journeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        customerIdentityId: 'identity-1',
        productId: 'gid://shopify/Product/1',
        metadata: expect.objectContaining({ source: 'email_confirmation', productTitle: 'Sneaker' }),
      }),
    )
  })

  it('does not enable reminders for an opted-out contact', async () => {
    consentMock.mockResolvedValue({
      id: 'identity-1',
      consentEmail: false,
      suppressed: true,
      optedOutAt: new Date(),
    })
    const res = await GET(request())
    expect(res.status).toBe(400)
    expect(journeyMock).not.toHaveBeenCalled()
  })
})
