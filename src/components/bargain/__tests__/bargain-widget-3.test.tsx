/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BargainWidget from '../BargainWidget'
import { DEFAULT_BARGAIN_EXPERIENCE } from '@/lib/bargain/experience/types'

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
  it('shows the configured shopkeeper avatar in the chat header', async () => {
    const { container } = render(
      <BargainWidget
        {...baseProps}
        experience={{ ...DEFAULT_BARGAIN_EXPERIENCE, avatarVariant: 'riley', personality: 'friendly_shopkeeper' }}
      />,
    )

    await waitFor(() => expect(screen.getByText('Bargain with us')).toBeTruthy(), { timeout: 3000 })
    const avatar = container.querySelector('[data-cg-header-avatar][data-avatar-variant="riley"]')
    expect(avatar).toBeTruthy()
    expect(avatar?.querySelector('.cg-v2-art')).toBeTruthy()
    expect(container.querySelector('[data-cg-header-avatar] img')).toBeNull()
  })

  it('sends the WooCommerce platform when starting a session', async () => {
    render(<BargainWidget {...baseProps} platform="woocommerce" shopifyProductId="42" variantId="42" />)

    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(([input]) => String(input).includes('/api/bargain/start'))
      expect(call).toBeDefined()
      expect(JSON.parse(call[1].body)).toEqual(expect.objectContaining({
        platform: 'woocommerce',
        storeId: 'test-store',
        shopifyProductId: '42',
      }))
    })
  })

  it('restores the negotiated transcript and last counter when rejoining a session', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bargain/start')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sessionId: 'session-1',
            session: {
              id: 'session-1',
              status: 'active',
              attemptsUsed: 2,
              currentOffer: 750,
              finalPrice: 700,
              messages: [
                { id: 'm1', role: 'ai', content: 'Welcome', offeredPrice: null, createdAt: new Date(Date.now() - 5000).toISOString() },
                { id: 'm2', role: 'customer', content: '700 please', offeredPrice: 700, createdAt: new Date(Date.now() - 3000).toISOString() },
                { id: 'm3', role: 'ai', content: 'I can do 750', offeredPrice: 750, createdAt: new Date(Date.now() - 1000).toISOString() },
              ],
            },
            openingMessage: 'Welcome',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            existingSession: true,
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }) as unknown as typeof fetch

    render(<BargainWidget {...baseProps} />)

    await waitFor(() => expect(screen.getByText('I can do 750')).toBeTruthy(), { timeout: 3000 })
    expect(screen.getByText('700 please')).toBeTruthy()
    expect(screen.getByText(/Accept offer/)).toBeTruthy()
  })

  it('keeps the chat log on the Deal tab and renders recommendations outside it', async () => {
    const { container } = render(<BargainWidget {...baseProps} />)

    await waitFor(() => expect(screen.getAllByText('Welcome, what price feels fair?').length).toBeGreaterThan(0), { timeout: 3000 })
    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '700' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => expect(screen.getAllByText('I can do 850 for you.').length).toBeGreaterThan(0))
    expect(screen.getByText('Deal at a glance')).toBeTruthy()
    expect(container.querySelector('.cg-stage-best')?.textContent).toContain('Best:')
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

  it('opens checkout in a new tab, marks it server-side, and closes the panel', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bargain/start')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            sessionId: 'session-1',
            openingMessage: 'Welcome, what price feels fair?',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          }),
        }
      }
      if (url.includes('/api/bargain/offer')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            reply: 'That is the last I can do.',
            decision: 'reject',
            sessionStatus: 'rejected',
            discountCode: 'BARGAIN-TEST',
            finalPrice: 700,
            purchaseUrl: 'https://shop.example/discount/BARGAIN-TEST',
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }) as unknown as typeof fetch

    render(<BargainWidget {...baseProps} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })
    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '600' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => expect(screen.getByText('Checkout at your price')).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(screen.getByText('Checkout at your price'))

    expect(openSpy).toHaveBeenCalledWith('https://shop.example/discount/BARGAIN-TEST', '_blank', 'noopener,noreferrer')
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/bargain/checkout-open'),
      expect.objectContaining({ method: 'POST', keepalive: true }),
    ))
    await waitFor(() => expect(screen.queryByRole('log')).toBeNull())
    openSpy.mockRestore()
  })

  it('does not claim the checkout is locked when the server lock write fails', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bargain/start')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            sessionId: 'session-1',
            openingMessage: 'Welcome, what price feels fair?',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          }),
        }
      }
      if (url.includes('/api/bargain/offer')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            reply: 'That is the last I can do.',
            decision: 'reject',
            sessionStatus: 'rejected',
            discountCode: 'BARGAIN-TEST',
            finalPrice: 700,
            purchaseUrl: 'https://shop.example/discount/BARGAIN-TEST',
          }),
        }
      }
      if (url.includes('/api/bargain/checkout-open')) {
        return { ok: false, status: 500, json: async () => ({ ok: false }) }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }) as unknown as typeof fetch

    render(<BargainWidget {...baseProps} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })
    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '600' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => expect(screen.getByText('Checkout at your price')).toBeTruthy(), { timeout: 3000 })
    fireEvent.click(screen.getByText('Checkout at your price'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/bargain/checkout-open'),
      expect.objectContaining({ method: 'POST', keepalive: true }),
    ))
    expect(openSpy).toHaveBeenCalled()
    expect(screen.queryByText('Your checkout is open')).toBeNull()
    openSpy.mockRestore()
  })

  it('renders a locked, no-restart state when the server reports checkout open', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/bargain/start')) {
        return {
          ok: false, status: 409,
          json: async () => ({
            message: 'Finish your current order before starting a new bargain.',
            locked: true,
            lastBought: {
              productTitle: 'Trail Runner',
              priceLabel: '$79.00',
              purchasedAt: '2026-11-10T10:00:00Z',
              orderId: '1002',
            },
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }) as unknown as typeof fetch

    render(<BargainWidget {...baseProps} />)

    await waitFor(() => expect(screen.getByText('Your checkout is open')).toBeTruthy(), { timeout: 3000 })
    expect(screen.getByText(/Last bought: Trail Runner for \$79\.00/)).toBeTruthy()
    expect(screen.queryByText('Start new negotiation')).toBeNull()
    expect(screen.queryByLabelText('Ask about this product or make an offer…')).toBeNull()
  })
})
