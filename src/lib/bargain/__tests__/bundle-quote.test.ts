/**
 * @jest-environment node
 */
import prisma from '@/lib/db'
import {
  BUNDLE_QUOTE_TTL_MS,
  acceptBundleQuote,
  createBundleQuote,
  findBundleQuoteByToken,
  verifyBundleQuoteToken,
} from '@/lib/bargain/bundle-quote'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainBundleQuote: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as any

const input = {
  storeId: 'store-1',
  sessionId: 'sess-1',
  cartToken: 'cart-1',
  items: [{
    productId: '1',
    variantId: null,
    title: 'Serum',
    price: 1000,
    floor: 700,
    quantity: 1,
  }, {
    productId: '2',
    variantId: null,
    title: 'Moisturizer',
    price: 800,
    floor: 600,
    quantity: 1,
  }],
  listTotal: 1800,
  floorTotal: 1300,
  offerTotal: 1530,
  discountPercent: 15,
  currency: 'INR',
  expiresAt: new Date(Date.now() + BUNDLE_QUOTE_TTL_MS),
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LINK_SECRET = 'test-secret-at-least-16-chars-long'
})

afterAll(() => {
  delete process.env.LINK_SECRET
})

describe('bundle quote service', () => {
  it('creates a signed quote that resolves only through its own token', async () => {
    mockPrisma.bargainBundleQuote.create.mockImplementation(({ data }: any) => Promise.resolve(data))

    const token = await createBundleQuote(input)
    expect(token).toMatch(/^bbundle:/)

    const created = mockPrisma.bargainBundleQuote.create.mock.calls[0][0].data
    expect(created.status).toBe('CREATED')
    expect(created.floorTotal).toBe(1300)
    expect(verifyBundleQuoteToken(created.id, token!)).toBe(true)
    expect(verifyBundleQuoteToken(created.id, token!.replace('bbundle:', ''))).toBe(false)

    mockPrisma.bargainBundleQuote.findUnique.mockResolvedValue(created)
    const found = await findBundleQuoteByToken(token!)
    expect(found?.id).toBe(created.id)

    mockPrisma.bargainBundleQuote.findUnique.mockResolvedValue({ ...created, id: 'other-id' })
    expect(await findBundleQuoteByToken(token!)).toBeNull()
  })

  it('atomically accepts a created quote and never reuses it', async () => {
    mockPrisma.bargainBundleQuote.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    expect(await acceptBundleQuote('quote-1', 'GAIN123')).toBe(true)
    expect(await acceptBundleQuote('quote-1', 'GAIN123')).toBe(false)
    expect(mockPrisma.bargainBundleQuote.updateMany).toHaveBeenCalledWith({
      where: { id: 'quote-1', status: 'CREATED' },
      data: expect.objectContaining({ status: 'ACCEPTED', discountCode: 'GAIN123' }),
    })
  })
})
