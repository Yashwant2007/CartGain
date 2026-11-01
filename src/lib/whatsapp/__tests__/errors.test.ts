import {
  isConfigWhatsAppFailure,
  isEngagementLimitedReason,
  isEngagementLimitedWhatsAppFailure,
  isPermanentWhatsAppFailure,
} from '../errors'

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

  it('recognises Meta per-user marketing limits separately from transient errors', () => {
    for (const code of [131049, 130472]) {
      const failure = { errorCode: code }
      expect(isEngagementLimitedWhatsAppFailure(failure)).toBe(true)
      expect(isPermanentWhatsAppFailure(failure)).toBe(false)
      expect(isConfigWhatsAppFailure(failure)).toBe(false)
    }
    expect(isEngagementLimitedWhatsAppFailure({ errorCode: 131000 })).toBe(false)
  })

  it('recognises an engagement-limited delivery receipt reason code', () => {
    expect(
      isEngagementLimitedReason(
        'provider_failed:131049:This message was not delivered to maintain healthy ecosystem engagement.',
      ),
    ).toBe(true)
    expect(
      isEngagementLimitedReason('provider_failed:130472:Message was not sent as part of an experiment'),
    ).toBe(true)
    expect(isEngagementLimitedReason('whatsapp_engagement_limited')).toBe(false)
    expect(isEngagementLimitedReason('provider_failed:131026:Message undeliverable')).toBe(false)
    expect(isEngagementLimitedReason(null)).toBe(false)
  })
})
