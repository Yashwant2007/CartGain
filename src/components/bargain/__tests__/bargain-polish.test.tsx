/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import BargainWidget from '@/components/bargain/BargainWidget'
import {
  minThinkingMs,
  REQUEST_TIMEOUT_MS,
  THINKING_DELAY_MS,
  TICK_MS,
  wait,
} from '@/components/bargain/conversation-utils'

const baseProps = {
  storeId: 'test-store',
  shopifyProductId: 'gid://shopify/Product/1',
  variantId: 'gid://shopify/ProductVariant/2',
  originalPrice: 999,
  cartToken: 'test-cart-token',
  embedded: true,
  view: 'inline',
} as const

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
})

describe('shared conversation rhythm', () => {
  it('pins the timing values used by every widget', () => {
    expect(TICK_MS).toBe(100)
    expect(THINKING_DELAY_MS).toBe(60)
    expect(REQUEST_TIMEOUT_MS).toBe(25_000)
    expect(minThinkingMs('hi')).toBe(90)
    expect(minThinkingMs('a'.repeat(200))).toBe(220)
    expect(minThinkingMs('hello')).toBe(90)
    expect(typeof wait).toBe('function')
  })
})

describe('BargainWidget compact chrome', () => {
  it('gives both tabs a 40px touch target and marks the private note for hiding', () => {
    const { container } = render(<BargainWidget {...baseProps} />)
    for (const name of ['Chat', 'Deal']) {
      const tab = screen.getByRole('button', { name }) as HTMLElement
      expect(parseInt(tab.style.minHeight, 10)).toBeGreaterThanOrEqual(40)
    }
    const css = Array.from(container.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n')
    expect(container.querySelector('.cg-private-note')).toBeTruthy()
    expect(css).toContain('.cartgain-bargain .cg-private-note { display: none }')
  })

  it('keeps the jump control in normal flow instead of overlapping the transcript', () => {
    const { container } = render(<BargainWidget {...baseProps} />)
    const html = container.innerHTML
    expect(html).not.toContain('-34px')
    const css = Array.from(container.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n')
    expect(css).not.toContain('margin: -34px')
  })
})
