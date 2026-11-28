import { buildSalesPitch, strengthenComparisonPitch } from '../sales-pitch'
import type { ProductContext } from '../product-context'

function product(over: Partial<ProductContext> = {}): ProductContext {
  return {
    productId: 'p1',
    variantId: null,
    title: 'Trail Sneaker',
    vendor: 'Acme',
    productType: 'Footwear',
    tags: ['lightweight'],
    description: 'Built for daily commutes.',
    descriptionSource: 'SHOPIFY',
    variants: [],
    selectedVariant: null,
    price: 999,
    compareAtPrice: null,
    currency: 'INR',
    available: true,
    inventoryStatus: 'in_stock',
    imageUrl: null,
    productUrl: null,
    activePromotions: [],
    merchantApprovedSellingPoints: ['reinforced stitching and a 2-year replacement'],
    merchantDisallowedClaims: [],
    merchantFaq: [],
    lastSyncedAt: '',
    dataVersion: '1',
    fetchFailed: false,
    ...over,
  } as ProductContext
}

describe('buildSalesPitch', () => {
  it('leads with verified value and does not ask the shopper to name a price', () => {
    const out = buildSalesPitch({
      persona: 'strict_negotiator',
      product: product(),
      productTitle: 'Trail Sneaker',
      listedPrice: '₹999.00',
    })

    expect(out).toContain('reinforced stitching and a 2-year replacement')
    expect(out).toContain('₹999.00')
    expect(out).not.toMatch(/what price|share (?:the|your) price|name a price/i)
  })

  it('stays honest when no verified product facts exist', () => {
    const out = buildSalesPitch({
      persona: 'friendly_shopkeeper',
      product: product({ fetchFailed: true, merchantApprovedSellingPoints: [], description: '' }),
      productTitle: 'Trail Sneaker',
    })

    expect(out).toMatch(/won't invent reasons/i)
    expect(out).not.toMatch(/best|guarantee|bestseller|selling out/i)
  })
})

describe('strengthenComparisonPitch', () => {
  it('replaces the dismissive opener with a verified value pitch and a close', () => {
    const reply = "Nice try, but I can't go that low. How about I bring it down to ₹782.02 for you? 🙏"
    const out = strengthenComparisonPitch(reply, {
      persona: 'playful_friend',
      product: product(),
    })

    expect(out).not.toMatch(/Nice try|can't go that low/i)
    expect(out).toContain('₹782.02')
    expect(out).toContain('reinforced stitching and a 2-year replacement')
    expect(out).toMatch(/Shall I lock it in/i)
  })

  it('keeps a reply that already pitches verified value and closes', () => {
    const reply =
      "I can't verify their number, but the replacement and genuine build make this worth it. Shall I lock it in for you?"
    expect(
      strengthenComparisonPitch(reply, { persona: 'friendly_shopkeeper', product: product() }),
    ).toBe(reply)
  })

  it('still closes honestly when no verified product facts exist', () => {
    const out = strengthenComparisonPitch('I can only do ₹782.02 here.', {
      persona: 'strict_negotiator',
      product: product({ fetchFailed: true, merchantApprovedSellingPoints: [] }),
    })

    expect(out).toContain("I can't verify prices elsewhere")
    expect(out).toMatch(/Confirm if you would like me to lock this in/i)
  })
})
