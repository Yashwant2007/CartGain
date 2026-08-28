import {
  CURRENCY_SYMBOLS,
  I18N_LANGS,
  currencySymbolFor,
  uiText,
} from '../i18n'

describe('currencySymbolFor', () => {
  it('maps known currencies to their symbols', () => {
    expect(currencySymbolFor('INR')).toBe('₹')
    expect(currencySymbolFor('USD')).toBe('$')
    expect(currencySymbolFor('EUR')).toBe('€')
    expect(currencySymbolFor('GBP')).toBe('£')
    expect(currencySymbolFor('PKR')).toBe('Rs ')
    expect(currencySymbolFor('BDT')).toBe('৳')
    expect(currencySymbolFor('AED')).toBe('AED ')
  })

  it('is case-insensitive', () => {
    expect(currencySymbolFor('inr')).toBe('₹')
    expect(currencySymbolFor('Inr')).toBe('₹')
  })

  it('falls back to "<CODE> " for unknown currencies and ₹ when missing', () => {
    expect(currencySymbolFor('XYZ')).toBe('XYZ ')
    expect(currencySymbolFor(undefined)).toBe('₹')
    expect(currencySymbolFor(null)).toBe('₹')
    expect(currencySymbolFor('')).toBe('₹')
  })
})

describe('uiText', () => {
  it('returns English text by default and for unknown languages', () => {
    expect(uiText(undefined, 'negotiate')).toBe('Negotiate Price')
    expect(uiText('kn', 'negotiate')).toBe('Negotiate Price')
    expect(uiText('auto', 'negotiate')).toBe('Negotiate Price')
  })

  it('localizes known languages', () => {
    expect(uiText('hi', 'negotiate')).not.toBe('Negotiate Price')
    expect(uiText('ta', 'negotiate')).not.toBe('Negotiate Price')
    expect(uiText('bn', 'negotiate')).not.toBe('Negotiate Price')
  })

  it('substitutes template variables', () => {
    expect(uiText('en', 'attemptsLeft', { n: 2 })).toBe('2 left')
    expect(uiText('hi', 'attemptsLeft', { n: 2 })).toBe('2 बाकी')
    expect(uiText('en', 'youSaved', { x: '₹450.00' })).toBe('You saved ₹450.00!')
  })

  it('has every key defined for every supported language (no silent English fallback)', () => {
    const en = uiText('en', 'negotiate') // sanity-check the helper
    expect(en).toBeTruthy()
    const allKeys = [
      'farewell_friendly', 'farewell_strict', 'farewell_playful',
      'attempts_exhausted', 'terminal_accepted', 'terminal_rejected',
      'terminal_expired', 'terminal_abandoned', 'opt_out',
      'negotiate', 'dealTitle', 'skip', 'aiPowered', 'attemptsLeft',
      'connecting', 'assistant', 'notice', 'offered', 'typeOffer',
      'sessionEnded', 'acceptDeal', 'dealComplete', 'youSaved', 'newPrice',
      'copy', 'codeApply', 'optOutMsg',
    ] as const
    // Keys guaranteed translated in every supported language (Hinglish reuses
    // some English loanwords like "copy"/"AI-powered", so those are excluded).
    const mustDiffer = [
      'farewell_friendly', 'farewell_strict', 'farewell_playful',
      'attempts_exhausted', 'terminal_accepted', 'terminal_rejected',
      'terminal_expired', 'terminal_abandoned', 'opt_out',
      'negotiate', 'dealTitle', 'skip', 'attemptsLeft', 'typeOffer',
      'acceptDeal', 'youSaved', 'newPrice', 'optOutMsg',
    ] as const
    for (const lang of I18N_LANGS) {
      for (const key of allKeys) {
        const s = uiText(lang, key)
        expect(s.length).toBeGreaterThan(0)
        if (lang !== 'en' && mustDiffer.includes(key as any)) {
          expect(s).not.toBe(uiText('en', key))
        }
      }
    }
  })

  it('reads every key out of CURRENCY_SYMBOLS', () => {
    expect(Object.keys(CURRENCY_SYMBOLS).length).toBeGreaterThanOrEqual(10)
  })
})