import {
  CUSTOMER_PAYMENT_LINK_TTL_MS,
  buildCustomerPaymentLinkPayload,
  customerPaymentReference,
  customerPaymentIdempotencyKey,
  isCustomerPaymentPlatformEnabled,
  normalizeCustomerPaymentEvent,
  quoteIdFromCustomerPaymentReference,
  verifyCustomerPaymentWebhook,
} from '../razorpay'

const quote = {
  id: 'quote-1',
  storeId: 'store-1',
  finalPrice: 914.16,
  currency: 'INR',
  expiresAt: new Date('2026-01-01T01:00:00Z'),
  sessionId: 'session-1',
}

describe('customer Razorpay payment helpers', () => {
  const originalPlatforms = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS
  const originalFlag = process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK

  beforeEach(() => {
    process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS = 'shopify, woocommerce'
    process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = 'false'
  })

  afterEach(() => {
    if (originalPlatforms === undefined) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS
    else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS = originalPlatforms
    if (originalFlag === undefined) delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK
    else process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK = originalFlag
  })

  it('builds a bounded 15-minute payload with the locked quote amount', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const result = buildCustomerPaymentLinkPayload({ quote, platform: 'shopify', now })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.amountMinor).toBe(91416)
    expect(result.payload.amount).toBe(91416)
    expect(result.payload.currency).toBe('INR')
    expect(result.payload.reference_id).toBe(customerPaymentReference('quote-1'))
    expect((result.expiresAt.getTime() - now.getTime()) / 1000).toBeCloseTo(CUSTOMER_PAYMENT_LINK_TTL_MS / 1000, -1)
    expect(JSON.stringify(result.payload)).not.toContain('floorPrice')
    expect(JSON.stringify(result.payload)).not.toContain('secret')
  })

  it('clamps link expiry to the quote expiry', () => {
    const now = new Date('2026-01-01T00:50:00Z')
    const result = buildCustomerPaymentLinkPayload({ quote, platform: 'woocommerce', now })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expiresAt.toISOString()).toBe(quote.expiresAt.toISOString())
  })

  it('refuses disabled platforms, invalid amounts, currencies and expired quotes', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(buildCustomerPaymentLinkPayload({ quote, platform: 'magento', now })).toMatchObject({
      ok: false,
      reason: 'PLATFORM_DISABLED',
    })
    expect(buildCustomerPaymentLinkPayload({ quote: { ...quote, finalPrice: 0 }, platform: 'shopify', now })).toMatchObject({
      ok: false,
      reason: 'INVALID_AMOUNT',
    })
    expect(buildCustomerPaymentLinkPayload({ quote: { ...quote, currency: 'IN' }, platform: 'shopify', now })).toMatchObject({
      ok: false,
      reason: 'INVALID_CURRENCY',
    })
    expect(
      buildCustomerPaymentLinkPayload({
        quote: { ...quote, expiresAt: new Date('2025-12-31T23:00:00Z') },
        platform: 'shopify',
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'EXPIRED' })
  })

  it('detects the platform allowlist from the environment', () => {
    expect(isCustomerPaymentPlatformEnabled(' Shopify ')).toBe(true)
    delete process.env.CUSTOMER_RAZORPAY_PAYMENT_LINK_PLATFORMS
    expect(isCustomerPaymentPlatformEnabled('shopify')).toBe(false)
  })

  it('verifies webhook signatures without timing leaks', () => {
    const body = JSON.stringify({ event: 'payment.captured' })
    const crypto = require('crypto')
    const signature = crypto.createHmac('sha256', 'webhook-secret').update(body).digest('hex')
    expect(verifyCustomerPaymentWebhook(body, signature, 'webhook-secret')).toBe(true)
    expect(verifyCustomerPaymentWebhook(body, 'bad', 'webhook-secret')).toBe(false)
    expect(verifyCustomerPaymentWebhook(body, signature, '')).toBe(false)
  })

  it('normalizes captured and failed customer payment events', () => {
    const captured = normalizeCustomerPaymentEvent({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_1',
            reference_id: customerPaymentReference('quote-1'),
            status: 'captured',
            amount: 91416,
            currency: 'INR',
          },
        },
      },
    })
    expect(captured.captured).toBe(true)
    expect(captured.quoteId).toBe('quote-1')
    expect(quoteIdFromCustomerPaymentReference(captured.referenceId)).toBe('quote-1')
    expect(customerPaymentIdempotencyKey(captured)).toBe('payment.captured:pay_1')
    expect(customerPaymentIdempotencyKey(captured, 'evt_1')).toBe('evt_1')

    const failed = normalizeCustomerPaymentEvent({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_2', status: 'failed' } } },
    })
    expect(failed.failed).toBe(true)
  })
})
