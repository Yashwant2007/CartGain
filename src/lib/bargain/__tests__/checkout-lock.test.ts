import {
  bargainSessionIdentityClauses,
  hasPurchaseSince,
  hasStrongBuyerProof,
  hasStrongProofForSession,
  isCheckoutLocked,
  latestPurchase,
  purchaseDisplayName,
  purchaseMemoryIdentityClauses,
  strongSessionIdentityClauses,
} from '@/lib/bargain/checkout-lock'

describe('bargain checkout lock helpers', () => {
  it('builds identity clauses only from handles the caller actually has', () => {
    expect(bargainSessionIdentityClauses({
      customerFingerprint: 'fp-12345678',
      customerEmail: 'buyer@example.com',
      cartToken: null,
    })).toEqual([
      { customerFingerprint: 'fp-12345678' },
      { customerEmail: 'buyer@example.com' },
    ])
    expect(purchaseMemoryIdentityClauses({
      customerEmail: 'buyer@example.com',
      cartToken: 'cart-1',
      customerPhone: '+911234567890',
      customerId: 'gid://shopify/Customer/1',
    })).toEqual([
      { customerEmail: 'buyer@example.com' },
      { cartToken: 'cart-1' },
      { customerPhone: '+911234567890' },
      { customerId: 'gid://shopify/Customer/1' },
    ])
  })

  it('separates strong rejoin clauses from weak lookup clauses', () => {
    const identity = {
      customerFingerprint: 'fp-12345678',
      customerEmail: 'buyer@example.com',
      cartToken: 'cart-1',
      customerPhone: '+911234567890',
    }
    expect(strongSessionIdentityClauses(identity)).toEqual([
      { customerFingerprint: 'fp-12345678' },
      { cartToken: 'cart-1' },
    ])
    expect(bargainSessionIdentityClauses(identity)).toEqual([
      { customerFingerprint: 'fp-12345678' },
      { cartToken: 'cart-1' },
      { customerEmail: 'buyer@example.com' },
      { customerPhone: '+911234567890' },
    ])
  })

  it('proves ownership only with a fingerprint, cart token, or signed token', () => {
    expect(hasStrongBuyerProof({ customerEmail: 'buyer@example.com', customerPhone: '+911234567890' })).toBe(false)
    expect(hasStrongBuyerProof({ customerFingerprint: 'fp-12345678' })).toBe(true)
    expect(hasStrongBuyerProof({ cartToken: 'cart-1' })).toBe(true)
    expect(hasStrongBuyerProof({ tokenSessionId: 'sess-1' })).toBe(true)

    const session = { id: 'sess-1', customerFingerprint: 'fp-12345678', cartToken: 'cart-1' }
    expect(hasStrongProofForSession(session, { customerEmail: 'buyer@example.com' })).toBe(false)
    expect(hasStrongProofForSession(session, { customerFingerprint: 'fp-12345678' })).toBe(true)
    expect(hasStrongProofForSession(session, { cartToken: 'cart-1' })).toBe(true)
    expect(hasStrongProofForSession(session, { tokenSessionId: 'sess-1' })).toBe(true)
    expect(hasStrongProofForSession(session, { tokenSessionId: 'sess-2' })).toBe(false)
  })

  it('locks after checkout opens and unlocks only on a newer verified purchase', () => {
    const openedAt = new Date('2026-11-18T10:00:00Z')
    const session = { checkoutOpenedAt: openedAt }

    expect(isCheckoutLocked(session, [])).toBe(true)
    expect(isCheckoutLocked(session, [{ purchasedAt: new Date('2026-11-18T09:59:59Z') }])).toBe(true)
    expect(isCheckoutLocked(session, [{ purchasedAt: new Date('2026-11-18T10:00:01Z') }])).toBe(false)
    expect(isCheckoutLocked({ ...session, checkoutPurchaseAt: new Date('2026-11-18T10:00:01Z') })).toBe(false)
    expect(isCheckoutLocked({ checkoutOpenedAt: null })).toBe(false)
    expect(hasPurchaseSince([{ purchasedAt: new Date('2026-11-18T10:00:01Z') }], openedAt)).toBe(true)
  })

  it('summarizes the most recent real purchase without inventing a product title', () => {
    const purchases = [
      {
        shopifyOrderId: '1001',
        shopifyProductId: 'gid://shopify/Product/55',
        productTitle: null,
        price: 799,
        purchasedAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        shopifyOrderId: '1002',
        shopifyProductId: ' gid://shopify/Product/77',
        productTitle: 'Trail Runner',
        price: 1299,
        purchasedAt: new Date('2026-11-10T10:00:00Z'),
      },
    ]

    const latest = latestPurchase(purchases)
    expect(latest?.shopifyOrderId).toBe('1002')
    expect(purchaseDisplayName(latest!)).toBe('Trail Runner')
    expect(purchaseDisplayName(purchases[0])).toBe('Product 55')
    expect(purchaseDisplayName({ shopifyOrderId: '1003', purchasedAt: new Date() })).toBe('your last order')
  })
})
