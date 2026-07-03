import { razorpayAdapter } from '../razorpay-adapter'
import { cashfreeAdapter } from '../cashfree-adapter'

describe('RazorpayAdapter', () => {
  const validSignature = '3fe5c2a8a8b8c8d8e8f8a8b8c8d8e8f8a8b8c8d8e8f8a8b8c8d8e8f8a8b8c8d'

  describe('verifyWebhookSignature', () => {
    const OLD_ENV = process.env

    beforeEach(() => {
      jest.resetModules()
      process.env = { ...OLD_ENV, RAZORPAY_WEBHOOK_SECRET: 'test_secret' }
    })

    afterAll(() => {
      process.env = OLD_ENV
    })

    it('should reject missing signature header', () => {
      const headers = new Headers()
      expect(razorpayAdapter.verifyWebhookSignature('{}', headers)).toBe(false)
    })

    it('should reject when secret is not configured', () => {
      process.env.RAZORPAY_WEBHOOK_SECRET = ''
      const headers = new Headers({ 'x-razorpay-signature': 'abc' })
      expect(razorpayAdapter.verifyWebhookSignature('{}', headers)).toBe(false)
    })
  })

  describe('parseEvent', () => {
    it('should parse a payment.failed event', () => {
      const body = JSON.stringify({
        event: 'payment.failed',
        id: 'evt_123',
        payload: {
          payment: {
            entity: {
              id: 'pay_123',
              amount: 50000,
              currency: 'INR',
              description: 'bank declined',
              method: 'upi',
              notes: {
                merchantId: 'store_1',
                orderRef: 'ord_1',
              },
            },
          },
        },
      })

      const event = razorpayAdapter.parseEvent(body, new Headers())
      expect(event).not.toBeNull()
      expect(event!.gateway).toBe('razorpay')
      expect(event!.amount).toBe(500)
      expect(event!.merchantId).toBe('store_1')
      expect(event!.orderRef).toBe('ord_1')
      expect(event!.failureReasonRaw).toBe('bank declined')
    })

    it('should return null for non-failure events', () => {
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_123' } } },
      })
      expect(razorpayAdapter.parseEvent(body, new Headers())).toBeNull()
    })
  })
})

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
