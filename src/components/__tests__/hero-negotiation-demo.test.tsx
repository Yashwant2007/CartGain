/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('@/components/bargain/ShopkeeperStage', () => ({
  __esModule: true,
  default: (props: { reaction?: string | null; avatarVariant?: string; name?: string }) => {
    const React = require('react')
    return React.createElement('div', {
      'data-testid': 'shopkeeper-stage',
      'data-reaction': props.reaction ?? '',
      'data-avatar-variant': props.avatarVariant ?? '',
      'data-name': props.name ?? '',
    })
  },
}))

import HeroNegotiationDemo from '../HeroNegotiationDemo'

describe('HeroNegotiationDemo', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('shows the sample product pricing and only labels real bids as offers', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'It is a gentle vitamin C serum for daily use.',
        decision: 'chat',
        counterOffer: null,
        offer: null,
        offerDetected: false,
        attemptsUsed: 1,
        conversationState: 'NEGOTIATING',
      }),
    } as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const { container } = render(<HeroNegotiationDemo />)
    expect(screen.getAllByText('₹1,499').length).toBeGreaterThan(0)
    expect(screen.getAllByText('₹1,299').length).toBeGreaterThan(0)
    expect(screen.getAllByText('₹1,100').length).toBeGreaterThan(0)
    expect(screen.getByTestId('shopkeeper-stage')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ask a question or name your price'), {
      target: { value: 'What makes this serum special?' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('It is a gentle vitamin C serum for daily use.', {}, { timeout: 2000 })).toBeTruthy()
    expect(container.textContent).not.toContain('Offer ₹')
    expect(fetchMock).toHaveBeenCalledWith('/api/bargain/home-demo', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps the live avatar reacting to shopper words without a manual reaction sheet', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'I understand.',
        decision: 'chat',
        counterOffer: null,
        offer: null,
        offerDetected: false,
        attemptsUsed: 1,
        conversationState: 'NEGOTIATING',
      }),
    } as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    render(<HeroNegotiationDemo />)
    const stage = screen.getByTestId('shopkeeper-stage')
    expect(stage.getAttribute('data-avatar-variant')).toBe('morgan')
    expect(screen.queryByLabelText(/Preview .* reaction/)).toBeNull()
    expect(screen.queryByText(/reaction sheet/i)).toBeNull()

    fireEvent.click(screen.getByLabelText('Preview Alex'))
    expect(stage.getAttribute('data-avatar-variant')).toBe('alex')
    expect(stage.getAttribute('data-name')).toBe('Alex')

    fireEvent.change(screen.getByLabelText('Ask a question or name your price'), {
      target: { value: 'This is such a scam.' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('I understand.', {}, { timeout: 2000 })).toBeTruthy()
    expect(stage.getAttribute('data-reaction')).toBe('rude')
  })

  it('keeps the real engine for the first bid, then caps anonymous bidding with a Live Demo signup CTA', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'I can do ₹1,250.',
        decision: 'counter',
        counterOffer: 1250,
        offer: 999,
        offerDetected: true,
        attemptsUsed: 1,
        conversationState: 'NEGOTIATING',
      }),
    } as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    render(<HeroNegotiationDemo />)

    fireEvent.change(screen.getByLabelText('Ask a question or name your price'), {
      target: { value: '₹999 please' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('I can do ₹1,250.', {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.queryByText(/used your free homepage round/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Ask a question or name your price'), {
      target: { value: '₹1,050 please' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText(/open the Live Demo to keep negotiating/, {}, { timeout: 2000 })).toBeTruthy()
    expect(screen.getAllByText(/used your free homepage round/).length).toBeGreaterThan(0)
    expect(screen.getByText('Sign up for Live Demo').closest('a')?.getAttribute('href')).toBe('/signup?next=/s/bargain')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
