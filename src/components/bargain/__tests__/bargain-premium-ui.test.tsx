/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import BargainOfferSummary from '@/components/bargain/BargainOfferSummary'

describe('BargainOfferSummary', () => {
  it('shows real values only before a counter exists', () => {
    render(
      <BargainOfferSummary
        originalPrice={999}
        finalPrice={null}
        lastCounter={null}
        customerOffer={null}
        round={{ used: 0, max: 3 }}
        currencySymbol="₹"
        decision="idle"
        productTitle="Denim Jacket"
      />,
    )
    expect(screen.getByText('Deal at a glance')).toBeTruthy()
    expect(screen.getByText('Listed:')).toBeTruthy()
    expect(screen.getByText('Denim Jacket')).toBeTruthy()
    expect(screen.getByText('Name your price or ask a question')).toBeTruthy()
    expect(screen.queryByText('₹0')).toBeNull()
  })

  it('labels both sides and the live round without inventing a floor', () => {
    render(
      <BargainOfferSummary
        originalPrice={999}
        finalPrice={null}
        lastCounter={850}
        customerOffer={700}
        round={{ used: 2, max: 3 }}
        currencySymbol="₹"
        decision="counter"
      />,
    )
    expect(screen.getByText('Round 2 of 3')).toBeTruthy()
    expect(screen.getByText('You offered')).toBeTruthy()
    expect(screen.getByText('Counter offer')).toBeTruthy()
    expect(screen.getByText('₹850')).toBeTruthy()
    expect(screen.getByText('₹149 · 15%')).toBeTruthy()
    expect(screen.queryByText(/floor/i)).toBeNull()
  })

  it('switches to the agreed final price once the backend accepts', () => {
    render(
      <BargainOfferSummary
        originalPrice={999}
        finalPrice={800}
        lastCounter={850}
        customerOffer={700}
        round={{ used: 3, max: 3 }}
        currencySymbol="₹"
        decision="accept"
        discountCode="SAVE800"
      />,
    )
    expect(screen.getByText('Deal agreed')).toBeTruthy()
    expect(screen.getByText('Your final price')).toBeTruthy()
    expect(screen.getByText('₹800')).toBeTruthy()
    expect(screen.getByText('SAVE800')).toBeTruthy()
    expect(screen.getByText('Last round')).toBeTruthy()
  })
})
