/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { fireEvent, render, screen } from '@testing-library/react'
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
    expect(THINKING_DELAY_MS).toBe(20)
    expect(REQUEST_TIMEOUT_MS).toBe(25_000)
    expect(minThinkingMs('hi')).toBe(35)
    expect(minThinkingMs('a'.repeat(200))).toBe(90)
    expect(minThinkingMs('hello')).toBe(35)
    expect(typeof wait).toBe('function')
  })
})

describe('theme controller integration', () => {
  const assets = join(process.cwd(), 'extensions', 'storefront-bargain', 'assets')

  it('opens the drawer from the dwell CTA when only the inline card exists', () => {
    const dwell = readFileSync(join(assets, 'dwell.js'), 'utf8')
    const controller = readFileSync(join(assets, 'bargain.js'), 'utf8')
    expect(dwell).toContain("new CustomEvent('cg_open_drawer_request',{bubbles:true})")
    expect(controller).toContain('document.addEventListener("cg_open_drawer_request"')
    expect(controller).toContain('[data-cg-bargain-root]')
    expect(controller.length).toBeLessThan(10 * 1024)
  })

  it('restores document scroll styles exactly when the drawer closes', () => {
    const controller = readFileSync(join(assets, 'bargain.js'), 'utf8')
    expect(controller).toContain('l.html=document.documentElement.style.overflow')
    expect(controller).toContain('document.documentElement.style.overflow=l.html')
    expect(controller).toContain('window.scrollTo(0,l.y)')
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

  it('keeps the conversation and composer visible without a suggestion panel', () => {
    render(<BargainWidget {...baseProps} />)
    expect(screen.getByRole('textbox', { name: /Ask about this product/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tell me about this product' })).toBeNull()
    expect(screen.queryByRole('button', { name: /what is included/i })).toBeNull()
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
