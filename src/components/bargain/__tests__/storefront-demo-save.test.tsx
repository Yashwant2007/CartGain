/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import StorefrontBargainWidget from '../StorefrontBargainWidget'

const props = {
  mode: 'item' as const,
  shop: 'demo.myshopify.com',
  currency: 'INR',
  line: { kind: 'item' as const, id: '42', title: 'Demo Item', price: 1000 },
  checkoutUrl: 'https://demo.myshopify.com/cart',
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  Object.defineProperty(window, 'requestAnimationFrame', {
    writable: true,
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    },
  })
  Object.defineProperty(window, 'cancelAnimationFrame', {
    writable: true,
    configurable: true,
    value: () => {},
  })
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverMock,
  })
})

function stubFetch() {
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/bargain/demo')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ reply: 'Deal accepted.', decision: 'accept', counterOffer: 700 }),
      }
    }
    if (url.includes('/api/bargain/checkout-accept')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 'REAL-CODE', purchaseUrl: 'https://demo.myshopify.com/cart/42:1?discount=REAL-CODE' }),
      }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

async function reachDeal() {
  fireEvent.click(screen.getByRole('button', { name: 'Start price negotiation' }))
  const input = screen.getByLabelText('Your offer or message')
  fireEvent.change(input, { target: { value: '700' } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })
  await waitFor(() => expect(screen.getByText('Deal Accepted!')).toBeTruthy(), { timeout: 5000 })
}

describe('StorefrontBargainWidget demo deal', () => {
  it('keeps only conversational prompts and prefills without sending', () => {
    render(<StorefrontBargainWidget {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start price negotiation' }))
    const input = screen.getByLabelText('Your offer or message') as HTMLInputElement
    expect(screen.queryByRole('button', { name: /Make offer ·/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tell me about this product' }))
    expect(input.value).toBe('Tell me about this product')
    expect(screen.getByRole('button', { name: 'Send offer' })).toBeTruthy()
  })

  it('uses a sample code and never posts raw client pricing in demo mode', async () => {
    const fetchMock = stubFetch()
    render(<StorefrontBargainWidget {...props} />)
    await reachDeal()
    expect(screen.getByText('Listed:')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create My Discount Code' }))

    await waitFor(() => expect(screen.getByText('CG-42')).toBeTruthy())
    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.some((url) => url.includes('/api/bargain/checkout-accept'))).toBe(false)
  })

  it('keeps the real checkout-accept path outside demo mode', async () => {
    const fetchMock = stubFetch()
    render(<StorefrontBargainWidget {...props} demo={false} />)
    await reachDeal()

    fireEvent.click(screen.getByRole('button', { name: 'Create My Discount Code' }))

    await waitFor(() => expect(screen.getByText('REAL-CODE')).toBeTruthy())
    const acceptCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/bargain/checkout-accept'))
    expect(acceptCall).toBeTruthy()
    const body = JSON.parse(String(acceptCall?.[1]?.body))
    expect(body).toMatchObject({ finalPrice: 700, discountPercent: 30 })
    expect(screen.getByRole('link', { name: 'Go to Checkout' }).getAttribute('href'))
      .toBe('https://demo.myshopify.com/cart/42:1?discount=REAL-CODE')
  })
})
