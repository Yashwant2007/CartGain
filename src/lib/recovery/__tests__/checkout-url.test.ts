import {
  cartHasResumeToken,
  countRecoveryUrlStatuses,
  decryptRecoveryUrlFromStorage,
  encryptRecoveryUrlForStorage,
  extractCheckoutTokenFromRecoveryUrl,
  isRecoveryUrlAccessDenied,
  normalizeRecoveryUrlStatus,
  normalizeStoreUrlAccessState,
  validateShopifyRecoveryUrl,
} from '../checkout-url'

describe('Shopify checkout recovery URLs', () => {
  const originalKey = process.env.ENCRYPTION_KEY

  afterAll(() => {
    if (originalKey === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = originalKey
  })

  describe('validateShopifyRecoveryUrl', () => {
    it('accepts a myshopify recovery URL and extracts the token', () => {
      expect(
        validateShopifyRecoveryUrl(
          'https://shop.myshopify.com/checkouts/ac/cart_token_abc123/recover?key=secret',
        ),
      ).toEqual({ valid: true, token: 'cart_token_abc123' })
    })

    it('accepts a verified custom domain', () => {
      expect(
        validateShopifyRecoveryUrl(
          'https://www.example-store.com/en/checkouts/cart_token_xyz789/recover?key=secret',
        ),
      ).toEqual({ valid: true, token: 'cart_token_xyz789' })
    })

    it('accepts an explicit token query parameter', () => {
      expect(
        validateShopifyRecoveryUrl('https://shop.example.com/recover?token=checkout_token_1'),
      ).toEqual({ valid: true, token: 'checkout_token_1' })
    })

    it('rejects missing, insecure, credentialed, and wrong-path URLs', () => {
      expect(validateShopifyRecoveryUrl(null)).toEqual({ valid: false, reason: 'missing' })
      expect(validateShopifyRecoveryUrl('http://shop.myshopify.com/checkouts/abc/recover')).toEqual({
        valid: false,
        reason: 'insecure',
      })
      expect(
        validateShopifyRecoveryUrl('https://user:pass@shop.myshopify.com/checkouts/abc/recover'),
      ).toEqual({ valid: false, reason: 'malformed' })
      expect(validateShopifyRecoveryUrl('https://shop.myshopify.com/cart/abc')).toEqual({
        valid: false,
        reason: 'wrong_path',
      })
      expect(validateShopifyRecoveryUrl('https://shop.myshopify.com/checkouts/!/recover')).toEqual({
        valid: false,
        reason: 'invalid_token',
      })
    })

    it('extracts only valid tokens', () => {
      expect(
        extractCheckoutTokenFromRecoveryUrl(
          'https://shop.myshopify.com/checkouts/abc123xy/recover',
        ),
      ).toBe('abc123xy')
      expect(extractCheckoutTokenFromRecoveryUrl('not a url')).toBeNull()
      expect(extractCheckoutTokenFromRecoveryUrl('https://shop.myshopify.com/cart/abc123xy')).toBeNull()
    })
  })

  describe('resume eligibility', () => {
    it('treats legacy rows (null status) with a token as resumable', () => {
      expect(cartHasResumeToken({ cartId: 'cart_token_abc123' })).toBe(true)
      expect(cartHasResumeToken({ cartId: 'cart_token_abc123', recoveryUrlStatus: null })).toBe(true)
    })

    it('refuses denied, failed, invalid, and missing tokens', () => {
      expect(
        cartHasResumeToken({ cartId: 'cart_token_abc123', recoveryUrlStatus: 'ACCESS_DENIED' }),
      ).toBe(false)
      expect(
        cartHasResumeToken({ cartId: 'cart_token_abc123', recoveryUrlStatus: 'RETRIEVAL_FAILED' }),
      ).toBe(false)
      expect(
        cartHasResumeToken({ cartId: 'cart_token_abc123', recoveryUrlStatus: 'EXPIRED_OR_INVALID' }),
      ).toBe(false)
      expect(cartHasResumeToken({ cartId: '', recoveryUrlStatus: 'AVAILABLE' })).toBe(false)
      expect(cartHasResumeToken({ cartId: 'bad token!', recoveryUrlStatus: 'AVAILABLE' })).toBe(false)
    })
  })

  describe('status normalization and access classification', () => {
    it('treats unknown persisted statuses safely', () => {
      expect(normalizeRecoveryUrlStatus(null)).toBe('AVAILABLE')
      expect(normalizeRecoveryUrlStatus('AVAILABLE')).toBe('AVAILABLE')
      expect(normalizeRecoveryUrlStatus('SOMETHING_ELSE')).toBe('RETRIEVAL_FAILED')
      expect(normalizeStoreUrlAccessState(undefined)).toBe('UNKNOWN')
      expect(normalizeStoreUrlAccessState('ACCESS_DENIED')).toBe('ACCESS_DENIED')
      expect(normalizeStoreUrlAccessState('nonsense')).toBe('UNKNOWN')
    })

    it('classifies Shopify permission failures without treating generic errors as denial', () => {
      expect(isRecoveryUrlAccessDenied(new Error('ACCESS_DENIED: protected customer data'))).toBe(true)
      expect(isRecoveryUrlAccessDenied(new Error('Field is not approved'))).toBe(true)
      expect(isRecoveryUrlAccessDenied(new Error('socket hang up'))).toBe(false)
    })

    it('counts statuses for monitoring without URLs', () => {
      expect(
        countRecoveryUrlStatuses(['AVAILABLE', 'AVAILABLE', 'MISSING', null, 'ACCESS_DENIED']),
      ).toEqual({ AVAILABLE: 3, MISSING: 1, ACCESS_DENIED: 1 })
    })
  })

  describe('encrypted-at-rest persistence', () => {
    it('round-trips a valid recovery URL', () => {
      process.env.ENCRYPTION_KEY = 'unit-test-encryption-key'
      const url = 'https://shop.myshopify.com/checkouts/cart_token_abc123/recover?key=secret'
      const encrypted = encryptRecoveryUrlForStorage(url)
      expect(encrypted).toBeTruthy()
      expect(encrypted).not.toContain('cart_token_abc123')
      expect(decryptRecoveryUrlFromStorage(encrypted)).toBe(url)
    })

    it('never throws when encryption is unavailable', () => {
      delete process.env.ENCRYPTION_KEY
      try {
        expect(
          encryptRecoveryUrlForStorage('https://shop.myshopify.com/checkouts/abc123/recover'),
        ).toBeNull()
        expect(decryptRecoveryUrlFromStorage('not-encrypted')).toBeNull()
      } finally {
        process.env.ENCRYPTION_KEY = 'unit-test-encryption-key'
      }
    })
  })
})
