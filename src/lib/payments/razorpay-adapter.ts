import crypto from 'crypto'
import type { GatewayAdapter, GatewayPaymentEvent } from './types'

export const razorpayAdapter: GatewayAdapter = {
  name: 'razorpay',

  verifyWebhookSignature(body: string, headers: Headers): boolean {
    const signature = headers.get('x-razorpay-signature')
    if (!signature) return false

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!secret) return false

    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex')

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
  },

  parseEvent(body: string, _headers: Headers): GatewayPaymentEvent | null {
    try {
      const event = JSON.parse(body)

      if (event.event !== 'payment.failed') return null

      const payment = event.payload?.payment?.entity
      if (!payment) return null

      return {
        id: payment.id,
        gateway: 'razorpay',
        gatewayEventId: event.id || payment.id,
        orderRef: payment.notes?.orderRef || payment.order_id || '',
        merchantId: payment.notes?.merchantId || payment.notes?.storeId || payment.notes?.userId || '',
        amount: (payment.amount || 0) / 100,
        currency: payment.currency || 'INR',
        status: 'failed',
        failureReasonRaw: payment.description || payment.error_description || payment.error_reason || '',
        gatewayResponse: payment,
        method: payment.method,
      }
    } catch {
      return null
    }
  },
}
