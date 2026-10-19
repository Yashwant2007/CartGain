import {
  publicDwellConfig,
  DWELL_DEFAULT_SECONDS,
  DWELL_DEFAULT_REMINDER_SECONDS,
  DWELL_MIN_SECONDS,
  DWELL_MAX_SECONDS,
} from '../engagement'

describe('publicDwellConfig', () => {
  it('disables for a missing/unknown config', () => {
    expect(publicDwellConfig(null).enabled).toBe(false)
    expect(publicDwellConfig(undefined).enabled).toBe(false)
  })

  it('disables when the merchant turned the nudge off', () => {
    const out = publicDwellConfig({ dwellNudgeEnabled: false, dwellSeconds: 30, dwellReminderSeconds: 30 })
    expect(out.enabled).toBe(false)
    expect(out.dwellSeconds).toBe(30)
    expect(out.reminderSeconds).toBe(30)
  })

  it('passes through enabled timings unchanged', () => {
    expect(publicDwellConfig({ dwellNudgeEnabled: true, dwellSeconds: 45, dwellReminderSeconds: 120 })).toEqual({
      enabled: true,
      dwellSeconds: 45,
      reminderSeconds: 120,
    })
  })

  it('clamps out-of-range values to safe bounds', () => {
    expect(publicDwellConfig({ dwellNudgeEnabled: true, dwellSeconds: 1, dwellReminderSeconds: 9999 })).toEqual({
      enabled: true,
      dwellSeconds: DWELL_MIN_SECONDS,
      reminderSeconds: DWELL_MAX_SECONDS,
    })
  })

  it('defaults missing values to the product defaults', () => {
    expect(publicDwellConfig({ dwellNudgeEnabled: true })).toEqual({
      enabled: true,
      dwellSeconds: DWELL_DEFAULT_SECONDS,
      reminderSeconds: DWELL_DEFAULT_REMINDER_SECONDS,
    })
  })

  it('rounds fractional seconds and ignores non-numbers', () => {
    expect(publicDwellConfig({ dwellNudgeEnabled: true, dwellSeconds: 59.6, dwellReminderSeconds: 60.4 }).dwellSeconds).toBe(60)
    const out = publicDwellConfig({ dwellNudgeEnabled: true, dwellSeconds: 'oops' as unknown as number })
    expect(out.dwellSeconds).toBe(DWELL_DEFAULT_SECONDS)
  })
})
