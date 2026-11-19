/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
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

describe('StorefrontInvitation localization', () => {
  it('uses localized default copy and CTA when no custom copy is published', () => {
    render(<StorefrontInvitation experience={DEFAULT_BARGAIN_EXPERIENCE} language="hi" onOpen={() => {}} />)
    expect(screen.getByText('क्या आपके पास कोई कीमत है? 💬 बात करते हैं।')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ऑफ़र करें' })).toBeTruthy()
  })

  it('keeps English defaults for unknown languages', () => {
    render(<StorefrontInvitation experience={DEFAULT_BARGAIN_EXPERIENCE} language="kn" onOpen={() => {}} />)
    expect(screen.getByText("Got a price in mind? 💬 Let's talk.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make an offer' })).toBeTruthy()
  })

  it('localizes every design variant', () => {
    const { unmount } = render(
      <StorefrontInvitation
        experience={{ ...DEFAULT_BARGAIN_EXPERIENCE, designVariant: 'playful-bargain-club' }}
        language="hinglish"
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('Kya aap is price ko har sakte hain? 😏')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Price ko challenge karein' })).toBeTruthy()
    unmount()

    render(
      <StorefrontInvitation
        experience={{ ...DEFAULT_BARGAIN_EXPERIENCE, designVariant: 'human-shopkeeper' }}
        language="hi"
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('भाई, कीमत की बात करें? 😄')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'सौदेबाज़ी करें' })).toBeTruthy()
  })

  it('lets the merchant override the localized defaults', () => {
    render(
      <StorefrontInvitation
        experience={{
          ...DEFAULT_BARGAIN_EXPERIENCE,
          designVariant: 'unlock-your-deal',
          customGreeting: 'My own greeting',
          ctaLabel: 'Grab it',
        }}
        language="hi"
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('My own greeting')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grab it' })).toBeTruthy()
  })
})
