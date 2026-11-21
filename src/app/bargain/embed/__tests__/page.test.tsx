/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server'
import EmbedPage from '../page'
import prisma from '@/lib/db'
import { resolveActiveStoreIdByShopDomain } from '@/lib/stores/resolve-by-domain'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    bargainConfig: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/stores/resolve-by-domain', () => ({
  resolveActiveStoreIdByShopDomain: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  bargainConfig: { findUnique: jest.Mock }
  store: { findUnique: jest.Mock }
}
const resolveMock = resolveActiveStoreIdByShopDomain as jest.Mock

const SEARCH = {
  shop: 'acme.myshopify.com',
  product: 'gid://shopify/Product/1',
  price: '49.99',
  currency: 'USD',
  title: 'Trail%20Boots',
}

const WOO_SEARCH = {
  platform: 'woocommerce',
  storeId: 'woo-store-1',
  productId: '42',
  variationId: '42',
  price: '99.00',
  currency: 'USD',
  title: 'Woo%20Product',
}

beforeEach(() => {
  jest.clearAllMocks()
  resolveMock.mockResolvedValue('store-1')
})

it('announces an empty frame when the merchant disabled bargaining', async () => {
  prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: false })
  const html = renderToStaticMarkup(await EmbedPage({ searchParams: SEARCH }))
  expect(html).toContain("type:'cg_empty'")
  expect(html).toContain('background: transparent !important')
  expect(html).not.toContain('cartgain-bargain')
})

it('renders the widget when bargaining is enabled', async () => {
  prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, language: 'en' })
  const html = renderToStaticMarkup(await EmbedPage({ searchParams: SEARCH }))
  expect(html).not.toContain("type:'cg_empty'")
  expect(html).toContain('Trail Boots')
})

it('renders the widget for WooCommerce storefront params', async () => {
  prismaMock.store.findUnique.mockResolvedValue({
    id: 'woo-store-1',
    isActive: true,
    platform: 'woocommerce',
    currency: 'USD',
  })
  prismaMock.bargainConfig.findUnique.mockResolvedValue({ enabled: true, language: 'en' })
  const html = renderToStaticMarkup(await EmbedPage({ searchParams: WOO_SEARCH }))
  expect(prismaMock.store.findUnique).toHaveBeenCalledWith({
    where: { id: 'woo-store-1' },
    select: { id: true, isActive: true, platform: true, currency: true },
  })
  expect(html).not.toContain("type:'cg_empty'")
  expect(html).toContain('Woo Product')
})
