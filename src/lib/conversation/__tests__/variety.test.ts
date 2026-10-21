import { hashString, isWithinQuietHours, nextAllowedSendTime, pickIndex, pickVariant } from '../variety'

describe('stable selection', () => {
  it('hashes deterministically', () => {
    expect(hashString('cart-1:email:0')).toBe(hashString('cart-1:email:0'))
    expect(hashString('cart-1:email:0')).not.toBe(hashString('cart-1:email:1'))
  })

  it('returns the same variant for the same seed', () => {
    const variants = ['a', 'b', 'c']
    expect(pickVariant('seed', variants)).toBe(pickVariant('seed', variants))
  })

  it('stays inside the array', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const index = pickIndex(seed, 3)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(3)
    }
  })

  it('returns undefined for an empty list', () => {
    expect(pickVariant('seed', [])).toBeUndefined()
  })
})

describe('quiet hours', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 9, 21, hour, 0, 0))

  it('is off when not configured', () => {
    expect(isWithinQuietHours(at(2), null)).toBe(false)
  })

  it('handles a same-day window', () => {
    const quiet = { start: 9, end: 17 }
    expect(isWithinQuietHours(at(8), quiet)).toBe(false)
    expect(isWithinQuietHours(at(9), quiet)).toBe(true)
    expect(isWithinQuietHours(at(16), quiet)).toBe(true)
    expect(isWithinQuietHours(at(17), quiet)).toBe(false)
  })

  it('handles a window that crosses midnight', () => {
    const quiet = { start: 22, end: 7 }
    expect(isWithinQuietHours(at(23), quiet)).toBe(true)
    expect(isWithinQuietHours(at(2), quiet)).toBe(true)
    expect(isWithinQuietHours(at(6), quiet)).toBe(true)
    expect(isWithinQuietHours(at(7), quiet)).toBe(false)
    expect(isWithinQuietHours(at(12), quiet)).toBe(false)
  })

  it('treats an empty window as disabled', () => {
    expect(isWithinQuietHours(at(3), { start: 5, end: 5 })).toBe(false)
  })

  it('computes the next allowed send time after the window', () => {
    const next = nextAllowedSendTime(at(23), { start: 22, end: 7 })
    expect(next).not.toBeNull()
    expect(next!.toISOString()).toBe('2026-10-22T07:00:00.000Z')
  })

  it('returns null when sending is already allowed', () => {
    expect(nextAllowedSendTime(at(12), { start: 22, end: 7 })).toBeNull()
  })
})
