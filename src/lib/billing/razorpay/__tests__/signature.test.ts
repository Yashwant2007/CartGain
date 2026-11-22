import {
  computeRazorpayHmac,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../signature'

describe('Razorpay signatures', () => {
  const secret = 'whsec_test_123'

  it('verifies raw webhook bodies without re-serializing JSON', () => {
    const raw = '{ "event": "subscription.charged", "payload": { "id": "sub_1" } }'
    const signature = computeRazorpayHmac(raw, secret)
    expect(verifyRazorpayWebhookSignature(raw, signature, secret)).toBe(true)
    expect(verifyRazorpayWebhookSignature(JSON.stringify(JSON.parse(raw)), signature, secret)).toBe(false)
  })

  it('rejects missing or malformed signatures', () => {
    const raw = '{}'
    expect(verifyRazorpayWebhookSignature(raw, null, secret)).toBe(false)
    expect(verifyRazorpayWebhookSignature(raw, 'not-hex', secret)).toBe(false)
  })

  it('signs checkout with subscription_id|payment_id', () => {
    const signature = computeRazorpayHmac('sub_1|pay_1', secret)
    expect(verifyRazorpayPaymentSignature({
      subscriptionId: 'sub_1',
      paymentId: 'pay_1',
      signature,
      keySecret: secret,
    })).toBe(true)
    expect(verifyRazorpayPaymentSignature({
      orderId: 'sub_1',
      paymentId: 'pay_1',
      signature,
      keySecret: secret,
    })).toBe(true)
    expect(verifyRazorpayPaymentSignature({
      subscriptionId: 'sub_2',
      paymentId: 'pay_1',
      signature,
      keySecret: secret,
    })).toBe(false)
  })
})
