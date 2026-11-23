/**
 * @jest-environment jsdom
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import GoogleAnalytics, { GA_MEASUREMENT_ID } from '@/components/GoogleAnalytics'

const mockUsePathname = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

jest.mock('next/script', () => ({
  __esModule: true,
  default: function MockScript({ onLoad, ...props }: { onLoad?: () => void }) {
    React.useEffect(() => {
      onLoad?.()
    }, [onLoad])
    return React.createElement('script', props)
  },
}))

describe('GoogleAnalytics', () => {
  afterEach(() => {
    cleanup()
    mockUsePathname.mockReset()
  })

  it('loads analytics and sends a page view for public pages', async () => {
    mockUsePathname.mockReturnValue('/')
    const gtag = jest.fn()
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true, writable: true })

    const { container } = render(<GoogleAnalytics />)

    expect(container.innerHTML).toContain('googletagmanager.com/gtag/js?id=G-K6JRGC3MMC')
    expect(container.innerHTML).toContain(GA_MEASUREMENT_ID)
    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith(
        'event',
        'page_view',
        expect.objectContaining({ page_path: '/', page_title: document.title }),
      )
    })
  })

  it('does not load analytics on embedded or private routes', () => {
    mockUsePathname.mockReturnValue('/bargain/embed')
    const gtag = jest.fn()
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true, writable: true })

    const { container } = render(<GoogleAnalytics />)

    expect(container.firstChild).toBeNull()
    expect(gtag).not.toHaveBeenCalled()
  })
})
