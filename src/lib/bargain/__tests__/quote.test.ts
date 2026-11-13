const mockPrisma: any = {
  bargainQuote: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  bargainQuoteEvent: { create: jest.fn() },
}
mockPrisma.$transaction = jest.fn((fn: any) => fn(mockPrisma))

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  canTransition,
  isTerminal,
  signQuoteToken,
  verifyQuoteToken,
  isExpired,
  revalidateQuote,
  toPublicQuote,
  createQuote,
  transitionQuote,
  acceptQuote,
  markQuoteCheckoutPending,
  redeemQuote,
  QUOTE_STATUSES,
} from '../quote'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.BARGAIN_QUOTE = 'true'
  process.env.LINK_SECRET = 'test-secret-at-least-16-chars-long'
})

afterAll(() => {
  delete process.env.BARGAIN_QUOTE
  delete process.env.LINK_SECRET
})

describe('quote state machine', () => {
  it('permits only declared forward edges', () => {
    expect(canTransition('CREATED', 'ACCEPTED')).toBe(true)
    expect(canTransition('ACCEPTED', 'CHECKOUT_PENDING')).toBe(true)
    expect(canTransition('CHECKOUT_PENDING', 'REDEEMED')).toBe(true)
    // no going backwards
    expect(canTransition('ACCEPTED', 'CREATED')).toBe(false)
    expect(canTransition('REDEEMED', 'ACCEPTED')).toBe(false)
    // revocation is reachable from any non-terminal state
    expect(canTransition('CREATED', 'REVOKED')).toBe(true)
    expect(canTransition('ACCEPTED', 'CANCELLED')).toBe(true)
  })

  it('treats REDEEMED and side-states as terminal', () => {
    expect(isTerminal('REDEEMED')).toBe(true)
    expect(isTerminal('REVOKED')).toBe(true)
    expect(isTerminal('EXPIRED')).toBe(true)
    expect(isTerminal('CREATED')).toBe(false)
    expect(isTerminal('CHECKOUT_PENDING')).toBe(false)
  })

  it('exposes the full spec lifecycle', () => {
    expect(QUOTE_STATUSES).toEqual(
      expect.arrayContaining(['CREATED', 'ACCEPTED', 'CHECKOUT_PENDING', 'REDEEMED', 'EXPIRED', 'REVOKED', 'INVALIDATED', 'CANCELLED']),
    )
  })
})

describe('signed token', () => {
  it('round-trips for the bound quote id only', () => {
    const token = signQuoteToken('quote-1')!
    expect(token).toBeTruthy()
    expect(verifyQuoteToken('quote-1', token)).toBe(true)
    expect(verifyQuoteToken('quote-2', token)).toBe(false)
    // Flip a payload character — base64url decoding is lenient about a trailing
    // char, so tamper in the middle where the decoded bytes must change.
    const tampered = token.slice(0, 10) + (token[10] === 'A' ? 'B' : 'A') + token.slice(11)
    expect(verifyQuoteToken('quote-1', tampered)).toBe(false)
    expect(verifyQuoteToken('quote-1', null)).toBe(false)
    expect(verifyQuoteToken('quote-1', 'not-a-token')).toBe(false)
  })
})

describe('isExpired', () => {
  const past = new Date(Date.now() - 1000)
  const future = new Date(Date.now() + 1000)
  it('is true past the window for live states', () => {
    expect(isExpired({ status: 'CREATED', expiresAt: past })).toBe(true)
    expect(isExpired({ status: 'ACCEPTED', expiresAt: past })).toBe(true)
  })
  it('is false inside the window and for other terminal states', () => {
    expect(isExpired({ status: 'CREATED', expiresAt: future })).toBe(false)
    expect(isExpired({ status: 'REDEEMED', expiresAt: past })).toBe(false)
    expect(isExpired({ status: 'REVOKED', expiresAt: past })).toBe(false)
  })
  it('is true when already EXPIRED', () => {
    expect(isExpired({ status: 'EXPIRED', expiresAt: future })).toBe(true)
  })
})

describe('revalidateQuote at checkout', () => {
  const quote = { status: 'ACCEPTED', expiresAt: new Date(Date.now() + 60_000), originalPrice: 1000, finalPrice: 850 }

  it('accepts a still-valid quote at the same price above the floor', () => {
    expect(revalidateQuote(quote, { price: 1000, floor: 800 })).toEqual({ ok: true })
  })
  it('rejects price drift beyond tolerance', () => {
    expect(revalidateQuote(quote, { price: 1200, floor: 800 })).toEqual({ ok: false, reason: 'PRICE_DRIFT' })
  })
  it('rejects when the floor moved above the agreed price', () => {
    expect(revalidateQuote(quote, { price: 1000, floor: 900 })).toEqual({ ok: false, reason: 'BELOW_FLOOR' })
  })
  it('rejects an expired quote', () => {
    expect(revalidateQuote({ ...quote, expiresAt: new Date(Date.now() - 1) }, { price: 1000, floor: 800 })).toEqual({ ok: false, reason: 'EXPIRED' })
  })
  it('rejects a terminal quote', () => {
    expect(revalidateQuote({ ...quote, status: 'REVOKED' }, { price: 1000, floor: 800 })).toEqual({ ok: false, reason: 'TERMINAL' })
  })
})

