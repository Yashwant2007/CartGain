import { cleanShopifyName } from '../shopify'

describe('cleanShopifyName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanShopifyName('  Asha   Sharma  ')).toBe('Asha Sharma')
  })

  it('returns null for blank and placeholder names', () => {
    expect(cleanShopifyName('   ')).toBeNull()
    expect(cleanShopifyName('Valued Customer')).toBeNull()
    expect(cleanShopifyName('guest')).toBeNull()
    expect(cleanShopifyName(null)).toBeNull()
  })
})
