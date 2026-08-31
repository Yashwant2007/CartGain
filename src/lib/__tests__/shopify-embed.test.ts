import {
  shouldFallbackToTopOutcome,
  googleAuthErrorMessage,
} from '../shopify-embed'

describe('shouldFallbackToTopOutcome', () => {
  it('flags cross-site-cookie-sensitive OAuth failures for top-level retry', () => {
    expect(shouldFallbackToTopOutcome('google')).toBe(true)
    expect(shouldFallbackToTopOutcome('OAuthCallback')).toBe(true)
    expect(shouldFallbackToTopOutcome('Configuration')).toBe(true)
    expect(shouldFallbackToTopOutcome('OAuthSignin')).toBe(true)
  })

  it('keeps account/state errors in-app (a top redirect would not help)', () => {
    expect(shouldFallbackToTopOutcome('OAuthAccountNotLinked')).toBe(false)
    expect(shouldFallbackToTopOutcome('NoAccount')).toBe(false)
    expect(shouldFallbackToTopOutcome('AlreadySignedIn')).toBe(false)
    expect(shouldFallbackToTopOutcome('Default')).toBe(false)
  })
})

describe('googleAuthErrorMessage', () => {
  it('maps known codes and falls back for unknown ones', () => {
    expect(googleAuthErrorMessage('OAuthAccountNotLinked')).toContain('already used')
    expect(googleAuthErrorMessage('AccessDenied')).toContain('not approved')
    expect(googleAuthErrorMessage('Nope')).toBeTruthy()
  })
})
