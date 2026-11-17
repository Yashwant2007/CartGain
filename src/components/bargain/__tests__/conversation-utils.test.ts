/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { createConversationId, useConversationAutoScroll } from '../conversation-utils'

beforeAll(() => {
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

function scrollElement(): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperties(el, {
    scrollHeight: { configurable: true, value: 200 },
    clientHeight: { configurable: true, value: 100 },
    scrollTop: { configurable: true, writable: true, value: 0 },
  })
  return el
}

describe('createConversationId', () => {
  it('returns unique prefixed ids', () => {
    const a = createConversationId('c')
    const b = createConversationId('c')
    expect(a).toMatch(/^c-/)
    expect(b).toMatch(/^c-/)
    expect(a).not.toBe(b)
  })
})

describe('useConversationAutoScroll', () => {
  it('scrolls to the latest message at the bottom, suppresses while scrolled up, and forces on send/jump', () => {
    const el = scrollElement()
    const ref = { current: el }
    const { result, rerender } = renderHook(
      ({ count }) => useConversationAutoScroll({ scrollRef: ref, messageCount: count }),
      { initialProps: { count: 1 } },
    )
    expect(el.scrollTop).toBe(200)

    el.scrollTop = 0
    act(() => {
      result.current.handleScroll({ currentTarget: el } as Parameters<typeof result.current.handleScroll>[0])
    })
    rerender({ count: 2 })
    expect(result.current.unread).toBe(1)
    expect(el.scrollTop).toBe(0)

    act(() => {
      result.current.jumpToLatest()
    })
    expect(el.scrollTop).toBe(200)
    expect(result.current.unread).toBe(0)

    el.scrollTop = 0
    act(() => {
      result.current.handleScroll({ currentTarget: el } as Parameters<typeof result.current.handleScroll>[0])
    })
    act(() => {
      result.current.noteSent()
    })
    expect(el.scrollTop).toBe(200)
  })
})
