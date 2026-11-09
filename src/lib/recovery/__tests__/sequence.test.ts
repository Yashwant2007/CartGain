import {
  buildRecoverySequence,
  resolveNextStep,
  isStepDue,
  evaluateCampaignStop,
  customerRepliedSinceConsent,
  isCampaignExpired,
  sanitizeChannels,
  clampRounds,
  MIN_STEP_INTERVAL_MS,
  MAX_ROUNDS,
  type RecoveryMessageLike,
} from '@/lib/recovery/sequence'

const MIN = 60 * 1000
const HOUR = 60 * MIN

function cfg(over: Partial<Parameters<typeof buildRecoverySequence>[0]> = {}) {
  return {
    channels: ['email', 'whatsapp'],
    maxFollowUps: 2,
    sendDelay: 60,
    followUpDelay: 180,
    ...over,
  }
}

describe('sanitizeChannels', () => {
  it('preserves merchant order and drops unsupported/duplicate channels', () => {
    expect(sanitizeChannels(['whatsapp', 'sms', 'email', 'whatsapp', 'push'])).toEqual([
      'whatsapp',
      'email',
    ])
  })

  it('falls back to the default order when nothing is usable', () => {
    expect(sanitizeChannels([])).toEqual(['email', 'whatsapp'])
    expect(sanitizeChannels(['sms', 'push'])).toEqual(['email', 'whatsapp'])
  })
})

describe('clampRounds', () => {
  it('clamps into 1..5', () => {
    expect(clampRounds(0)).toBe(1)
    expect(clampRounds(-3)).toBe(1)
    expect(clampRounds(2)).toBe(2)
    expect(clampRounds(99)).toBe(MAX_ROUNDS)
    expect(clampRounds(Number.NaN)).toBe(1)
  })
})

describe('buildRecoverySequence', () => {
  const abandoned = new Date('2026-01-01T10:00:00.000Z')

  it('builds one flat ordered step per channel per round (email-first)', () => {
    const steps = buildRecoverySequence(cfg({ channels: ['email', 'whatsapp'] }), abandoned)
    expect(steps.map(s => `${s.index}:${s.channel}:r${s.round}`)).toEqual([
      '0:email:r0',
      '1:whatsapp:r0',
      '2:email:r1',
      '3:whatsapp:r1',
    ])
  })

  it('builds whatsapp-first when the merchant chose that order', () => {
    const steps = buildRecoverySequence(cfg({ channels: ['whatsapp', 'email'] }), abandoned)
    expect(steps.map(s => `${s.index}:${s.channel}`)).toEqual([
      '0:whatsapp',
      '1:email',
      '2:whatsapp',
      '3:email',
    ])
  })

  it('preserves two follow-ups per channel', () => {
    const steps = buildRecoverySequence(
      cfg({ channels: ['email', 'whatsapp'], maxFollowUps: 3 }),
      abandoned,
    )
    // initial + 2 follow-ups = 3 rounds × 2 channels = 6 steps
    expect(steps).toHaveLength(6)
    expect(steps.filter(s => s.channel === 'email')).toHaveLength(3)
    expect(steps.filter(s => s.channel === 'whatsapp')).toHaveLength(3)
  })

  it('schedules the first step after sendDelay', () => {
    const [first] = buildRecoverySequence(cfg({ sendDelay: 60 }), abandoned)
    expect(first.scheduledAt.getTime()).toBe(abandoned.getTime() + HOUR)
  })

  it('spaces consecutive steps by at least the follow-up delay', () => {
    const steps = buildRecoverySequence(cfg({ followUpDelay: 180 }), abandoned)
    for (let i = 1; i < steps.length; i++) {
      const gap = steps[i].scheduledAt.getTime() - steps[i - 1].scheduledAt.getTime()
      expect(gap).toBe(180 * MIN)
    }
  })

  it('never spaces steps closer than the safety floor', () => {
    const steps = buildRecoverySequence(cfg({ followUpDelay: 1 }), abandoned)
    const gap = steps[1].scheduledAt.getTime() - steps[0].scheduledAt.getTime()
    expect(gap).toBe(MIN_STEP_INTERVAL_MS)
  })

  it('never sends email and whatsapp in the same sweep slot', () => {
    const steps = buildRecoverySequence(cfg({ followUpDelay: 0 }), abandoned)
    const times = new Set(steps.map(s => s.scheduledAt.getTime()))
    expect(times.size).toBe(steps.length)
  })
})

