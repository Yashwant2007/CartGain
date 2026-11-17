import { logReference } from '../logging'

describe('logReference', () => {
  it('never returns the raw token', () => {
    const token = 'checkout-secret-token-value'
    const reference = logReference(token)
    expect(reference).not.toContain(token)
    expect(reference).toHaveLength(12)
  })

  it('is stable for correlation and different for different tokens', () => {
    expect(logReference('cart-a')).toBe(logReference('cart-a'))
    expect(logReference('cart-a')).not.toBe(logReference('cart-b'))
  })

  it('handles missing values', () => {
    expect(logReference(null)).toBe('unknown')
    expect(logReference(undefined)).toBe('unknown')
  })
})
