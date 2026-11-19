/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import BargainRecommendationPanel, { type RecommendationEventAction } from '../BargainRecommendationPanel'
import type { BargainRecommendation } from '@/lib/bargain/api-types'

const cards: BargainRecommendation[] = [
  {
    productId: 'gid://shopify/Product/11',
    variantId: 'gid://shopify/ProductVariant/21',
    title: 'Alpha Runner',
    price: 1499,
    currency: 'INR',
    imageUrl: null,
    productUrl: 'https://example.myshopify.com/products/alpha',
    available: true,
    onSale: false,
    budgetFit: 'under',
    tags: [],
    reason: 'Closer to your budget',
  },
  {
    productId: '22',
    variantId: '32',
    title: 'Beta Tee',
    price: 799,
    compareAtPrice: 999,
    currency: 'INR',
    imageUrl: null,
    productUrl: 'https://example.myshopify.com/products/beta',
    available: true,
    onSale: true,
    budgetFit: 'under',
    tags: [],
    reason: 'Lower price',
  },
  {
    productId: 'gid://shopify/Product/33',
    variantId: '43',
    title: 'Gamma Cap',
    price: 499,
    currency: 'INR',
    imageUrl: null,
    productUrl: null,
    available: false,
    onSale: false,
    budgetFit: 'under',
    tags: [],
    reason: '',
  },
]

const history = {
  entries: [],
  shownProductIds: [],
  clickedProductIds: [],
  addedProductIds: [],
  dismissedProductIds: ['gid://shopify/Product/33'],
  rejectedProductIds: [],
  lastShownProductIds: [],
  lastShownAt: null,
}

beforeEach(() => {
  Object.defineProperty(window, 'open', {
    configurable: true,
    writable: true,
    value: jest.fn(),
  })
})

describe('BargainRecommendationPanel', () => {
  it('stays collapsed, emits viewed once, and hides dismissed/rejected cards', () => {
    const events: { action: RecommendationEventAction; id: string }[] = []
    const onEvent = jest.fn((action: RecommendationEventAction, card: BargainRecommendation) => {
      events.push({ action, id: card.productId })
    })

    render(
      <BargainRecommendationPanel
        recommendations={[cards[0], cards[1], cards[2]]}
        reason="Verified alternatives from this store"
        history={history}
        onEvent={onEvent}
      />,
    )

    expect(screen.getByRole('button', { name: '2 better matches found' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Alpha Runner')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '2 better matches found' }))
    expect(events.filter((event) => event.action === 'viewed')).toHaveLength(2)
    expect(screen.getByText('Alpha Runner')).toBeTruthy()
    expect(screen.getByText('Beta Tee')).toBeTruthy()
    expect(screen.queryByText('Gamma Cap')).toBeNull()
    expect(screen.getByText('Verified alternatives from this store')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('link', { name: /View/ })[0])
    expect(window.open).toHaveBeenCalledWith(cards[0].productUrl, '_blank', 'noopener')
    expect(events.filter((event) => event.action === 'clicked')).toEqual([{ action: 'clicked', id: cards[0].productId }])

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    expect(events.filter((event) => event.action === 'added')).toEqual([{ action: 'added', id: cards[0].productId }])

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Alpha Runner' }))
    expect(screen.getByRole('button', { name: '1 better matches found' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Not for me' }))
    expect(screen.queryByRole('button', { name: /better matches found/ })).toBeNull()
    expect(events.filter((event) => event.action === 'rejected')).toEqual([{ action: 'rejected', id: cards[1].productId }])
  })

  it('localizes the toggle, group label, and row actions', () => {
    render(<BargainRecommendationPanel recommendations={[cards[0]]} language="hi" />)
    expect(screen.getByRole('group', { name: 'सुझाए गए विकल्प' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '1 बेहतर विकल्प मिले' }))
    expect(screen.getAllByRole('link', { name: /देखें/ })[0]).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'जोड़ें' })[0]).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'मेरे लिए नहीं' })[0]).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Alpha Runner हटाएँ' })).toBeTruthy()
  })

  it('deduplicates product ids across gid and numeric forms', () => {
    const duplicate = { ...cards[0], productId: '11', title: 'Duplicate' }
    render(<BargainRecommendationPanel recommendations={[cards[0], duplicate]} />)
    fireEvent.click(screen.getByRole('button', { name: '1 better matches found' }))
    expect(screen.getByText('Alpha Runner')).toBeTruthy()
    expect(screen.queryByText('Duplicate')).toBeNull()
  })

  it('is a labelled group, caps expanded cards at two, and bounds their height', () => {
    const fourth = { ...cards[0], productId: '44', title: 'Delta Cap' }
    const { container } = render(
      <BargainRecommendationPanel
        recommendations={[cards[0], cards[1], cards[2], fourth]}
        ariaLabel="Suggested alternatives"
      />,
    )
    const group = screen.getByRole('group', { name: 'Suggested alternatives' })
    expect(group.getAttribute('data-cg-recommendation-panel')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '2 better matches found' }))
    const list = container.querySelector('[data-cg-recommendation-panel] > div:last-child') as HTMLElement
    expect(list.style.maxHeight).toBe('min(180px, 28dvh)')
    expect(screen.getByText('Alpha Runner')).toBeTruthy()
    expect(screen.getByText('Beta Tee')).toBeTruthy()
    expect(screen.queryByText('Delta Cap')).toBeNull()
  })

  it('uses 40px touch targets for every expanded action', () => {
    const { container } = render(<BargainRecommendationPanel recommendations={[cards[0]]} />)
    fireEvent.click(screen.getByRole('button', { name: '1 better matches found' }))
    const controls = Array.from(container.querySelectorAll('[data-cg-recommendation-panel] a, [data-cg-recommendation-panel] button'))
    expect(controls.length).toBe(5)
    for (const control of controls) {
      const height = parseInt((control as HTMLElement).style.minHeight, 10)
      expect(height).toBeGreaterThanOrEqual(40)
      expect(height).toBeLessThanOrEqual(44)
    }
  })

  it('never emits duplicate viewed or clicked events across repeated expansion', () => {
    const onEvent = jest.fn()
    render(<BargainRecommendationPanel recommendations={[cards[0]]} onEvent={onEvent} />)
    const toggle = screen.getByRole('button', { name: '1 better matches found' })
    fireEvent.click(toggle)
    fireEvent.click(screen.getAllByRole('link', { name: /View/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '1 better matches found' }))
    fireEvent.click(screen.getByRole('button', { name: '1 better matches found' }))
    fireEvent.click(screen.getAllByRole('link', { name: /View/ })[0])
    expect(onEvent.mock.calls.filter(([action]) => action === 'viewed')).toHaveLength(1)
    expect(onEvent.mock.calls.filter(([action]) => action === 'clicked')).toHaveLength(1)
  })
})
