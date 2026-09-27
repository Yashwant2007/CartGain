/**
 * @jest-environment jsdom
 *
 * Regression tests for the "correctly sized but blank" storefront drawer.
 *
 * The bug: in `view=drawer` the widget root was `height: '100%'` while the
 * embed document's <html>/<body> are auto-height. Every child of that root is
 * either absolutely positioned or screen-reader-only, so the root collapsed to
 * 0px. The iframe was still full size (the theme controller sizes the drawer),
 * which is exactly the reported symptom: correct size, no content.
 *
 * These tests pin the two halves of the fix:
 *   1. the drawer root fills the viewport instead of a percentage chain, and
 *   2. the widget says hello so the theme controller can retire its skeleton.
 */
import { render, act } from '@testing-library/react'
import BargainWidget from '@/components/bargain/BargainWidget'

// jsdom ships no matchMedia; the widget probes it for pointer/reduced-motion.
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

// These assertions are about layout + the cross-frame handshake only, so the
// session API is stubbed out and never hits the network.
beforeEach(() => {
  global.fetch = jest.fn(async () =>
    new Response(JSON.stringify({ error: 'stubbed' }), { status: 503 }),
  ) as unknown as typeof fetch
})

function rootEl(): HTMLElement {
  const el = document.querySelector('.bargain-widget-root') as HTMLElement | null
  if (!el) throw new Error('widget root not rendered')
  return el
}

const baseProps = {
  storeId: 'test-store',
  shopifyProductId: 'gid://shopify/Product/1',
  variantId: 'gid://shopify/ProductVariant/2',
  originalPrice: 999,
  cartToken: 'test-cart-token',
  maxAttempts: 4,
  embedded: true,
} as const

describe('BargainWidget drawer mode (view=drawer)', () => {
  it('fills the viewport with fixed positioning, never a percentage height', () => {
    render(<BargainWidget {...baseProps} view="drawer" />)
    const style = rootEl().style
    expect(style.position).toBe('fixed')
    expect(style.top).toBe('0px')
    expect(style.right).toBe('0px')
    expect(style.bottom).toBe('0px')
    expect(style.left).toBe('0px')
    // The regression itself: a percentage height here collapses to 0 because
    // the embed document has no fixed-height ancestor.
    expect(style.height).toBe('')
  })

  it('keeps an explicit pixel height in inline mode', () => {
    render(<BargainWidget {...baseProps} view="inline" />)
    expect(rootEl().style.height).not.toBe('')
  })

  it('posts cg_hello to the parent so the controller can hide its skeleton', async () => {
    const postMessage = jest.fn()
    // The controller document is the parent; stub the frame's parent handle.
    Object.defineProperty(window, 'parent', {
      value: { postMessage },
      configurable: true,
      writable: true,
    })

    render(<BargainWidget {...baseProps} view="drawer" />)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })

    expect(postMessage).toHaveBeenCalledWith({ type: 'cg_hello' }, '*')
  })

  it('never announces cg_resize in drawer mode (stale controllers must not shrink it)', async () => {
    const postMessage = jest.fn()
    Object.defineProperty(window, 'parent', {
      value: { postMessage },
      configurable: true,
      writable: true,
    })

    render(<BargainWidget {...baseProps} view="drawer" />)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    const types = postMessage.mock.calls.map((c) => (c[0] as { type?: string })?.type)
    expect(types).toContain('cg_hello')
    expect(types).not.toContain('cg_resize')
  })
})
