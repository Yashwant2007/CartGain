/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('@/components/bargain/ShopkeeperStage', () => ({
  __esModule: true,
  default: (props: { reaction?: string | null }) => {
    const React = require('react')
    return React.createElement('div', { 'data-testid': 'shopkeeper-stage', 'data-reaction': props.reaction ?? '' })
  },
}))

import HeroNegotiationDemo from '../HeroNegotiationDemo'

describe('HeroNegotiationDemo', () => {
  const originalFetch = global.fetch

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
})
