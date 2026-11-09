import { cashfreeAdapter } from '../cashfree-adapter'

describe('CashfreeAdapter', () => {
  describe('verifyWebhookSignature', () => {
    const OLD_ENV = process.env

    beforeEach(() => {
      process.env = { ...OLD_ENV, CASHFREE_WEBHOOK_SECRET: 'cf_test_secret' }
    })

    afterAll(() => {
      process.env = OLD_ENV
    })

    it('should reject missing signature header', () => {
      const headers = new Headers()
      expect(cashfreeAdapter.verifyWebhookSignature('{}', headers)).toBe(false)
    })
  })

  describe('parseEvent', () => {
    it('should parse an ORDER_PAYMENT_FAILED event', () => {
      const body = JSON.stringify({
        type: 'ORDER_PAYMENT_FAILED',
        id: 'cf_evt_1',
        data: {
          order: {
            order_id: 'ord_cf_1',
            order_amount: '2999.00',
            order_currency: 'INR',
            order_tags: { merchantId: 'store_1' },
          },
          payment: {
            cf_payment_id: 'cf_pay_1',
            failure_reason: 'UPI timeout',
            payment_method: 'upi',
          },
        },
      })

      const event = cashfreeAdapter.parseEvent(body, new Headers())
      expect(event).not.toBeNull()
      expect(event!.gateway).toBe('cashfree')
      expect(event!.amount).toBe(2999)
      expect(event!.failureReasonRaw).toBe('UPI timeout')
    })

    it('should return null for non-failure events', () => {
      const body = JSON.stringify({
        type: 'ORDER_PAYMENT_SUCCESS',
        data: { order: { order_id: 'ord_1' }, payment: {} },
      })
      expect(cashfreeAdapter.parseEvent(body, new Headers())).toBeNull()
    })
  })
})