describe('resolveNextStep', () => {
  const abandoned = new Date('2026-01-01T10:00:00.000Z')
  const sequence = buildRecoverySequence(cfg(), abandoned)

  it('returns the first step when nothing has been sent', () => {
    const next = resolveNextStep(sequence, [])
    expect(next.done).toBe(false)
    if (!next.done) {
      expect(next.step.index).toBe(0)
      expect(next.step.channel).toBe('email')
    }
  })

  it('advances to the next step only after the current one is terminal', () => {
    const messages: RecoveryMessageLike[] = [{ channel: 'email', step: 0, status: 'sent' }]
    const next = resolveNextStep(sequence, messages)
    expect(next.done).toBe(false)
    if (!next.done) expect(next.step.index).toBe(1)
  })

  it('does not advance past a failed step (keeps it retryable)', () => {
    const messages: RecoveryMessageLike[] = [{ channel: 'email', step: 0, status: 'failed' }]
    const next = resolveNextStep(sequence, messages)
    expect(next.done).toBe(false)
    if (!next.done) expect(next.step.index).toBe(0)
  })

  it('treats skipped as terminal so a blocked channel does not wedge the sequence', () => {
    const messages: RecoveryMessageLike[] = [{ channel: 'email', step: 0, status: 'skipped' }]
    const next = resolveNextStep(sequence, messages)
    if (!next.done) expect(next.step.index).toBe(1)
  })

  it('does not confuse the same channel across rounds (step index disambiguates)', () => {
    const messages: RecoveryMessageLike[] = [
      { channel: 'email', step: 0, status: 'sent' },
      { channel: 'whatsapp', step: 1, status: 'sent' },
    ]
    const next = resolveNextStep(sequence, messages)
    // email:0 and whatsapp:1 done → next is email round 1 at index 2
    if (!next.done) {
      expect(next.step.index).toBe(2)
      expect(next.step.channel).toBe('email')
    }
  })

  it('is done when every step has a terminal message', () => {
    const messages: RecoveryMessageLike[] = sequence.map(s => ({
      channel: s.channel,
      step: s.index,
      status: 'delivered',
    }))
    expect(resolveNextStep(sequence, messages)).toEqual({ done: true, reason: 'completed' })
  })

  it('ignores legacy messages with a null step', () => {
    const messages: RecoveryMessageLike[] = [{ channel: 'email', step: null, status: 'sent' }]
    const next = resolveNextStep(sequence, messages)
    if (!next.done) expect(next.step.index).toBe(0)
  })
})

describe('isStepDue', () => {
  const abandoned = new Date('2026-01-01T10:00:00.000Z')
  const [first] = buildRecoverySequence(cfg({ sendDelay: 60 }), abandoned)

  it('is not due before the scheduled moment', () => {
    expect(isStepDue(first, new Date(abandoned.getTime() + 30 * MIN))).toBe(false)
  })

  it('is due at/after the scheduled moment', () => {
    expect(isStepDue(first, new Date(abandoned.getTime() + HOUR))).toBe(true)
    expect(isStepDue(first, new Date(abandoned.getTime() + 2 * HOUR))).toBe(true)
  })
})

describe('campaign expiry', () => {
  const abandoned = new Date('2026-01-01T10:00:00.000Z')

  it('expires a cart older than the configured window', () => {
    expect(isCampaignExpired(abandoned, new Date(abandoned.getTime() + 8 * 24 * HOUR), 7)).toBe(true)
    expect(isCampaignExpired(abandoned, new Date(abandoned.getTime() + 2 * 24 * HOUR), 7)).toBe(false)
  })

  it('never expires when the window is disabled', () => {
    expect(isCampaignExpired(abandoned, new Date(abandoned.getTime() + 365 * 24 * HOUR), 0)).toBe(false)
  })
})

