import crypto from 'crypto'
import type { GatewayAdapter, GatewayPaymentEvent } from './types'

export const cashfreeAdapter: GatewayAdapter = {
  name: 'cashfree',

  verifyWebhookSignature(body: string, headers: Headers): boolean {
    const signature = headers.get('x-webhook-signature')
    if (!signature) return false

    const secret = process.env.CASHFREE_WEBHOOK_SECRET
    if (!secret) return false

    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64')

    return signature === expected
  },

  parseEvent(body: string, _headers: Headers): GatewayPaymentEvent | null {
    try {
      const event = JSON.parse(body)

      if (event.type !== 'ORDER_PAYMENT_FAILED') return null

      const order = event.data?.order
      const payment = event.data?.payment
      if (!order || !payment) return null

      return {
        id: payment.cf_payment_id || payment.payment_id || event.id || '',
        gateway: 'cashfree',
        gatewayEventId: event.id || `${payment.cf_payment_id}_${Date.now()}`,
        orderRef: order.order_id || order.order_note || '',
        merchantId: order.order_tags?.merchantId || order.order_tags?.storeId || '',
        amount: parseFloat(order.order_amount || '0'),
        currency: order.order_currency || 'INR',
        status: 'failed',
        failureReasonRaw: payment.failure_reason || payment.failed_reason || '',
        gatewayResponse: event,
        method: payment.payment_method,
      }
    } catch {
      return null
    }
  },
}
