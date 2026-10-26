import { evaluateWhatsAppEligibility, normalizeWhatsAppPhone } from '../eligibility'

const identity = (over: Record<string, any> = {}) => ({
  phone: '+919876543210',
  consentWhatsApp: true,
  suppressed: false,
  optedOutAt: null,
  ...over,
})

describe('normalizeWhatsAppPhone', () => {
  it('normalises spaces and punctuation to E.164 digits', () => {
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('+919876543210')
    expect(normalizeWhatsAppPhone('(91) 98765-43210')).toBe('+919876543210')
  })

  it('rejects too short, too long and malformed numbers', () => {
    expect(normalizeWhatsAppPhone('123')).toBeNull()
    expect(normalizeWhatsAppPhone('1234567890123456')).toBeNull()
    expect(normalizeWhatsAppPhone('')).toBeNull()
  })
})

describe('evaluateWhatsAppEligibility', () => {
  const base = {
    phone: '+919876543210',
    identity: identity(),
    storeActive: true,
    whatsappConfigured: true,
    cartConverted: false,
    onOptOutList: false,
  }

  it('allows only an explicit opt-in on the matching phone', () => {
    expect(evaluateWhatsAppEligibility(base)).toMatchObject({ eligible: true, code: 'eligible' })
  })

  it('blocks a converted cart before anything else', () => {
    expect(evaluateWhatsAppEligibility({ ...base, cartConverted: true }).code).toBe('cart_converted')
  })

  it('blocks when the provider is not configured', () => {
    expect(evaluateWhatsAppEligibility({ ...base, whatsappConfigured: false }).code).toBe(
      'whatsapp_not_configured',
    )
  })

  it('blocks a missing or invalid phone', () => {
    expect(evaluateWhatsAppEligibility({ ...base, phone: null }).code).toBe('missing_phone')
    expect(evaluateWhatsAppEligibility({ ...base, phone: '12' }).code).toBe('invalid_phone')
  })

  it('blocks the canonical opt-out list', () => {
    expect(evaluateWhatsAppEligibility({ ...base, onOptOutList: true }).code).toBe('opted_out')
  })

  it('never infers consent from a missing recipient record', () => {
    expect(evaluateWhatsAppEligibility({ ...base, identity: null }).code).toBe('no_consent')
    expect(evaluateWhatsAppEligibility({ ...base, identity: identity({ consentWhatsApp: false }) }).code).toBe(
      'no_consent',
    )
  })

  it('requires consent to belong to the cart phone number', () => {
    expect(
      evaluateWhatsAppEligibility({ ...base, identity: identity({ phone: '+919000000000' }) }).code,
    ).toBe('identity_mismatch')
    expect(evaluateWhatsAppEligibility({ ...base, identity: identity({ phone: null }) }).code).toBe(
      'identity_mismatch',
    )
  })

  it('honours suppression and previous opt-out even if a consent flag is stale', () => {
    expect(evaluateWhatsAppEligibility({ ...base, identity: identity({ suppressed: true }) }).code).toBe(
      'suppressed',
    )
    expect(
      evaluateWhatsAppEligibility({ ...base, identity: identity({ optedOutAt: new Date() }) }).code,
    ).toBe('opted_out')
  })

  it('blocks inactive stores', () => {
    expect(evaluateWhatsAppEligibility({ ...base, storeActive: false }).code).toBe('store_inactive')
  })
})
