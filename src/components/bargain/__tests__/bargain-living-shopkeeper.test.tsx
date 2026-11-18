/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const experience = {
  schemaVersion: 1,
  personality: 'strict_shopkeeper' as const,
  designVariant: 'smart-assistant' as const,
  avatarEnabled: true,
  motionEnabled: true,
  characterStyle: 'signature' as const,
  essentialMotionOnly: false,
  localeMode: 'store-default',
  customGreeting: null,
  ctaLabel: null,
  accentColor: null,
  avatarSize: 'md' as const,
  compact: false,
  position: 'bottom-right' as const,
  draftVersion: 1,
  publishedVersion: 1,
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

function stubFetch(overrides: {
  offer?: Record<string, unknown>
  accept?: Record<string, unknown>
  acceptOk?: boolean
} = {}) {
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
          ...(overrides.offer ?? {}),
        }),
      }
    }
    if (url.includes('/api/bargain/accept')) {
      return {
        ok: overrides.acceptOk !== false,
        status: overrides.acceptOk === false ? 409 : 200,
        json: async () => (overrides.acceptOk === false
          ? { code: 'OFFER_REJECTED_BELOW_FLOOR', message: 'That price is no longer available.' }
          : {
              finalPrice: 850,
              discountCode: 'BARGAIN-LIVING',
              purchaseUrl: 'https://shop.example/discount/BARGAIN-LIVING',
              shopifyStatus: 'created',
              ...(overrides.accept ?? {}),
            }),
      }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) }
  }) as unknown as typeof fetch
}

function stage(container: HTMLElement) {
  return container.querySelector('.cg-stage') as HTMLElement | null
}

describe('BargainWidget living shopkeeper', () => {
  beforeEach(() => {
    stubFetch()
  })

  it('enters and greets when the widget opens', async () => {
    const { container } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })

    await waitFor(() => {
      const el = stage(container)
      expect(el?.getAttribute('data-avatar-state')).toBeTruthy()
    })
    // The entrance is followed by a greeting — never a random pose.
    await waitFor(() => {
      const el = stage(container)
      expect(['entering', 'greeting']).toContain(el?.getAttribute('data-avatar-state'))
    }, { timeout: 3000 })
  })

  it('listens while the shopper types and reacts to the message they send', async () => {
    const { container } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })

    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '700' } })
    await waitFor(() => expect(stage(container)?.getAttribute('data-avatar-state')).toBe('listening'))

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })
    await waitFor(() => {
      const state = stage(container)?.getAttribute('data-avatar-state')
      expect(['thinking', 'typing', 'negotiating', 'calculating']).toContain(state)
    }, { timeout: 3000 })
  })

  it('moves the character to the recommendation area when verified cards arrive', async () => {
    stubFetch({
      offer: {
        recommendations: [{
          productId: 'gid://shopify/Product/77',
          variantId: 'gid://shopify/ProductVariant/88',
          title: 'Better Runner',
          price: 799,
          currency: 'INR',
          imageUrl: null,
          productUrl: 'https://example.myshopify.com/products/better-runner',
          available: true,
          onSale: false,
          budgetFit: 'under',
          tags: [],
          reason: 'Closer to your budget',
        }],
      },
    })
    const { container } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })

    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '700' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    await waitFor(() => {
      expect(stage(container)?.getAttribute('data-avatar-position')).toBe('recommendation')
    }, { timeout: 3000 })
  })

  it('celebrates only after the backend confirms the deal', async () => {
    const { container } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })

    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '700' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })
    await waitFor(() => expect(screen.getAllByText('I can do 850 for you.').length).toBeGreaterThan(0), { timeout: 3000 })

    const accept = screen.getByRole('button', { name: /Accept/ })
    fireEvent.click(accept)

    await waitFor(() => {
      expect(stage(container)?.getAttribute('data-avatar-state')).toBe('celebrating')
      expect(stage(container)?.getAttribute('data-avatar-position')).toBe('celebration')
    }, { timeout: 3000 })
  })

  it('never celebrates when the backend refuses the deal', async () => {
    stubFetch({ acceptOk: false })
    const { container } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })

    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '700' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })
    await waitFor(() => expect(screen.getAllByText('I can do 850 for you.').length).toBeGreaterThan(0), { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Accept/ }))
    await waitFor(() => {
      expect(stage(container)?.getAttribute('data-avatar-state')).toBe('disappointed')
    }, { timeout: 3000 })
    expect(stage(container)?.getAttribute('data-avatar-state')).not.toBe('celebrating')
  })

  it('guides the shopper to checkout when checkout opens', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null)
    stubFetch({
      offer: {
        reply: 'That is the last I can do.',
        decision: 'reject',
        sessionStatus: 'rejected',
        discountCode: 'BARGAIN-TEST',
        finalPrice: 700,
        purchaseUrl: 'https://shop.example/discount/BARGAIN-TEST',
      },
    })
    const { container } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })

    const input = screen.getByLabelText('Ask about this product or make an offer…')
    fireEvent.change(input, { target: { value: '600' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 })
    await waitFor(() => expect(screen.getByText('Checkout at your price')).toBeTruthy(), { timeout: 3000 })

    fireEvent.click(screen.getByText('Checkout at your price'))
    await waitFor(() => {
      expect(stage(container)?.getAttribute('data-avatar-state')).toBe('guiding_to_checkout')
    }, { timeout: 3000 })
    openSpy.mockRestore()
  })

  it('keeps each shopper instance isolated', async () => {
    const { container: first } = render(<BargainWidget {...baseProps} experience={experience} />)
    const { container: second } = render(<BargainWidget {...baseProps} experience={experience} />)
    await waitFor(() => expect(screen.getAllByLabelText('Ask about this product or make an offer…').length).toBe(2), { timeout: 3000 })

    const [inputA, inputB] = screen.getAllByLabelText('Ask about this product or make an offer…')
    fireEvent.change(inputA, { target: { value: '700' } })

    await waitFor(() => expect(stage(first)?.getAttribute('data-avatar-state')).toBe('listening'))
    expect(stage(second)?.getAttribute('data-avatar-state')).not.toBe('listening')
  })

  it('honours the merchant avatar switch', async () => {
    const { container } = render(
      <BargainWidget {...baseProps} experience={{ ...experience, avatarEnabled: false }} />,
    )
    await waitFor(() => expect(screen.getByLabelText('Ask about this product or make an offer…')).toBeTruthy(), { timeout: 3000 })
    expect(stage(container)).toBeNull()
  })
})
