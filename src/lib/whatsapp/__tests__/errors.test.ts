import { isConfigWhatsAppFailure, isPermanentWhatsAppFailure } from '../errors'

describe('WhatsApp failure classification', () => {
  it('treats an undeliverable recipient as permanent', () => {
    expect(isPermanentWhatsAppFailure({ errorCode: 131026 })).toBe(true)
  })

  it('treats template mismatches as permanent', () => {
    for (const code of [132000, 132001, 132012, 131008]) {
      expect(isPermanentWhatsAppFailure({ errorCode: code })).toBe(true)
    }
  })

  it('recognises "not on WhatsApp" wording without a code', () => {
    expect(
      isPermanentWhatsAppFailure({ error: 'Recipient phone number is not on WhatsApp' }),
    ).toBe(true)
  })

  it('treats credential/permission failures as config problems, not permanent', () => {
    for (const code of [100, 190, 200]) {
      expect(isConfigWhatsAppFailure({ errorCode: code })).toBe(true)
      expect(isPermanentWhatsAppFailure({ errorCode: code })).toBe(false)
    }
    expect(isConfigWhatsAppFailure({ error: 'WhatsApp not configured' })).toBe(true)
  })

  it('treats rate limits and transient errors as retryable', () => {
    const failure = { errorCode: 131000, error: 'Temporarily unavailable' }
    expect(isPermanentWhatsAppFailure(failure)).toBe(false)
    expect(isConfigWhatsAppFailure(failure)).toBe(false)
  })
})
