import { makeSignature, captureError } from '../logger'

describe('observability logger', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('makeSignature', () => {
    it('groups by component::operation::error-name', () => {
      expect(makeSignature('billing', 'create_subscription', new Error('boom'))).toBe(
        'billing::create_subscription::Error'
      )
    })

    it('classifies non-Error payloads', () => {
      expect(makeSignature('webhook', 'ws', 'plain string')).toBe('webhook::ws::StringError')
      expect(makeSignature('webhook', 'ws', { weird: true })).toBe('webhook::ws::UnknownError')
    })
  })

  describe('captureError', () => {
    it('masks secret values before they reach the console', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      await captureError({
        level: 'error',
        component: 'auth',
        operation: 'test_masking',
        error: new Error('resetToken=sk_test_abcdef0123456789 shpat_1234567890abcdef failed'),
        persist: false,
        statusCode: 500,
      })
      expect(spy).toHaveBeenCalled()
      const output = spy.mock.calls.map((c) => String(c[0])).join(' ')
      expect(output).not.toContain('sk_test_abcdef0123456789')
      expect(output).not.toContain('shpat_1234567890abcdef')
    })

    it('computes environment/release without crashing in test env', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      await captureError({
        level: 'critical',
        component: 'system',
        operation: 'test_critical',
        message: 'critical test marker',
        persist: false,
      })
      // Alert path must not throw when Redis is missing.
      expect(spy).toHaveBeenCalled()
    })
  })
})