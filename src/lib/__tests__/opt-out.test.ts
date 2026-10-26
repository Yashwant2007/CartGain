import {
  recordOptOut,
  isContactOptedOut,
  signOptOutToken,
  verifyOptOutToken,
  buildOptOutUrl,
  normalizeOptOutEmail,
  normalizeOptOutPhone,
} from '@/lib/opt-out'
import prisma from '@/lib/db'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    optOut: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    cart: { findMany: jest.fn() },
    customerIdentity: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    recoveryJourney: { updateMany: jest.fn() },
    recoveryReminder: { updateMany: jest.fn() },
    message: { updateMany: jest.fn() },
  },
}))

const prismaMock = prisma as any

describe('opt-out helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prismaMock.optOut.findUnique.mockResolvedValue(null)
    prismaMock.optOut.create.mockResolvedValue({})
    prismaMock.cart.findMany.mockResolvedValue([])
    prismaMock.customerIdentity.findMany.mockResolvedValue([])
    prismaMock.customerIdentity.create.mockResolvedValue({ id: 'i1' })
    prismaMock.customerIdentity.update.mockResolvedValue({})
    prismaMock.customerIdentity.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.customerIdentity.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.recoveryJourney.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.recoveryReminder.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.message.updateMany.mockResolvedValue({ count: 0 })
  })

  it('normalizes email and phone to the stored canonical forms', () => {
    expect(normalizeOptOutEmail('  A@B.COM ')).toBe('a@b.com')
    expect(normalizeOptOutPhone('+91 98765-43210')).toBe('919876543210')
  })

  it('returns false without querying when no contact is given', async () => {
    expect(await isContactOptedOut('s1', {})).toBe(false)
    expect(prismaMock.optOut.findFirst).not.toHaveBeenCalled()
  })

  it('queries the store with normalized email/phone OR clauses', async () => {
    prismaMock.optOut.findFirst.mockResolvedValue({ id: 'o1' })
    const optedOut = await isContactOptedOut('s1', { email: 'A@B.com ', phone: '98765 43210' })
    expect(optedOut).toBe(true)
    expect(prismaMock.optOut.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 's1', OR: [{ email: 'a@b.com' }, { phone: '9876543210' }] },
      }),
    )
  })

  it('records BOTH identifiers when a contact has email and phone', async () => {
    await recordOptOut('s1', { email: 'A@B.com', phone: '+91 98765 43210' }, 'merchant_request')

    expect(prismaMock.optOut.create).toHaveBeenCalledWith({
      data: { storeId: 's1', reason: 'merchant_request', email: 'a@b.com' },
    })
    expect(prismaMock.optOut.create).toHaveBeenCalledWith({
      data: { storeId: 's1', reason: 'merchant_request', phone: '919876543210' },
    })
    expect(prismaMock.optOut.create).toHaveBeenCalledTimes(2)
  })

  it('signs and verifies an opt-out token', () => {
    const token = signOptOutToken({ storeId: 's1', email: 'A@B.com' })
    expect(verifyOptOutToken(token)).toEqual({ storeId: 's1', email: 'a@b.com', phone: null })
  })

  it('rejects a tampered token', () => {
    const token = signOptOutToken({ storeId: 's1', phone: '919876543210' })
    expect(verifyOptOutToken(token.slice(0, -4) + 'AAAA')).toBeNull()
  })

  it('rejects a token with no contact identity', () => {
    // A token that verifies but carries neither email nor phone is unusable.
    expect(verifyOptOutToken(signOptOutToken({ storeId: 's1' }))).toBeNull()
  })

  it('builds an unsubscribe URL carrying the signed token', () => {
    const url = buildOptOutUrl('https://cart-gain.com/', { storeId: 's1', email: 'a@b.com' })
    expect(url).toMatch(/^https:\/\/cart-gain\.com\/api\/opt-out\?t=/)
    const token = decodeURIComponent(url.split('t=')[1])
    expect(verifyOptOutToken(token)?.storeId).toBe('s1')
  })
})
