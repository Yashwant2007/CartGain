import { generateSecureToken, verifySecureToken } from '@/lib/links'

describe('Secure Link Tokens', () => {
  it('should generate and verify a token', () => {
    const token = generateSecureToken('test-data')
    const data = verifySecureToken(token)
    expect(data).toBe('test-data')
  })

  it('should reject expired tokens', () => {
    const token = generateSecureToken('test-data')
    const data = verifySecureToken(token, -1)
    expect(data).toBeNull()
  })

  it('should reject tampered tokens', () => {
    const token = generateSecureToken('test-data')
    const tampered = token.slice(0, -5) + 'AAAAA'
    const data = verifySecureToken(tampered)
    expect(data).toBeNull()
  })

  it('should reject completely invalid tokens', () => {
    const data = verifySecureToken('not-a-valid-token')
    expect(data).toBeNull()
  })

  it('should produce unique tokens for same data', () => {
    const token1 = generateSecureToken('same-data')
    const token2 = generateSecureToken('same-data')
    expect(token1).not.toBe(token2)
  })

  it('fails closed in production when no secret is configured', () => {
    const prevNodeEnv = process.env.NODE_ENV
    const prevLink = process.env.LINK_SECRET
    const prevNext = process.env.NEXTAUTH_SECRET
    try {
      // Force the "no secret" path in a production environment.
      ;(process.env as any).NODE_ENV = 'production'
      delete process.env.LINK_SECRET
      delete process.env.NEXTAUTH_SECRET
      expect(verifySecureToken('not-a-valid-token')).toBeNull()
      expect(() => generateSecureToken('x')).toThrow()
    } finally {
      ;(process.env as any).NODE_ENV = prevNodeEnv
      if (prevLink !== undefined) process.env.LINK_SECRET = prevLink
      if (prevNext !== undefined) process.env.NEXTAUTH_SECRET = prevNext
    }
  })
})
