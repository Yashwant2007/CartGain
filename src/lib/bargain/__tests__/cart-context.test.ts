import {
  normalizeCartContext,
  resolveCartMode,
  cartContextPromptBlock,
  publicCartContext,
  type CartContext,
} from '@/lib/bargain/cart-context'

const payload = () => ({
  platform: 'shopify',
  cartToken: 'tok-123',
  cartId: 'gid://shopify/Cart/1',
  storeId: 'store-1',
  currency: 'inr',
  lines: [
    { lineId: 'l1', productId: 'p1', title: 'Shirt', quantity: 2, unitPrice: 500 },
    { lineId: 'l2', productId: 'p2', title: 'Hat', quantity: 1, unitPrice: 250 },
  ],
  discountCodes: ['SAVE10'],
  mode: 'cart_percentage',
  source: 'server',
  customerEmail: 'shopper@example.com',
  customerPhone: '+911234567890',
  customerId: 'cust-1',
  fingerprint: 'fp-1',
  config: { cartWideBargainingEnabled: true, bundleOffersEnabled: true },
})

const normalized = (over: Record<string, unknown> = {}): CartContext => {
  const context = normalizeCartContext({ ...payload(), ...over })
  if (!context) throw new Error('fixture rejected')
  return context
}

describe('normalizeCartContext', () => {
  it('builds a bounded, source-tagged context with computed totals', () => {
    const context = normalized()
    expect(context.platform).toBe('shopify')
    expect(context.currency).toBe('INR')
    expect(context.subtotal).toBe(1250)
    expect(context.totalValue).toBe(1250)
    expect(context.lines).toHaveLength(2)
    expect(context.lines[0].lineTotal).toBe(1000)
    expect(context.mode).toBe('cart_percentage')
    expect(context.source).toBe('server')
    expect(context.versionHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes only cart content, never PII, source or mode', () => {
    const context = normalized()
    const changedIdentity = normalized({
      customerEmail: 'other@example.com',
      customerPhone: '+919999999999',
      fingerprint: 'fp-other',
      source: 'client',
      mode: 'product_only',
    })
    expect(changedIdentity.versionHash).toBe(context.versionHash)
    expect(normalized({ subtotal: 1300 }).versionHash).not.toBe(context.versionHash)
    expect(normalized({ discountCodes: ['OTHER'] }).versionHash).not.toBe(context.versionHash)
    expect(
      normalized({ lines: [{ lineId: 'l1', title: 'Shirt', quantity: 2, unitPrice: 510 }, payload().lines[1]] })
        .versionHash,
    ).not.toBe(context.versionHash)
  })

  it('rejects unsafe numerics, missing identity and wrong shapes', () => {
    expect(normalizeCartContext(null)).toBeNull()
    expect(normalizeCartContext({ ...payload(), lines: [{ lineId: 'x', unitPrice: NaN }] })).toBeNull()
    expect(normalizeCartContext({ ...payload(), lines: [{ lineId: 'x', unitPrice: -1 }] })).toBeNull()
    expect(normalizeCartContext({ ...payload(), lines: [{ lineId: 'x', quantity: Infinity }] })).toBeNull()
    expect(normalizeCartContext({ ...payload(), subtotal: -5 })).toBeNull()
    expect(normalizeCartContext({ ...payload(), cartToken: '', cartId: '' })).toBeNull()
    expect(normalizeCartContext({ ...payload(), lines: 'not-an-array' })).toBeNull()
  })

  it('caps lines, codes and string lengths', () => {
    const manyLines = Array.from({ length: 40 }, (_, index) => ({
      lineId: `l${index}`,
      title: 'x'.repeat(500),
      quantity: 1,
      unitPrice: 10,
    }))
    const context = normalized({
      lines: manyLines,
      cartToken: 't'.repeat(1000),
      discountCodes: Array.from({ length: 30 }, (_, index) => `CODE${index}`),
      customerEmail: 'e'.repeat(500),
    })
    expect(context.lines).toHaveLength(25)
    expect(context.lines[0].title).toHaveLength(200)
    expect(context.cartToken).toHaveLength(200)
    expect(context.customerEmail).toHaveLength(254)
    expect(context.discountCodes).toHaveLength(20)
  })
})

describe('resolveCartMode', () => {
  const enabled = { bundleOffersEnabled: true, cartWideBargainingEnabled: true }

  it('falls back to product_only for missing or invalid requests', () => {
    expect(resolveCartMode({ requestedMode: undefined, lineCount: 3, config: enabled })).toBe('product_only')
    expect(resolveCartMode({ requestedMode: 'free-for-all', lineCount: 3, config: enabled })).toBe('product_only')
    expect(resolveCartMode({ requestedMode: 'bundle', lineCount: NaN, config: enabled })).toBe('product_only')
  })

  it('enables cart-wide modes only when explicitly requested and enabled', () => {
    expect(resolveCartMode({ requestedMode: 'cart_percentage', lineCount: 1 })).toBe('product_only')
    expect(resolveCartMode({ requestedMode: 'cart_percentage', lineCount: 1, config: enabled })).toBe('cart_percentage')
    expect(resolveCartMode({ requestedMode: 'cart_fixed', lineCount: 1, config: enabled })).toBe('cart_fixed')
    expect(resolveCartMode({ requestedMode: 'cart_fixed', lineCount: 1, config: { bundleOffersEnabled: true } })).toBe(
      'product_only',
    )
  })

  it('enables bundles only for multi-line carts with the merchant flag', () => {
    expect(resolveCartMode({ requestedMode: 'bundle', lineCount: 1, config: enabled })).toBe('product_only')
    expect(resolveCartMode({ requestedMode: 'bundle', lineCount: 2, config: enabled })).toBe('bundle')
    expect(
      resolveCartMode({ requestedMode: 'bundle', lineCount: 2, config: { cartWideBargainingEnabled: true } }),
    ).toBe('product_only')
  })
})

describe('cartContextPromptBlock', () => {
  it('states verified facts and truth rules without PII, floors or code values', () => {
    const block = cartContextPromptBlock(normalized())
    expect(block).toContain('merchant/server-verified')
    expect(block).toContain('1250.00')
    expect(block).toContain('values withheld')
    expect(block).toContain('never floors or margins')
    expect(block.length).toBeLessThan(1500)
    expect(block).not.toContain('shopper@example.com')
    expect(block).not.toContain('tok-123')
    expect(block).not.toContain('SAVE10')
  })

  it('stays bounded with the maximum number of lines', () => {
    const block = cartContextPromptBlock(
      normalized({
        lines: Array.from({ length: 25 }, (_, index) => ({
          lineId: `l${index}`,
          title: 'x'.repeat(200),
          quantity: 1,
          unitPrice: 10,
        })),
      }),
    )
    expect(block.length).toBeLessThanOrEqual(1500)
  })

  it('is honest when there is no verified cart', () => {
    expect(cartContextPromptBlock(null)).toContain('no cart lines, prices or codes are verified')
  })
})

describe('publicCartContext', () => {
  it('is PII-free and masks discount codes to presence only', () => {
    expect(publicCartContext(normalized())).toEqual({
      mode: 'cart_percentage',
      lineCount: 2,
      currency: 'INR',
      subtotal: 1250,
      totalValue: 1250,
      discountCodes: ['present'],
      versionHash: normalized().versionHash,
    })
    expect(publicCartContext(null).discountCodes).toEqual([])
    expect(JSON.stringify(publicCartContext(normalized()))).not.toContain('shopper@example.com')
    expect(JSON.stringify(publicCartContext(normalized()))).not.toContain('SAVE10')
    expect(JSON.stringify(publicCartContext(normalized()))).not.toContain('tok-123')
  })
})