describe('toPublicQuote never leaks the floor', () => {
  it('omits internal fields', () => {
    const pub = toPublicQuote({
      id: 'q1', token: 't', status: 'ACCEPTED', shopifyProductId: '1', variantId: null,
      quantity: 1, originalPrice: 1000, finalPrice: 850, discountPercent: 15,
      currency: 'INR', discountCode: 'BARGAIN-AB', expiresAt: new Date(),
    } as any)
    expect(pub).not.toHaveProperty('floorPrice')
    expect(pub.finalPrice).toBe(850)
    expect(pub.token).toBe('t')
  })
})

describe('createQuote', () => {
  it('returns null when the flag is off', async () => {
    process.env.BARGAIN_QUOTE = 'false'
    const q = await createQuote({ storeId: 's1', shopifyProductId: 'p1', originalPrice: 1000, finalPrice: 850, discountPercent: 15, floorPrice: 800 })
    expect(q).toBeNull()
    expect(mockPrisma.bargainQuote.create).not.toHaveBeenCalled()
  })

  it('creates the row + audit event and signs a token', async () => {
    mockPrisma.bargainQuote.create.mockImplementation(({ data }: any) => Promise.resolve(data))
    mockPrisma.bargainQuoteEvent.create.mockResolvedValue({})
    const q = await createQuote({ storeId: 's1', sessionId: 'sess', shopifyProductId: 'p1', originalPrice: 1000, finalPrice: 850, discountPercent: 15, floorPrice: 800 })
    expect(q).not.toBeNull()
    expect(q!.status).toBe('CREATED')
    expect(verifyQuoteToken(q!.id, q!.token)).toBe(true)
    expect(mockPrisma.bargainQuoteEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'created', toStatus: 'CREATED' }) }),
    )
  })
})

describe('transitionQuote CAS', () => {
  it('returns null when no row matches the CAS', async () => {
    mockPrisma.bargainQuote.findUnique.mockResolvedValue({ storeId: 's1' })
    mockPrisma.bargainQuote.updateMany.mockResolvedValue({ count: 0 })
    const r = await transitionQuote({ quoteId: 'q1', to: 'ACCEPTED' })
    expect(r).toBeNull()
    expect(mockPrisma.bargainQuoteEvent.create).not.toHaveBeenCalled()
  })

  it('writes the audit event on a winning transition', async () => {
    mockPrisma.bargainQuote.findUnique.mockResolvedValue({ storeId: 's1' })
    mockPrisma.bargainQuote.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.bargainQuoteEvent.create.mockResolvedValue({})
    const r = await transitionQuote({ quoteId: 'q1', to: 'ACCEPTED' })
    expect(r).toEqual({ id: 'q1', status: 'ACCEPTED', storeId: 's1' })
    expect(mockPrisma.bargainQuoteEvent.create).toHaveBeenCalled()
  })
})

describe('acceptQuote / markQuoteCheckoutPending idempotency', () => {
  it('acceptQuote is a no-op when already ACCEPTED', async () => {
    const r = await acceptQuote({ id: 'q1', status: 'ACCEPTED' })
    expect(r).toEqual({ id: 'q1', status: 'ACCEPTED' })
    expect(mockPrisma.bargainQuote.updateMany).not.toHaveBeenCalled()
  })
})

describe('redeemQuote single-use', () => {
  it('is idempotent for the same order id', async () => {
    const r = await redeemQuote({ quote: { id: 'q1', status: 'REDEEMED', orderId: 'o1' }, orderId: 'o1' })
    expect(r).toEqual({ ok: true, alreadyRedeemed: true })
  })
  it('conflicts when a different order tries to redeem', async () => {
    const r = await redeemQuote({ quote: { id: 'q1', status: 'REDEEMED', orderId: 'o1' }, orderId: 'o2' })
    expect(r).toEqual({ ok: false, reason: 'CONFLICT' })
  })
  it('rejects an expired quote', async () => {
    const r = await redeemQuote({ quote: { id: 'q1', status: 'EXPIRED' }, orderId: 'o2' })
    expect(r).toEqual({ ok: false, reason: 'EXPIRED' })
  })
  it('wins the CAS exactly once', async () => {
    mockPrisma.bargainQuote.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.bargainQuoteEvent.create.mockResolvedValue({})
    const r = await redeemQuote({ quote: { id: 'q1', status: 'ACCEPTED', storeId: 's1' }, orderId: 'o1' })
    expect(r).toEqual({ ok: true })
  })
  it('reports a conflict when the CAS loses', async () => {
    mockPrisma.bargainQuote.updateMany.mockResolvedValue({ count: 0 })
    const r = await redeemQuote({ quote: { id: 'q1', status: 'ACCEPTED', storeId: 's1' }, orderId: 'o1' })
    expect(r).toEqual({ ok: false, reason: 'CONFLICT' })
  })
})
