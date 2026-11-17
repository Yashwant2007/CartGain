/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BargainWidget from '../BargainWidget'

const baseProps = {
  storeId: 'test-store',
  shopifyProductId: 'gid://shopify/Product/1',
  variantId: 'gid://shopify/ProductVariant/2',
  originalPrice: 999,
  cartToken: 'test-cart-token',
  embedded: true,
  view: 'inline',
} as const

const recommendation = {
  productId: 'gid://shopify/Product/77',
  variantId: 'gid://shopify/ProductVariant/88',
  title: 'Better Runner',
  price: 799,
  currency: 'INR',
  imageUrl: null,
  productUrl: 'https://example.myshopify.com/products/better-runner',
  available: true,
  onSale: false,
  budgetFit: 'under' as const,
  tags: [],
  reason: 'Closer to your budget',
}

const history = {
  entries: [],
  shownProductIds: [],
  clickedProductIds: [],
  addedProductIds: [],
  dismissedProductIds: [],
  rejectedProductIds: [],
  lastShownProductIds: [],
  lastShownAt: null,
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    },
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: () => {},
  })
})

beforeEach(() => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/bargain/start')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sessionId: 'session-1',
          openingMessage: 'Welcome, what price feels fair?',
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }),
      }
    }
    if (url.includes('/api/bargain/offer')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reply: 'I can do 850 for you.',
          decision: 'counter',
          counterOffer: 850,
          attemptsUsed: 1,
          recommendations: [recommendation],
          recommendationReason: 'Verified alternatives from this store',
          recommendationHistory: history,
        }),
      }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }) as unknown as typeof fetch
})

describe('BargainWidget conversation-first layout', () => {
  it('keeps the chat log on the Deal tab and renders recommendations outside it', async () => {
    const { container } = render(<BargainWidget {...baseProps} />)

    await waitFor(() => expect(screen.getAllByText('Welcome, what price feels fair?').length).toBeGreaterThan(0), { timeout: 3000 })
    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '700' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => expect(screen.getAllByText('I can do 850 for you.').length).toBeGreaterThan(0))
    const panel = container.querySelector('[data-cg-recommendation-panel]')
    expect(panel).toBeTruthy()
    expect(screen.getByRole('log').querySelector('[data-cg-recommendation-panel]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Deal' }))
    expect(screen.getByRole('log')).toBeTruthy()
    expect(screen.getByText('Deal at a glance')).toBeTruthy()
    expect(within(screen.getByRole('log')).getByText('Welcome, what price feels fair?')).toBeTruthy()
    expect(screen.queryByText('Deal details')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
    expect(container.querySelector('[data-cg-recommendation-panel]')).toBeTruthy()
  })
})
