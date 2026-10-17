import crypto from 'crypto'
import { generateSecureToken, verifySecureToken } from '@/lib/links'

// Rebuild a token the way the pre-hardening code did: same payload format, but
// the HMAC tag truncated to 16 hex chars (64 bits).
function legacyToken(data: string, secret: string): string {
  const timestamp = Date.now().toString(36)
  const nonce = 'deadbeefdeadbeef'
  const payload = `${timestamp}:${nonce}:${data}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16)
  return Buffer.from(`${payload}:${hmac}`, 'utf8').toString('base64url')
}

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

  it('issues the full 256-bit HMAC tag on new tokens', () => {
    const token = generateSecureToken('test-data')
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const tag = decoded.split(':').pop() as string
    expect(tag).toHaveLength(64)
  })

  it('still verifies legacy 64-bit tags issued before hardening', () => {
    const prev = process.env.LINK_SECRET
    try {
      process.env.LINK_SECRET = 'unit-test-link-secret-0123456789'
      // The legacy token must be signed with the SAME secret the verifier uses.
      const token = legacyToken('legacy-payload', process.env.LINK_SECRET)
      expect(verifySecureToken(token)).toBe('legacy-payload')
    } finally {
      if (prev !== undefined) process.env.LINK_SECRET = prev
      else delete process.env.LINK_SECRET
    }
  })

  it('rejects a 16-char tag that does not match the HMAC prefix', () => {
    const prev = process.env.LINK_SECRET
    try {
      process.env.LINK_SECRET = 'unit-test-link-secret-0123456789'
      const token = legacyToken('legacy-payload', 'a-different-secret-01234567890')
      expect(verifySecureToken(token)).toBeNull()
    } finally {
      if (prev !== undefined) process.env.LINK_SECRET = prev
      else delete process.env.LINK_SECRET
    }
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
