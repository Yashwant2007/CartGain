import { estimateMrr } from '../metrics'

const d = (days: number): { start: Date; end: Date } => {
  const end = new Date('2026-09-09T00:00:00Z')
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return { start, end }
}

describe('estimateMrr', () => {
  it('ignores free / contact-sales plans and returns 0', () => {
    const { start, end } = d(30)
    expect(estimateMrr([{ plan: 'free', currentPeriodStart: start, currentPeriodEnd: end }])).toBe(0)
    expect(estimateMrr([{ plan: 'enterprise', currentPeriodStart: start, currentPeriodEnd: end }])).toBe(0)
  })

  it('counts growth + pro at monthly price for monthly billing', () => {
    const { start, end } = d(30)
    const mrr = estimateMrr([
      { plan: 'growth', currentPeriodStart: start, currentPeriodEnd: end },
      { plan: 'pro', currentPeriodStart: start, currentPeriodEnd: end },
    ])
    expect(mrr).toBe(1499 + 3999)
  })

  it('prices yearly plans at monthly equivalent price/12', () => {
    const { start, end } = d(365)
    expect(estimateMrr([{ plan: 'growth', currentPeriodStart: start, currentPeriodEnd: end }])).toBeCloseTo(1499 / 12, 2)
  })

  it('resolves legacy plan ids to their unified tier', () => {
    const { start, end } = d(30)
    expect(estimateMrr([{ plan: 'starter', currentPeriodStart: start, currentPeriodEnd: end }])).toBe(1499)
  })

  it('totals mixed monthly + yearly subscriptions', () => {
    const monthly = d(30)
    const yearly = d(365)
    const mrr = estimateMrr([
      { plan: 'growth', currentPeriodStart: monthly.start, currentPeriodEnd: monthly.end },
      { plan: 'pro', currentPeriodStart: yearly.start, currentPeriodEnd: yearly.end },
      { plan: 'free', currentPeriodStart: monthly.start, currentPeriodEnd: monthly.end },
    ])
    expect(mrr).toBeCloseTo(1499 + 3999 / 12, 2)
  })
})