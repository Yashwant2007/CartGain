import {
  hashToken,
  emailVerifyIdentifier,
  passwordResetIdentifier,
  generateRandomToken,
  validatePasswordStrength,
} from '@/lib/auth-utils'

describe('hashToken', () => {
  it('produces a deterministic 64-char sha256 hex digest', () => {
    const a = hashToken('raw-token-value')
    const b = hashToken('raw-token-value')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never equals the raw token (so a DB leak yields no usable token)', () => {
    const raw = generateRandomToken()
    expect(hashToken(raw)).not.toBe(raw)
  })

  it('differs for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'))
  })
})

describe('token identifier namespacing', () => {
  it('normalizes and namespaces email verification identifiers', () => {
    expect(emailVerifyIdentifier('  User@Example.com ')).toBe('email-verify:user@example.com')
  })

  it('namespaces password reset identifiers separately from verification', () => {
    const email = 'user@example.com'
    expect(passwordResetIdentifier(email)).toBe('password-reset:user@example.com')
    expect(passwordResetIdentifier(email)).not.toBe(emailVerifyIdentifier(email))
  })
})

describe('validatePasswordStrength', () => {
  it('rejects weak passwords and accepts policy-compliant ones', () => {
    expect(validatePasswordStrength('short')).not.toBeNull()
    expect(validatePasswordStrength('nouppercase1')).not.toBeNull()
    expect(validatePasswordStrength('NoNumberHere')).not.toBeNull()
    expect(validatePasswordStrength('StrongPass1')).toBeNull()
  })
})
