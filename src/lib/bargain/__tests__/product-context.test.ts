import { normalizeProduct, stripDisallowedClaims, productContextToPromptBlock, isContextStale, computeInventoryStatus, type ShopifyProductSource } from '../product-context'

const sampleSource = (over: Partial<ShopifyProductSource> = {}): ShopifyProductSource => ({
  id: '9001',
  title: 'Retro Runner Sneakers',
  handle: 'retro-runner-sneakers',
  vendor: 'Stepwell',
  product_type: 'Footwear',
  tags: 'shoes, running, sale',
  body_html: '<p>Breathable mesh upper.</p><p>All-day comfort foam.</p>',
  variants: [
    { id: '77', title: 'M / Black', price: '1200.00', compare_at_price: '1600.00', available: true, inventory_quantity: 9, inventory_policy: 'deny', option1: 'M', option2: 'Black' },
    { id: '78', title: 'L / Black', price: '1200.00', compare_at_price: '1600.00', available: false, inventory_quantity: 0, inventory_policy: 'deny', option1: 'L', option2: 'Black' },
  ],
  ...over,
})

describe('normalizeProduct', () => {
  it('strips HTML, keeps verified fields, picks the requested variant', () => {
    const ctx = normalizeProduct(sampleSource(), { currency: 'INR', variantId: '77', baseUrl: 'https://demo.store' })
    expect(ctx.description).toContain('Breathable mesh upper')
    expect(ctx.description).not.toContain('<p>')
    expect(ctx.title).toBe('Retro Runner Sneakers')
    expect(ctx.price).toBe(1200)
    expect(ctx.compareAtPrice).toBe(1600)
    expect(ctx.selectedVariant?.variantId).toBe('77')
    expect(ctx.available).toBe(true)
    expect(ctx.productUrl).toBe('https://demo.store/products/retro-runner-sneakers')
    expect(ctx.dataVersion.length).toBeGreaterThan(0)
  })

  it('derives inventory status from quantities', () => {
    const ctx = normalizeProduct(sampleSource(), { currency: 'INR' })
    // M has 9 units, L is sold out → at least one variant is unavailable, so the
    // honest product-level status is "limited".
    expect(ctx.inventoryStatus).toBe('limited')
  })

  it('marks unavailable when the selected variant is sold out', () => {
    const ctx = normalizeProduct(sampleSource(), { currency: 'INR', variantId: '78' })
    expect(ctx.available).toBe(false)
    expect(ctx.inventoryStatus).toBe('out_of_stock')
  })

  it('treats unknown inventory as a broken promise — never claims stock', () => {
    const ctx = normalizeProduct(sampleSource({ variants: [{ id: '1', title: 'Default', price: '1200', inventory_quantity: null, inventory_policy: null }] }), { currency: 'INR' })
    expect(ctx.inventoryStatus).toBe('unknown')
    const block = productContextToPromptBlock(ctx, '₹')
    expect(block).toContain('not verifiable right now')
  })

  it('strips merchant-disallowed claims from the description', () => {
    const raw: ShopifyProductSource = {
      ...sampleSource(),
      body_html: '<p>Certified organic cotton, febresafe fabric</p>',
    }
    const ctx = normalizeProduct(raw, { currency: 'INR', overrides: { disallowedClaims: ['febresafe'] } })
    expect(ctx.description).not.toContain('febresafe')
    expect(ctx.description).toContain('Certified organic cotton')
  })
})

describe('stripDisallowedClaims', () => {
  it('removes a phrase case-insensitively and collapses whitespace', () => {
    expect(stripDisallowedClaims('Great for DRY SKIN and sensitive skin', ['dry skin'])).toBe('Great for and sensitive skin'.replace('  ', ' '))
  })
  it('removes every occurrence of each claim', () => {
    expect(stripDisallowedClaims('silk touch silk touch finish', ['silk touch'])).toBe('finish')
  })
  it('ignores empty claims', () => {
    expect(stripDisallowedClaims('keep the text', ['   ', ''])).toBe('keep the text')
  })
})

describe('productContextToPromptBlock', () => {
  it('tags sources and never includes disallowed or unverified claims', () => {
    const ctx = normalizeProduct(
      sampleSource(),
      { currency: 'INR', overrides: { approvedSellingPoints: ['machine-washable'] } },
    )
    const block = productContextToPromptBlock(ctx, '₹')
    expect(block).toContain('SHOPIFY_VERIFIED')
    expect(block).toContain('machine-washable [MERCHANT_PROVIDED]')
    expect(block).toContain('₹1200.00')
  })

  it('warns the model when the catalog fetch failed', () => {
    const ctx = normalizeProduct({ id: '1', title: 'Soleless Slippers', variants: [] }, { currency: 'INR', fetchFailed: true })
    const block = productContextToPromptBlock(ctx, '₹')
    expect(block).toContain('could not be verified right now')
    expect(block).not.toContain('₹')
  })

  it('renders active promotions only when truthful', () => {
    const ctx = normalizeProduct(sampleSource(), {
      currency: 'INR',
      promotions: [{ name: 'FESTIVE', message: 'sale on now', source: 'CARTGAIN_DERIVED', active: true }],
    })
    const block = productContextToPromptBlock(ctx, '₹')
    expect(block).toContain('FESTIVE')
  })
})

describe('isContextStale', () => {
  const ctx = normalizeProduct(sampleSource(), { currency: 'INR' })
  it('is fresh right after build', () => {
    expect(isContextStale(ctx)).toBe(false)
  })
  it('is stale after the max age', () => {
    const old = { ...ctx, lastSyncedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() }
    expect(isContextStale(old)).toBe(true)
  })
})

describe('computeInventoryStatus', () => {
  it('maps quantities to statuses', () => {
    expect(computeInventoryStatus([{ variantId: 'a', title: 'A', price: 1, compareAtPrice: null, available: true, inventoryQuantity: 3, attributes: [] }])).toBe('limited')
    expect(computeInventoryStatus([{ variantId: 'a', title: 'A', price: 1, compareAtPrice: null, available: true, inventoryQuantity: 0, attributes: [] }])).toBe('out_of_stock')
    expect(computeInventoryStatus([])).toBe('unknown')
  })
})