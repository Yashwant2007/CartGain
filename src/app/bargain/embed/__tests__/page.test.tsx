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
  },
}))
jest.mock('@/lib/stores/resolve-by-domain', () => ({
  resolveActiveStoreIdByShopDomain: jest.fn(),
}))

const prismaMock = prisma as unknown as {
  bargainConfig: { findUnique: jest.Mock }
}
const resolveMock = resolveActiveStoreIdByShopDomain as jest.Mock

const SEARCH = {
  shop: 'acme.myshopify.com',
  product: 'gid://shopify/Product/1',
  price: '49.99',
  currency: 'USD',
  title: 'Trail%20Boots',
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
