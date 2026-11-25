import { defaultGoalWindow, formatZonedDateTimeInput, parseZonedDateTimeInput } from '@/lib/bargain/dashboard-goal-time'

describe('dashboard goal time helpers', () => {
  it('formats an ISO instant in the merchant timezone', () => {
    expect(formatZonedDateTimeInput('2026-06-01T00:30:00.000Z', 'Asia/Kolkata')).toBe('2026-06-01T06:00')
    expect(formatZonedDateTimeInput('2026-06-01T00:30:00.000Z', 'UTC')).toBe('2026-06-01T00:30')
  })

  it('parses a wall-clock input in the merchant timezone back to the correct instant', () => {
    expect(parseZonedDateTimeInput('2026-06-01T06:00', 'Asia/Kolkata')).toBe('2026-06-01T00:30:00.000Z')
    expect(parseZonedDateTimeInput('2026-06-01T00:30', 'UTC')).toBe('2026-06-01T00:30:00.000Z')
  })

  it('round-trips DST transitions', () => {
    const iso = parseZonedDateTimeInput('2026-07-05T12:30', 'America/New_York')
    expect(iso).toBe('2026-07-05T16:30:00.000Z')
    expect(formatZonedDateTimeInput(iso, 'America/New_York')).toBe('2026-07-05T12:30')
  })

  it('builds a full-day default window in the selected timezone', () => {
    const window = defaultGoalWindow('Asia/Kolkata', new Date('2026-06-01T00:30:00.000Z'))
    expect(window).toEqual({ start: '2026-06-01T00:00', end: '2026-06-01T23:59' })
    expect(parseZonedDateTimeInput(window.start, 'Asia/Kolkata')).toBe('2026-05-31T18:30:00.000Z')
    expect(parseZonedDateTimeInput(window.end, 'Asia/Kolkata')).toBe('2026-06-01T18:29:00.000Z')
  })

  it('returns null for invalid input', () => {
    expect(parseZonedDateTimeInput('', 'UTC')).toBeNull()
    expect(parseZonedDateTimeInput('nope', 'UTC')).toBeNull()
    expect(formatZonedDateTimeInput(null, 'UTC')).toBe('')
  })
})
