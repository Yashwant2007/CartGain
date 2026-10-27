/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server'
import BargainWidget from '@/components/bargain/BargainWidget'

const baseProps = {
  storeId: 'test-store',
  shopifyProductId: 'gid://shopify/Product/1',
  variantId: 'gid://shopify/ProductVariant/2',
  originalPrice: 999,
  cartToken: 'test-cart-token',
  maxAttempts: 4,
  embedded: true,
} as const

describe('BargainWidget static styles', () => {
  it('leaves scoped CSS unescaped so hydration compares identical text', () => {
    const html = renderToStaticMarkup(<BargainWidget {...baseProps} view="inline" />)

    expect(html).toContain("shopper's own bubble")
    expect(html).toContain('.cg-mini-copy > div:first-child')
    expect(html).not.toContain('shopper&#x27;s own bubble')
    expect(html).not.toContain('.cg-mini-copy &gt; div:first-child')
  })
})
