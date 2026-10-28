import { rewriteStatedPrice } from '@/lib/services/bargain'

describe('rewriteStatedPrice', () => {
  it('rewrites plain and grouped money figures to the real counter', () => {
    expect(rewriteStatedPrice('How about ₹2,200?', 2200, 2453.5)).toBe('How about ₹2,453.5?')
    expect(rewriteStatedPrice('I can do Rs 2200', 2200, 2453.5)).toBe('I can do Rs 2453.5')
  })

  it('preserves the decimal style used in the reply', () => {
    expect(rewriteStatedPrice('Let us settle at ₹2,200.00.', 2200, 2453.5)).toBe(
      'Let us settle at ₹2,453.50.',
    )
  })

  it('never rewrites a larger number that merely contains the old figure', () => {
    expect(rewriteStatedPrice('The bundle is ₹22,000.', 2200, 2453.5)).toBe(
      'The bundle is ₹22,000.',
    )
  })

  it('is a no-op when the stated price already matches', () => {
    expect(rewriteStatedPrice('₹2,453.50 is fair', 2453.5, 2453.5)).toBe(
      '₹2,453.50 is fair',
    )
  })
})
