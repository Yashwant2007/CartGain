import {
  detectPaymentIntent,
  normalizePaymentConfig,
  hasPrepaidLever,
  paymentPromptBlock,
  prepaidSaving,
} from '../payment'

describe('detectPaymentIntent', () => {
  it('detects COD phrasing', () => {
    for (const m of ['I want COD', 'cash on delivery please', 'can I pay on delivery?', 'payment on delivery']) {
      expect(detectPaymentIntent(m)).toBe('cod')
    }
  })
  it('detects prepaid phrasing', () => {
    for (const m of ['I will pay via UPI', 'gpay ok?', 'pay by card', 'net banking', 'I can pay online now']) {
      expect(detectPaymentIntent(m)).toBe('prepaid')
    }
  })
  it('treats a bare "cash" as unknown (ambiguous)', () => {
    expect(detectPaymentIntent('I have cash')).toBe('unknown')
  })
  it('the current message wins over history', () => {
    expect(detectPaymentIntent('actually I will do UPI', ['I want COD'])).toBe('prepaid')
    expect(detectPaymentIntent('changed my mind, COD', ['UPI please'])).toBe('cod')
  })
  it('falls back to the most recent history signal', () => {
    expect(detectPaymentIntent('ok', ['hi', 'I want COD'])).toBe('cod')
    expect(detectPaymentIntent('ok', ['I will pay by card', 'I want COD'])).toBe('cod') // newest signal wins
  })
  it('returns unknown when nothing signals a method', () => {
    expect(detectPaymentIntent('too expensive')).toBe('unknown')
  })
})

describe('normalizePaymentConfig', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(normalizePaymentConfig({}).enabled).toBe(false)
    expect(normalizePaymentConfig({ paymentAwareEnabled: true }).enabled).toBe(true)
  })
  it('clamps the prepaid percent to 0..30 and rejects junk', () => {
    expect(normalizePaymentConfig({ prepaidIncentivePercent: 200 }).prepaidIncentivePercent).toBe(30)
    expect(normalizePaymentConfig({ prepaidIncentivePercent: -5 }).prepaidIncentivePercent).toBe(0)
    expect(normalizePaymentConfig({ prepaidIncentivePercent: NaN }).prepaidIncentivePercent).toBe(0)
  })
  it('reads the RTO lever only when enabled and positive', () => {
    expect(normalizePaymentConfig({ rtoReductionEnabled: true, rtoIncentive: 50 }).codRtoEnabled).toBe(true)
    expect(normalizePaymentConfig({ rtoReductionEnabled: false, rtoIncentive: 50 }).codRtoEnabled).toBe(false)
    expect(normalizePaymentConfig({ rtoReductionEnabled: true, rtoIncentive: -1 }).rtoIncentive).toBe(0)
  })
})

describe('paymentPromptBlock', () => {
  const config = normalizePaymentConfig({ paymentAwareEnabled: true, prepaidIncentivePercent: 5, rtoReductionEnabled: true, rtoIncentive: 75 })
  it('is null when disabled', () => {
    expect(paymentPromptBlock('cod', normalizePaymentConfig({}), '₹')).toBeNull()
  })
  it('guides the COD→prepaid steer with the real saving', () => {
    const block = paymentPromptBlock('cod', config, '₹')
    expect(block).toMatch(/CASH ON DELIVERY/)
    expect(block).toContain('₹75')
    expect(block).toContain('5%')
    expect(block).toContain('hidden system minimum')
    expect(block).not.toMatch(/floor|minPrice/i)
  })
  it('guides a faster prepaid close', () => {
    const block = paymentPromptBlock('prepaid', config, '₹')
    expect(block).toMatch(/PREPAID/)
    expect(block).toContain('5%')
  })
  it('asks about the method when unknown', () => {
    expect(paymentPromptBlock('unknown', config, '₹')).toMatch(/UNKNOWN/)
  })
  it('has no lever line when the merchant offers nothing', () => {
    const bare = normalizePaymentConfig({ paymentAwareEnabled: true })
    expect(hasPrepaidLever(bare)).toBe(false)
    expect(paymentPromptBlock('cod', bare, '₹')).not.toContain('prepaid saving of')
  })
})

describe('prepaidSaving', () => {
  it('exposes the COD→prepaid amount only when the program is on', () => {
    expect(prepaidSaving(normalizePaymentConfig({ rtoReductionEnabled: true, rtoIncentive: 40 }))).toBe(40)
    expect(prepaidSaving(normalizePaymentConfig({ rtoReductionEnabled: false, rtoIncentive: 40 }))).toBeNull()
    expect(prepaidSaving(normalizePaymentConfig({ rtoReductionEnabled: true, rtoIncentive: 0 }))).toBeNull()
  })
})
