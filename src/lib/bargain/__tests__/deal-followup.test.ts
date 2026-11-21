import {
  normalizeDelays,
  dueStage,
  dealFollowupText,
  dealFollowupSubject,
  dealFollowupHtml,
  expiryIsNear,
  DEFAULT_DEAL_FOLLOWUP_DELAYS_MINUTES,
} from '../deal-followup'

describe('normalizeDelays', () => {
  it('defaults when input is missing', () => {
    expect(normalizeDelays(null)).toEqual([...DEFAULT_DEAL_FOLLOWUP_DELAYS_MINUTES])
  })
  it('sorts, dedupes and caps at max', () => {
    expect(normalizeDelays([180, 15, 15, 1200], 2)).toEqual([15, 180])
  })
  it('drops invalid values', () => {
    expect(normalizeDelays([0, -5, 30, 'x', 99999999])).toEqual([30])
  })
})

describe('dueStage', () => {
  const base = new Date('2026-01-01T00:00:00Z')
  const delays = [15, 180, 1200]
  it('returns null before the first delay', () => {
    expect(dueStage({ acceptedAt: base, now: new Date(base.getTime() + 5 * 60000), delays, sentStages: [] })).toBeNull()
  })
  it('returns the first due, unsent stage', () => {
    expect(dueStage({ acceptedAt: base, now: new Date(base.getTime() + 16 * 60000), delays, sentStages: [] })).toBe(0)
    expect(dueStage({ acceptedAt: base, now: new Date(base.getTime() + 16 * 60000), delays, sentStages: [0] })).toBeNull()
    expect(dueStage({ acceptedAt: base, now: new Date(base.getTime() + 200 * 60000), delays, sentStages: [0] })).toBe(1)
  })
  it('does not skip ahead past an unsent earlier stage', () => {
    expect(dueStage({ acceptedAt: base, now: new Date(base.getTime() + 1300 * 60000), delays, sentStages: [1] })).toBe(0)
  })
})

describe('copy', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  const ctx = {
    name: 'Priya',
    productTitle: 'Serum',
    storeName: 'GlowCo',
    currencySymbol: '₹',
    price: 950,
    url: 'https://cart-gain.com/r/abc',
    expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
  }
  it('greets by name and includes the price + link', () => {
    const t = dealFollowupText(0, ctx, now)
    expect(t).toContain('Priya')
    expect(t).toContain('₹950')
    expect(t).toContain('https://cart-gain.com/r/abc')
  })
  it('falls back to a neutral greeting without a name', () => {
    expect(dealFollowupText(0, { ...ctx, name: null }, now)).toContain('Hey there!')
  })
  it('mentions expiry only when a real expiry is near', () => {
    expect(expiryIsNear(ctx, now)).toBe(true)
    expect(dealFollowupText(2, ctx, now)).toMatch(/expire/i)
    expect(dealFollowupText(2, { ...ctx, expiresAt: null }, now)).not.toMatch(/expire|last call|hurry/i)
  })
  it('never uses last-call copy when expiry is unknown or far away', () => {
    for (const next of [
      { ...ctx, expiresAt: null },
      { ...ctx, expiresAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000) },
    ]) {
      expect(dealFollowupText(2, next, now)).not.toMatch(/last call|about to expire|hurry|buy now/i)
      expect(dealFollowupSubject(2, next, now)).not.toMatch(/last|expire/i)
      expect(dealFollowupHtml(2, next, now)).not.toMatch(/last call|expire soon/i)
    }
  })
  it('subjects are honest and stage-specific', () => {
    expect(dealFollowupSubject(0, ctx, now)).toMatch(/waiting/i)
    expect(dealFollowupSubject(1, ctx, now)).toMatch(/thinking/i)
    expect(dealFollowupSubject(2, ctx, now)).toMatch(/expire/i)
  })
  it('html escapes the store name and keeps the link', () => {
    const html = dealFollowupHtml(0, { ...ctx, storeName: '<b>x</b>' }, now)
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('https://cart-gain.com/r/abc')
  })
  it('html omits the CTA for an unsafe url', () => {
    const html = dealFollowupHtml(0, { ...ctx, url: 'javascript:alert(1)' }, now)
    expect(html).not.toContain('javascript:')
  })
})
