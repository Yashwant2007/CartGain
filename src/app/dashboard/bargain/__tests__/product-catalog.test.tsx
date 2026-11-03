/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import { ProductCatalogPanel } from '../product-catalog'

jest.mock('@/lib/shopify-session-fetch', () => ({
  shopifySessionFetch: jest.fn(),
}))

const mockedFetch = shopifySessionFetch as jest.Mock

function product(id: string, title: string) {
  return {
    id,
    title,
    status: 'active',
    variants: [{ price: '24.95' }],
  }
}

const initialCatalog = {
  products: [
    {
      product: product('111', 'Snowboard'),
      bargains: { overrideId: null, enabled: true, minPrice: null, maxDiscountPercent: null },
    },
    {
      product: product('222', 'Winter Jacket'),
      bargains: { overrideId: 'override-2', enabled: false, minPrice: 20, maxDiscountPercent: 30 },
    },
  ],
  savedOverrides: [
    {
      id: 'override-2',
      shopifyProductId: '222',
      productTitle: 'Winter Jacket',
      minPrice: 20,
      minProfitPercent: null,
      maxDiscountPercent: 30,
      isBargainable: false,
    },
  ],
  nextCursor: 'next-page',
  prevCursor: null,
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  jest.clearAllMocks()
  window.confirm = jest.fn(() => true)
  mockedFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return Promise.resolve(jsonResponse({
        product: {
          id: body.shopifyProductId === '222' ? 'override-2' : 'override-1',
          shopifyProductId: body.shopifyProductId,
          productTitle: body.productTitle,
          minPrice: body.minPrice ?? null,
          minProfitPercent: null,
          maxDiscountPercent: body.maxDiscountPercent ?? null,
          isBargainable: body.isBargainable,
        },
      }))
    }
    if (init?.method === 'DELETE') return Promise.resolve(jsonResponse({ message: 'deleted' }))
    if (url.includes('cursor=next-page')) {
      return Promise.resolve(jsonResponse({
        products: [{
          product: product('333', 'Page Two Product'),
          bargains: { overrideId: null, enabled: true, minPrice: null, maxDiscountPercent: null },
        }],
        savedOverrides: [],
        nextCursor: null,
        prevCursor: 'first',
      }))
    }
    if (url.includes('q=jacket')) {
      return Promise.resolve(jsonResponse({ products: [], savedOverrides: [], nextCursor: null, prevCursor: null }))
    }
    return Promise.resolve(jsonResponse(initialCatalog))
  })
})

afterEach(cleanup)

describe('ProductCatalogPanel', () => {
  it('shows product state and lets the merchant pause or enable a product', async () => {
    render(<ProductCatalogPanel storeId="store-1" />)

    expect(await screen.findByText('Snowboard')).toBeTruthy()
    expect(screen.getByText('1 bargaining')).toBeTruthy()
    expect(screen.getByText('1 paused')).toBeTruthy()

    fireEvent.click(screen.getByRole('switch', { name: 'Enable bargaining for Winter Jacket' }))

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledWith('/api/bargain/products', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          storeId: 'store-1',
          shopifyProductId: '222',
          productTitle: 'Winter Jacket',
          isBargainable: true,
        }),
      }))
    })
    expect(await screen.findByText('Winter Jacket is available for bargaining')).toBeTruthy()
  })

  it('resets a product rule by its override id', async () => {
    render(<ProductCatalogPanel storeId="store-1" />)
    await screen.findByText('Winter Jacket')

    fireEvent.click(screen.getByRole('button', { name: 'Reset product rule for Winter Jacket' }))

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledWith(
        '/api/bargain/products?storeId=store-1&id=override-2',
        { method: 'DELETE' },
      )
    })
  })

  it('refreshes the page the merchant is looking at', async () => {
    render(<ProductCatalogPanel storeId="store-1" />)
    await screen.findByText('Snowboard')

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(await screen.findByText('Page Two Product')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    await waitFor(() => {
      const calls = mockedFetch.mock.calls.filter(([url]: [string]) => url.includes('/catalog'))
      const last = calls[calls.length - 1][0] as string
      expect(last).toContain('cursor=next-page')
    })
    expect(await screen.findByText('Page Two Product')).toBeTruthy()
  })

  it('starts a new search without carrying the old catalog cursor', async () => {
    render(<ProductCatalogPanel storeId="store-1" />)
    await screen.findByText('Snowboard')

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledWith(expect.stringContaining('cursor=next-page'), expect.anything())
    })

    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'jacket' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      const calls = mockedFetch.mock.calls.filter(([url]: [string]) => url.includes('/catalog'))
      const last = calls[calls.length - 1][0] as string
      expect(last).toContain('q=jacket')
      expect(last).not.toContain('cursor=')
    })
  })
})