describe('evaluateCampaignStop — stopping conditions', () => {
  const abandoned = new Date('2026-01-01T10:00:00.000Z')
  const now = new Date(abandoned.getTime() + HOUR)
  const sequence = buildRecoverySequence(cfg(), abandoned)

  it('stops on purchase (convertedAt)', () => {
    const reason = evaluateCampaignStop({
      cart: { convertedAt: now },
      next: resolveNextStep(sequence, []),
      abandonedAt: abandoned,
      now,
    })
    expect(reason).toBe('converted')
  })

  it('stops on recovered (attributed purchase)', () => {
    const reason = evaluateCampaignStop({
      cart: { isRecovered: true },
      next: resolveNextStep(sequence, []),
      abandonedAt: abandoned,
      now,
    })
    expect(reason).toBe('converted')
  })

  it('stops when the recipient is suppressed or opted out', () => {
    expect(
      evaluateCampaignStop({
        cart: {},
        identity: { suppressed: true },
        next: resolveNextStep(sequence, []),
        abandonedAt: abandoned,
        now,
      }),
    ).toBe('suppressed')
    expect(
      evaluateCampaignStop({
        cart: {},
        identity: { optedOutAt: new Date() },
        next: resolveNextStep(sequence, []),
        abandonedAt: abandoned,
        now,
      }),
    ).toBe('suppressed')
  })

  it('stops when the sequence is exhausted', () => {
    const allDone = sequence.map(s => ({ channel: s.channel, step: s.index, status: 'sent' }))
    expect(
      evaluateCampaignStop({
        cart: {},
        next: resolveNextStep(sequence, allDone),
        abandonedAt: abandoned,
        now,
      }),
    ).toBe('sequence_exhausted')
  })

  it('continues while a step is pending and the cart is eligible', () => {
    expect(
      evaluateCampaignStop({
        cart: {},
        next: resolveNextStep(sequence, []),
        abandonedAt: abandoned,
        now,
      }),
    ).toBeNull()
  })

  it('stops an expired campaign even when a step is pending', () => {
    const longAfter = new Date(abandoned.getTime() + 30 * 24 * HOUR)
    expect(
      evaluateCampaignStop({
        cart: {},
        next: resolveNextStep(sequence, []),
        abandonedAt: abandoned,
        now: longAfter,
        expiryDays: 7,
      }),
    ).toBe('expired')
  })

  it('stops automated recovery once the customer replies', () => {
    expect(
      evaluateCampaignStop({
        cart: {},
        identity: {
          whatsappConsentAt: new Date(abandoned.getTime() - HOUR),
          lastInboundAt: new Date(abandoned.getTime() + 5 * MIN),
        },
        next: resolveNextStep(sequence, []),
        abandonedAt: abandoned,
        now,
      }),
    ).toBe('customer_replied')
  })

  it('does not treat an inbound START opt-in as a reply', () => {
    const consent = new Date(abandoned.getTime() + 5 * MIN)
    expect(
      evaluateCampaignStop({
        cart: {},
        identity: { whatsappConsentAt: consent, lastInboundAt: consent },
        next: resolveNextStep(sequence, []),
        abandonedAt: abandoned,
        now,
      }),
    ).toBeNull()
  })
})

describe('customerRepliedSinceConsent', () => {
  const abandoned = new Date('2026-01-01T10:00:00.000Z')

  it('is false without an inbound message', () => {
    expect(customerRepliedSinceConsent(null)).toBe(false)
    expect(customerRepliedSinceConsent({})).toBe(false)
  })

  it('is true for a reply after consent', () => {
    expect(
      customerRepliedSinceConsent({
        whatsappConsentAt: new Date(abandoned.getTime() - HOUR),
        lastInboundAt: new Date(abandoned.getTime() + HOUR),
      }),
    ).toBe(true)
  })

  it('ignores replies that predate the cart abandonment', () => {
    expect(
      customerRepliedSinceConsent(
        {
          whatsappConsentAt: new Date(abandoned.getTime() - 5 * HOUR),
          lastInboundAt: new Date(abandoned.getTime() - HOUR),
        },
        abandoned,
      ),
    ).toBe(false)
  })

  it('treats a first reply without recorded consent as engagement', () => {
    expect(
      customerRepliedSinceConsent({ lastInboundAt: new Date(abandoned.getTime() + HOUR) }, abandoned),
    ).toBe(true)
  })

  it('excludes START even when it arrives just after a prior consent', () => {
    const consent = new Date(abandoned.getTime() + 5 * MIN)
    const start = new Date(consent.getTime() + 20 * 1000)
    expect(
      customerRepliedSinceConsent({ whatsappConsentAt: consent, lastInboundAt: start }, abandoned),
    ).toBe(false)
  })
})
