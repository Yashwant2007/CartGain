import { subscriptionStatusApiPath } from '../return-url'

describe('subscriptionStatusApiPath', () => {
  it('forwards the billing return marker to trigger authoritative reconciliation', () => {
    expect(subscriptionStatusApiPath('?billing=success&shop=store.myshopify.com'))
      .toBe('/api/subscription?billing=success')
  })

  it('does not forward arbitrary query parameters as billing authority', () => {
    expect(subscriptionStatusApiPath('?billing=cancelled&shop=attacker.myshopify.com'))
      .toBe('/api/subscription')
    expect(subscriptionStatusApiPath('?shop=attacker.myshopify.com'))
      .toBe('/api/subscription')
  })
})
