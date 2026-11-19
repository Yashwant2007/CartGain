import { assertSessionOwnership, sessionIdFromToken, signSessionToken, verifySessionToken } from '@/lib/bargain/session-bind'

describe('session ownership proof', () => {
  it('rejects email and phone as ownership proof', () => {
    const result = assertSessionOwnership(
      { customerFingerprint: null, customerEmail: 'buyer@example.com', cartToken: null },
      { customerEmail: 'buyer@example.com', customerPhone: '+911234567890' },
    )
    expect(result.ok).toBe(false)
  })

  it('accepts a device fingerprint match', () => {
    expect(assertSessionOwnership(
      { customerFingerprint: 'fp-12345678', customerEmail: 'buyer@example.com', cartToken: null },
      { customerFingerprint: 'fp-12345678' },
    ).ok).toBe(true)
  })

  it('accepts a Shopify cart token match', () => {
    expect(assertSessionOwnership(
      { customerFingerprint: null, customerEmail: 'buyer@example.com', cartToken: 'cart-1' },
      { cartToken: 'cart-1' },
    ).ok).toBe(true)
  })

  it('accepts a signed session token for a bound session', () => {
    const token = signSessionToken('sess-1')!
    expect(assertSessionOwnership(
      { customerFingerprint: 'fp-12345678', customerEmail: null, cartToken: null },
      { tokenOk: verifySessionToken('sess-1', token) },
    ).ok).toBe(true)
  })

  it('accepts a signed session token for an anonymous session', () => {
    expect(assertSessionOwnership(
      { customerFingerprint: null, customerEmail: null, cartToken: null },
      { tokenOk: true },
    ).ok).toBe(true)
  })

  it('recovers the bound session id only from a valid token', () => {
    expect(sessionIdFromToken(signSessionToken('sess-1'))).toBe('sess-1')
    expect(sessionIdFromToken('garbage')).toBeNull()
    expect(sessionIdFromToken(null)).toBeNull()
  })
})
