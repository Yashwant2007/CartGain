/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import StorefrontInvitation from '../StorefrontInvitation'
import { DEFAULT_BARGAIN_EXPERIENCE } from '@/lib/bargain/experience/types'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('StorefrontInvitation', () => {
  it('uses localized premium copy, CTA and value indicators', () => {
    render(<StorefrontInvitation experience={DEFAULT_BARGAIN_EXPERIENCE} language="hi" onOpen={() => {}} showAvatar={false} />)
    expect(screen.getByText('क्या आपके पास कोई कीमत है?')).toBeTruthy()
    expect(screen.getByText('बात करके बेहतर सौदा करते हैं! 🚀')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ऑफ़र करें' })).toBeTruthy()
    expect(screen.getByText('⚡ त्वरित जवाब')).toBeTruthy()
    expect(screen.getByText('🛡 बिना दबाव')).toBeTruthy()
    expect(screen.getByText('🤝 स्मार्ट सौदे')).toBeTruthy()
  })

  it('keeps English premium defaults for unknown languages', () => {
    const { container } = render(<StorefrontInvitation experience={DEFAULT_BARGAIN_EXPERIENCE} language="kn" onOpen={() => {}} showAvatar={false} />)
    expect(container.querySelector('.cg-premium-invite-title')?.textContent).toBe('Got a price in mind?')
    expect(screen.getByText("Let's chat and make a better deal! 🚀")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make an offer' })).toBeTruthy()
    expect(screen.getByText('⚡ Quick Reply')).toBeTruthy()
    expect(screen.getByText('🛡 No Pressure')).toBeTruthy()
    expect(screen.getByText('🤝 Smart Deals')).toBeTruthy()
  })

  it('renders the merchant-selected avatar pointing at the CTA and guards double opens', () => {
    const onOpen = jest.fn()
    const { container } = render(
      <StorefrontInvitation
        experience={{ ...DEFAULT_BARGAIN_EXPERIENCE, avatarVariant: 'morgan' }}
        onOpen={onOpen}
        showAvatar
      />,
    )
    expect(container.querySelector('[data-avatar-state="pointing"]')).toBeTruthy()
    expect(container.querySelector('[data-gesture="point"]')).toBeTruthy()
    expect(container.querySelector('.cg-premium-invite-highlight')?.textContent).toBe('price')
    expect(container.querySelector('.cg-premium-invite-sparkle')).toBeTruthy()
    const card = screen.getByRole('button', { name: 'Make an offer' })
    fireEvent.click(card)
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('lets the merchant override copy and hide optional chrome', () => {
    const { container } = render(
      <StorefrontInvitation
        experience={{
          ...DEFAULT_BARGAIN_EXPERIENCE,
          invitationHeadline: 'Your own headline',
          invitationSubtitle: 'Your own subtitle',
          ctaLabel: 'Grab it',
          invitationSparkleVisible: false,
          invitationIndicators: { quickReply: false, noPressure: false, smartDeals: false },
        }}
        language="hi"
        onOpen={() => {}}
        showAvatar={false}
      />,
    )
    expect(screen.getByText('Your own headline')).toBeTruthy()
    expect(screen.getByText('Your own subtitle')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grab it' })).toBeTruthy()
    expect(container.querySelector('.cg-premium-invite-sparkle')).toBeNull()
    expect(screen.queryByText('⚡ Quick Reply')).toBeNull()
  })
})
