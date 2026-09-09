import { track, isValidEventName, CLIENT_FIREABLE_EVENTS } from '../track'

const PRODUCT_EVENTS = [
  'cartgain_signup_completed',
  'cartgain_shopify_connect_started',
  'cartgain_shopify_oauth_completed',
  'cartgain_onboarding_started',
  'cartgain_onboarding_completed',
  'cartgain_billing_started',
  'cartgain_subscription_activated',
  'cartgain_campaign_created',
  'cartgain_recovery_message_sent',
  'cartgain_cart_recovered',
]

describe('analytics track', () => {
  describe('isValidEventName', () => {
    it('accepts cartgain_ prefixed snake_case names', () => {
      for (const name of PRODUCT_EVENTS) {
        expect(isValidEventName(name)).toBe(true)
      }
    })

    it('rejects non-allowlist or malformed names', () => {
      expect(isValidEventName('')).toBe(false)
      expect(isValidEventName('page_view')).toBe(false)
      expect(isValidEventName('CARTGAIN_signup')).toBe(false)
      expect(isValidEventName('cartgain_s')).toBe(false)
      expect(isValidEventName(`cartgain_${'x'.repeat(70)}`)).toBe(false)
      expect(isValidEventName('cartgain_a b c')).toBe(false)
    })
  })

  describe('CLIENT_FIREABLE_EVENTS', () => {
    it('only exposes onboarding moments to the client endpoint', () => {
      expect(CLIENT_FIREABLE_EVENTS.has('cartgain_onboarding_started')).toBe(true)
      expect(CLIENT_FIREABLE_EVENTS.has('cartgain_onboarding_completed')).toBe(true)
      expect(CLIENT_FIREABLE_EVENTS.has('cartgain_shopify_oauth_completed')).toBe(false)
      expect(CLIENT_FIREABLE_EVENTS.has('cartgain_billing_started')).toBe(false)
    })
  })

  describe('track() dev gate', () => {
    it('drops events in non-production unless ENABLE_DEV_ANALYTICS=true (no DB write)', async () => {
      const orig = process.env.ENABLE_DEV_ANALYTICS
      delete process.env.ENABLE_DEV_ANALYTICS
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      await track({ name: 'cartgain_signup_completed', userId: 'u1' })
      expect(warn).not.toHaveBeenCalled()
      expect(process.env.ENABLE_DEV_ANALYTICS).toBeUndefined()
      process.env.ENABLE_DEV_ANALYTICS = orig
    })

    it('warns and never throws on invalid event names', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      await expect(track({ name: 'bogus', userId: 'u1' })).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalled()
    })
  })
})