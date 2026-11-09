import { buildCartTimeline } from '@/lib/recovery/timeline'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const abandoned = new Date('2026-01-01T10:00:00.000Z')

const campaign = {
  channels: ['email', 'whatsapp'],
  maxFollowUps: 2,
  sendDelay: 0,
  followUpDelay: 180,
}

describe('buildCartTimeline', () => {
  it('plans channels x rounds in merchant order', () => {
    const timeline = buildCartTimeline({
      cart: { abandonedAt: abandoned },
      messages: [],
      campaign,
      now: abandoned,
    })

    expect(timeline.steps).toHaveLength(4)
    expect(timeline.steps.map((s) => `${s.channel}:${s.index}`)).toEqual([
      'email:0',
      'whatsapp:1',
      'email:2',
      'whatsapp:3',
    ])
    expect(timeline.steps[0].status).toBe('pending')
    expect(timeline.steps[1].status).toBe('scheduled')
    expect(timeline.nextStepIndex).toBe(0)
    expect(timeline.stopReason).toBeNull()
  })

  it('merges recorded message statuses and skip reasons', () => {
    const timeline = buildCartTimeline({
      cart: { abandonedAt: abandoned },
      messages: [
        { channel: 'email', step: 0, status: 'delivered', sentAt: abandoned, deliveredAt: abandoned },
        { channel: 'whatsapp', step: 1, status: 'skipped', reasonCode: 'missing_phone' },
      ],
      campaign,
      now: new Date(abandoned.getTime() + 4 * HOUR),
    })

    expect(timeline.steps[0]).toMatchObject({ status: 'delivered', attempts: 0 })
    expect(timeline.steps[1]).toMatchObject({ status: 'skipped', reasonCode: 'missing_phone' })
    expect(timeline.nextStepIndex).toBe(2)
  })

  it('advances past failed steps only when they are retried', () => {
    const timeline = buildCartTimeline({
      cart: { abandonedAt: abandoned },
      messages: [{ channel: 'email', step: 0, status: 'failed', reasonCode: 'email_transient' }],
      campaign,
      now: new Date(abandoned.getTime() + HOUR),
    })
    expect(timeline.steps[0]).toMatchObject({ status: 'failed', reasonCode: 'email_transient' })
    expect(timeline.nextStepIndex).toBe(0)
  })

  it('reports customer_replied as the stop reason', () => {
    const timeline = buildCartTimeline({
      cart: { abandonedAt: abandoned },
      messages: [{ channel: 'email', step: 0, status: 'delivered', sentAt: abandoned }],
      campaign,
      identity: {
        whatsappConsentAt: new Date(abandoned.getTime() - HOUR),
        lastInboundAt: new Date(abandoned.getTime() + 10 * MIN),
      },
      now: new Date(abandoned.getTime() + HOUR),
    })
    expect(timeline.stopReason).toBe('customer_replied')
    expect(timeline.nextStepIndex).toBeNull()
  })

  it('reports converted/suppressed/expired stops', () => {
    expect(
      buildCartTimeline({
        cart: { abandonedAt: abandoned, convertedAt: abandoned },
        messages: [],
        campaign,
        now: abandoned,
      }).stopReason,
    ).toBe('converted')

    expect(
      buildCartTimeline({
        cart: { abandonedAt: abandoned },
        messages: [],
        campaign,
        identity: { suppressed: true },
        now: abandoned,
      }).stopReason,
    ).toBe('suppressed')

    expect(
      buildCartTimeline({
        cart: { abandonedAt: abandoned },
        messages: [],
        campaign,
        now: new Date(abandoned.getTime() + 20 * 24 * HOUR),
        expiryDays: 14,
      }).stopReason,
    ).toBe('expired')
  })

  it('keeps legacy steps outside the current plan in the history', () => {
    const timeline = buildCartTimeline({
      cart: { abandonedAt: abandoned },
      messages: [
        { channel: 'email', step: 0, status: 'sent', createdAt: abandoned },
        { channel: 'email', step: 9, status: 'skipped', reasonCode: 'legacy', createdAt: abandoned },
      ],
      campaign: { ...campaign, channels: ['email'], maxFollowUps: 1 },
      now: abandoned,
    })
    expect(timeline.steps.some((s) => s.index === 9 && s.reasonCode === 'legacy')).toBe(true)
  })

  it('falls back to a default plan when the campaign is missing', () => {
    const timeline = buildCartTimeline({
      cart: { abandonedAt: abandoned },
      messages: [],
      campaign: null,
      now: abandoned,
    })
    expect(timeline.steps.map((s) => s.channel)).toEqual(['email', 'whatsapp'])
  })
})
