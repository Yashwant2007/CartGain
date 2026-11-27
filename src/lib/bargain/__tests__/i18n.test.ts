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
      'terminal_expired', 'terminal_abandoned', 'opt_out', 'human_support',
      'negotiate', 'dealTitle', 'skip', 'aiPowered', 'attemptsLeft',
      'connecting', 'assistant', 'notice', 'offered', 'typeOffer',
      'sessionEnded', 'acceptDeal', 'dealComplete', 'youSaved', 'newPrice',
      'copy', 'codeApply', 'optOutMsg',
      'offersRemaining', 'sendOffer', 'addToCart', 'offerEnded',
      'checking', 'tryAgain',
    ] as const
    // Keys guaranteed translated in every supported language (Hinglish reuses
    // some English loanwords like "copy"/"AI-powered", so those are excluded).
    const mustDiffer = [
      'farewell_friendly', 'farewell_strict', 'farewell_playful',
      'attempts_exhausted', 'terminal_accepted', 'terminal_rejected',
      'terminal_expired', 'terminal_abandoned', 'opt_out', 'human_support',
      'negotiate', 'dealTitle', 'skip', 'attemptsLeft', 'typeOffer',
      'acceptDeal', 'youSaved', 'newPrice', 'optOutMsg',
      'offersRemaining', 'sendOffer', 'addToCart', 'offerEnded', 'checking', 'tryAgain',
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

describe('localized widget chrome keys', () => {
  const chromeKeys = [
    'dealAgreed', 'dealClosed', 'dealAtGlance', 'yourNegotiation',
    'todaysGoal', 'goalCloses', 'thisStoreRuns', 'jumpToLatest',
    'dismiss', 'close', 'thisItem', 'viewPlans', 'dealAgreedAt',
  ] as const

  it('keeps English defaults identical to the previous hard-coded chrome', () => {
    expect(uiText('en', 'dealAgreed')).toBe('Deal agreed')
    expect(uiText('en', 'dealClosed')).toBe('Deal closed')
    expect(uiText('en', 'dealAtGlance')).toBe('Deal at a glance')
    expect(uiText('en', 'yourNegotiation')).toBe('Your negotiation')
    expect(uiText('en', 'todaysGoal')).toBe("Today's goal")
    expect(uiText('en', 'goalCloses', { time: '5:30 PM' })).toBe('closes 5:30 PM')
    expect(uiText('en', 'thisStoreRuns', { persona: 'Friendly' })).toBe('This store runs: Friendly')
    expect(uiText('en', 'jumpToLatest', { n: 3 })).toBe('Jump to latest (3)')
    expect(uiText('en', 'dismiss')).toBe('Dismiss')
    expect(uiText('en', 'close')).toBe('Close')
    expect(uiText('en', 'thisItem')).toBe('This item')
    expect(uiText('en', 'viewPlans')).toBe('View plans & limits')
    expect(uiText('en', 'dealAgreedAt', { price: '₹450' })).toBe('Deal agreed at ₹450')
  })

  it('defines every chrome key for every supported language', () => {
    for (const lang of I18N_LANGS) {
      for (const key of chromeKeys) {
        const value = uiText(lang, key, { persona: 'Friendly', n: 2, time: '5:30 PM', price: '₹450' })
        expect(value.length).toBeGreaterThan(0)
        expect(value).not.toBe(key)
        expect(value).not.toContain('{')
      }
    }
  })

  it('localizes the jump and store-running labels', () => {
    expect(uiText('hi', 'jumpToLatest', { n: 2 })).toBe('नवीनतम पर जाएँ (2)')
    expect(uiText('hinglish', 'thisStoreRuns', { persona: 'Strict' })).toBe('Yeh store chala raha hai: Strict')
  })
})

describe('storefront expansion keys', () => {
  const expansionKeys = [
    'inviteSmartCopy', 'inviteSmartCta', 'invitePlayfulCopy', 'invitePlayfulCta',
    'inviteUnlockCopy', 'inviteUnlockCta', 'inviteHumanCopy', 'inviteHumanCta',
    'invitePremiumHeadline', 'invitePremiumSubtitle', 'inviteQuickReply', 'inviteNoPressure', 'inviteSmartDeals',
    'recoMatches', 'recoOverBudget', 'recoUnavailable', 'recoView', 'recoAdd',
    'recoNotForMe', 'recoDismiss', 'recoAriaLabel', 'retentionSavedTitle',
    'checkoutAtPrice', 'offerDetected', 'pressEnterToSend', 'nameYourPriceHint',
    'conversationLabel', 'delivered', 'sending', 'sendingDots', 'offerTag',
    'counterTag', 'yourOfferOrMessage', 'dealAcceptedBanner', 'youSavedPercent',
    'creatingCode', 'createDiscountCode', 'goToCheckout', 'negotiationEndedTitle',
    'noDealThisTime', 'continueToCheckout', 'tryAgainShort', 'priceNegotiation',
    'checkingYourOffer', 'dealLocked', 'noHardFeelings', 'tellMeYourPrice',
    'generating', 'sendMessage', 'skipFullPrice', 'skipNegotiation',
    'negotiating', 'attemptsLeftLabel',
  ] as const

  it('defines every expansion key in English', () => {
    for (const key of expansionKeys) {
      expect(uiText('en', key, { n: 2, product: 'Item', price: '₹100', x: '₹50', m: 3 }).length).toBeGreaterThan(0)
    }
  })

  it('falls back to English for expansion keys when a language has no translation', () => {
    expect(uiText('ta', 'checkoutAtPrice')).toBe('Checkout at your price')
    expect(uiText('bn', 'createDiscountCode')).toBe('Create My Discount Code')
  })

  it('localizes invitation and recommendation labels where translations exist', () => {
    expect(uiText('hi', 'inviteSmartCta')).toBe('ऑफ़र करें')
    expect(uiText('hinglish', 'inviteSmartCta')).toBe('Offer karein')
    expect(uiText('hi', 'recoMatches', { n: 2 })).toBe('2 बेहतर विकल्प मिले')
    expect(uiText('hinglish', 'recoMatches', { n: 2 })).toBe('2 behtar options mile')
  })
})