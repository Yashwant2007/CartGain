import { detectPressureLanguage, scrubPressureLanguage } from '../reply-safety'
import { retentionOffer } from '../engine'

describe('reply safety', () => {
  it('detects manufactured urgency and pressure', () => {
    for (const reply of [
      "Hurry, this price won't last!",
      'Last chance — buy now before it’s gone.',
      'Only today! Limited stock at this number.',
      'The price will reset after this chat.',
    ]) {
      expect(detectPressureLanguage(reply)).toBe(true)
    }
  })

  it('allows calm, truthful close language', () => {
    for (const reply of [
      'This is the final price I can honor.',
      'No rush at all — shall I lock it?',
      'Your code is available until Friday.',
    ]) {
      expect(detectPressureLanguage(reply)).toBe(false)
    }
  })

  it('replaces only the unsafe sentence and keeps the real offer', () => {
    const result = scrubPressureLanguage('I can do ₹850. Hurry, last chance! Want me to lock it?', 'No rush — shall I lock it?')
    expect(result.guarded).toBe(true)
    expect(result.reply).toContain('₹850')
    expect(result.reply).not.toMatch(/hurry|last chance/i)
    expect(result.reply).toContain('shall I lock it')
  })

  it('returns clean replies unchanged', () => {
    const result = scrubPressureLanguage('₹850 is a fair price — shall I lock it?', 'fallback')
    expect(result.guarded).toBe(false)
    expect(result.reply).toBe('₹850 is a fair price — shall I lock it?')
  })

  it('keeps the deterministic walkout retention calm', () => {
    for (const persona of ['friendly_shopkeeper', 'strict_negotiator', 'playful_friend'] as const) {
      const result = retentionOffer({
        originalPrice: 1000,
        minPrice: 800,
        currencySymbol: '₹',
        persona,
      } as any, 900)
      expect(detectPressureLanguage(result.reply)).toBe(false)
      expect(result.reply).not.toMatch(/please stay|wait wait/i)
    }
  })
})
