import {
  hashToken,
  emailVerifyIdentifier,
  passwordResetIdentifier,
  generateRandomToken,
  validatePasswordStrength,
  deriveStorePlatform,
  deriveSignupDomain,
  signupSchema,
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

describe('deriveStorePlatform', () => {
  it('infers shopify only from a real myshopify.com domain', () => {
    expect(deriveStorePlatform('cool-store.myshopify.com')).toBe('shopify')
    expect(deriveStorePlatform('COOL-STORE.MYSHOPIFY.COM')).toBe('shopify')
  })

  it('does NOT fabricate shopify for direct signups with no domain', () => {
    expect(deriveStorePlatform(undefined)).toBe('custom')
    expect(deriveStorePlatform('')).toBe('custom')
    expect(deriveStorePlatform('mystore.example.com')).toBe('custom')
  })

  it('lets an explicit platform override domain inference', () => {
    expect(deriveStorePlatform('cool-store.myshopify.com', 'woocommerce')).toBe('woocommerce')
    expect(deriveStorePlatform(undefined, 'shopify')).toBe('shopify')
  })
})

describe('deriveSignupDomain', () => {
  it('prefers a merchant-supplied domain verbatim (normalized)', () => {
    expect(deriveSignupDomain('My Store', 'a@b.com', '  Cool.Example.COM ')).toBe('cool.example.com')
  })

  it('falls back to a slug of the store name, never a myshopify.com placeholder', () => {
    const domain = deriveSignupDomain('My Great Store', 'a@b.com')
    expect(domain).toBe('my-great-store')
    expect(domain).not.toContain('myshopify')
  })

  it('falls back to the email local part when the store name slugs to nothing', () => {
    expect(deriveSignupDomain('!!!', 'jane@b.com')).toBe('jane')
  })
})

describe('signupSchema', () => {
  const base = {
    email: 'a@b.com',
    password: 'StrongPass1',
    name: 'Jane',
    storeName: 'My Store',
  }

  it('accepts a signup with no storeDomain (direct merchant signup)', () => {
    const res = signupSchema.safeParse(base)
    expect(res.success).toBe(true)
  })

  it('accepts an explicit platform', () => {
    const res = signupSchema.safeParse({ ...base, platform: 'woocommerce' })
    expect(res.success).toBe(true)
  })

  it('rejects an unsupported platform', () => {
    const res = signupSchema.safeParse({ ...base, platform: 'prestashop' })
    expect(res.success).toBe(false)
  })
})
