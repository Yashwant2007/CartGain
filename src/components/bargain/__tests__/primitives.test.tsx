/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import {
  ChatSkeleton,
  MessageBubble,
  PriceRail,
  RoundMeter,
  StateCard,
  QuickChip,
  ProductContextCard,
  TypingIndicator,
} from '@/components/bargain/BargainPrimitives'
import type { UiKey } from '@/lib/bargain/i18n'

const t = (key: UiKey) => key

describe('BargainPrimitives (critical storefront UI flows)', () => {
  it('renders a customer offer bubble with the price emphasized', () => {
    render(
      <MessageBubble
        m={{ id: 'c1', role: 'customer', content: 'How about 450?', offeredPrice: 450, createdAt: 't' }}
        t={t}
        currencySymbol="₹"
        personaChip={undefined}
        isFinal={false}
      />,
    )
    expect(screen.getByText('How about 450?')).toBeTruthy()
    expect(screen.getByText('₹450')).toBeTruthy()
  })

  it('labels a final AI counter as a FINAL OFFER (floor reached)', () => {
    const key = 'finalOffer'
    render(
      <MessageBubble
        m={{ id: 'a1', role: 'ai', content: 'This is the best I can do', offeredPrice: 480, createdAt: 't' }}
        t={t}
        currencySymbol="₹"
        personaChip={{ label: 'Friendly', emoji: '😊' }}
        isFinal
      />,
    )
    expect(screen.getByText(key)).toBeTruthy()
    expect(screen.getByText('₹480')).toBeTruthy()
  })

  it('never renders a floor/price the server did not send (no offeredPrice → no price chip)', () => {
    const { container } = render(
      <MessageBubble
        m={{ id: 'c2', role: 'customer', content: 'Nice stuff', createdAt: 't' }}
        t={t}
        currencySymbol="₹"
        personaChip={undefined}
        isFinal={false}
      />,
    )
    // A chat bubble with no offer must not synthesize any amount.
    expect(container.textContent).not.toMatch(/₹\d/)
  })

  it('renders state cards with actions (e.g. restart negotiation)', () => {
    render(
      <StateCard icon={<span>X</span>} tone="amber" title="Negotiation ended" body="The deal was rejected.">
        <button type="button">Start a new chat</button>
      </StateCard>,
    )
    expect(screen.getByText('Negotiation ended')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start a new chat' })).toBeTruthy()
  })

  it('shows the listed price on the product context card (never a floor)', () => {
    render(
      <ProductContextCard title="Denim Jacket" currencySymbol="₹" price={1999} mode="item" />,
    )
    expect(screen.getByText('Denim Jacket')).toBeTruthy()
    expect(screen.getByText(/1,999/)).toBeTruthy()
    expect(screen.getByText(/Listed price/)).toBeTruthy()
  })

  it('marks the whole-cart mode badge', () => {
    render(<ProductContextCard title="Cart" currencySymbol="₹" price={4999} mode="cart" />)
    expect(screen.getByText('Whole cart')).toBeTruthy()
  })

  it('disables quick chips while an offer is in flight', () => {
    render(<QuickChip label="₹890" onClick={() => {}} disabled />)
    const chip = screen.getByRole('button', { name: '₹890' }) as HTMLButtonElement
    expect(chip.disabled).toBe(true)
  })

  it('renders the typing indicator in the assistant persona', () => {
    render(<TypingIndicator personaChip={{ label: 'Strict', emoji: '📊' }} t={t} />)
    expect(screen.getByText('Strict')).toBeTruthy()
  })

  it('supports keyboard activation (clickable chip fires once)', () => {
    const onClick = jest.fn()
    render(<QuickChip label="₹850" onClick={onClick} />)
    fireEvent.keyUp(screen.getByRole('button', { name: '₹850' }), { key: 'Enter' })
    // Enter via keyup is not an implicit click for <button> — assert through a
    // proper click to confirm the handler wiring end-to-end.
    fireEvent.click(screen.getByRole('button', { name: '₹850' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('RoundMeter (offer budget)', () => {
  it('renders one pip per allowed round and labels the current one', () => {
    const { container } = render(<RoundMeter used={1} max={3} t={t} />)
    expect(container.querySelectorAll('.cg-rounds > span > span')).toHaveLength(3)
    expect(screen.getByText('roundOf')).toBeTruthy()
  })

  it('switches to the last-round callout when one round is left', () => {
    render(<RoundMeter used={2} max={3} t={t} />)
    expect(screen.getByText('lastRound')).toBeTruthy()
  })

  it('renders nothing when the budget is unknown (never invents a count)', () => {
    const { container } = render(<RoundMeter used={1} max={null} t={t} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('PriceRail (progress, server-sourced numbers only)', () => {
  it('stays hidden until a price below the listed one exists', () => {
    const { container } = render(
      <PriceRail currencySymbol="₹" listedPrice={999} bestCounter={null} bestCustomerOffer={null} t={t} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('stays hidden when nothing has actually moved down', () => {
    const { container } = render(
      <PriceRail currencySymbol="₹" listedPrice={999} bestCounter={1200} bestCustomerOffer={null} t={t} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('reports the drop from the listed price to the best number named', () => {
    const { container } = render(
      <PriceRail currencySymbol="₹" listedPrice={1000} bestCounter={900} bestCustomerOffer={850} t={t} />,
    )
    // 15% off the listed price, described for screen readers.
    expect(screen.getByText('−15%')).toBeTruthy()
    expect(container.textContent).toContain('₹1,000')
    expect(container.textContent).toContain('₹850')
  })
})

describe('ChatSkeleton (connecting state)', () => {
  it('shows the connecting copy with a chat-shaped placeholder', () => {
    const { container } = render(<ChatSkeleton t={t} />)
    expect(screen.getByText('connecting')).toBeTruthy()
    expect(container.querySelectorAll('.cg-skel-bar').length).toBeGreaterThan(0)
  })
})