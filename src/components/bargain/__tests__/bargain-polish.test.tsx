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

  it('acks the drawer handoff and retires the dwell nudge on that ack', () => {
    const assets = join(process.cwd(), 'extensions', 'storefront-bargain', 'assets')
    const controller = readFileSync(join(assets, 'bargain.js'), 'utf8')
    const dwell = readFileSync(join(assets, 'dwell.js'), 'utf8')
    expect(controller).toContain('postMessage({type:"cg_drawer_opened"}')
    expect(controller).toContain('new CustomEvent("cg_drawer_opened"')
    expect(dwell).toContain("document.addEventListener('cg_drawer_opened'")
  })

  it('passes a validated parent origin from every Shopify entry point', () => {
    const blocks = join(process.cwd(), 'extensions', 'storefront-bargain', 'blocks')
    for (const file of ['product-bargain.liquid', 'cart-bargain.liquid', 'bargain-embed.liquid']) {
      const liquid = readFileSync(join(blocks, file), 'utf8')
      expect(liquid).toContain("'&parentOrigin='")
      expect(liquid).toContain('cg_parent_origin')
    }
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

  it('keeps only conversational prompts and prefills without sending the message', () => {
    render(<BargainWidget {...baseProps} />)
    const input = screen.getByRole('textbox', { name: /Ask about this product/i }) as HTMLInputElement
    expect(screen.queryByRole('button', { name: /Make offer ·/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tell me about this product' }))
    expect(input.value).toBe('Tell me about this product')
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
  })

  it('uses the wider storefront drawer and compact panel sizing', () => {
    const { container } = render(<BargainWidget {...baseProps} />)
    const css = Array.from(container.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n')
    expect(css).toContain('width: clamp(440px, 44vw, 560px);')
    const drawerCss = readFileSync(join(process.cwd(), 'extensions', 'storefront-bargain', 'assets', 'bargain.css'), 'utf8')
    expect(drawerCss).toContain('width: min(560px, 94vw);')
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
