import { applyShopkeeperPersonality, defaultsUpdate, fromDb, publishedPersonality, sanitizeExperience, toDbUpdate } from '../config'
import { enginePersonaFor, resolveShopkeeperPersonality } from '../personality'
import { expressionForEvent } from '../expressions'
import { DEFAULT_BARGAIN_EXPERIENCE } from '../types'
import { buildSystemPrompt } from '../../../services/bargain'

describe('bargain experience config', () => {
  it('falls back to the safe default when no config exists', () => {
    expect(fromDb(null, 'published')).toEqual(DEFAULT_BARGAIN_EXPERIENCE)
  })

  it('sanitizes arbitrary merchant input', () => {
    const exp = sanitizeExperience({
      personality: 'evil_genie',
      designVariant: 'not-a-design',
      avatarEnabled: 'yes',
      motionEnabled: false,
      localeMode: 'en-IN',
      customGreeting: '  Name your price  ',
      ctaLabel: null,
      accentColor: 'javascript:alert(1)',
      avatarSize: 'huge',
      compact: true,
      position: 'top-right',
      draftVersion: -4,
      publishedVersion: 12,
    })
    expect(exp.personality).toBe('friendly_shopkeeper')
    expect(exp.designVariant).toBe('smart-assistant')
    expect(exp.avatarEnabled).toBe(true)
    expect(exp.motionEnabled).toBe(false)
    expect(exp.customGreeting).toBe('Name your price')
    expect(exp.accentColor).toBeNull()
    expect(exp.avatarSize).toBe('md')
    expect(exp.position).toBe('bottom-right')
    expect(exp.draftVersion).toBe(1)
    expect(exp.publishedVersion).toBe(12)
  })

  it('keeps draft edits out of the published snapshot', () => {
    const raw = { experienceDraftVersion: 3, experiencePublishedVersion: 7 }
    const update = toDbUpdate(
      { personality: 'playful_shopkeeper', designVariant: 'unlock-your-deal' },
      'draft',
      raw,
    )
    expect(update.experienceDraft.personality).toBe('playful_shopkeeper')
    expect(update.experienceDraftVersion).toBe(4)
    expect(update.experiencePublished).toBeUndefined()
    expect(update.shopkeeperPersonality).toBeUndefined()
  })

  it('publishes the draft and mirrors the legacy flat columns', () => {
    const raw = { experienceDraftVersion: 3, experiencePublishedVersion: 7 }
    const update = toDbUpdate(
      { personality: 'strict_shopkeeper', designVariant: 'human-shopkeeper', customGreeting: 'Talk price?' },
      'publish',
      raw,
    )
    expect(update.experiencePublished.personality).toBe('strict_shopkeeper')
    expect(update.experiencePublishedVersion).toBe(8)
    expect(update.shopkeeperPersonality).toBe('strict_shopkeeper')
    expect(update.invitationDesign).toBe('human-shopkeeper')
    expect(update.invitationGreeting).toBe('Talk price?')
  })

  it('reads the published personality for negotiation, not the draft', () => {
    const config = {
      shopkeeperPersonality: 'friendly_shopkeeper',
      experiencePublished: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'strict_shopkeeper' },
      experienceDraft: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'playful_shopkeeper' },
    }
    expect(publishedPersonality(config)).toBe('strict_shopkeeper')
  })

  it('preserves the legacy aiPersona until an experience is published', () => {
    expect(fromDb({ aiPersona: 'strict_negotiator' }, 'published').personality).toBe('strict_shopkeeper')
    expect(fromDb({ aiPersona: 'playful_friend' }, 'draft').personality).toBe('playful_shopkeeper')
    expect(fromDb({ aiPersona: 'strict_negotiator', experiencePublished: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'friendly_shopkeeper' } }, 'published').personality).toBe('friendly_shopkeeper')
  })

  it('publishes a personality chosen from the main config tab', () => {
    const raw = {
      shopkeeperPersonality: 'friendly_shopkeeper',
      aiPersona: 'friendly_shopkeeper',
      experienceDraftVersion: 3,
      experiencePublishedVersion: 7,
      experienceDraft: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'friendly_shopkeeper' },
      experiencePublished: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'friendly_shopkeeper' },
    }
    const update = applyShopkeeperPersonality(raw, 'strict_shopkeeper')
    expect(update.shopkeeperPersonality).toBe('strict_shopkeeper')
    expect(update.aiPersona).toBe('strict_negotiator')
    expect(update.experiencePublished.personality).toBe('strict_shopkeeper')
    expect(update.experiencePublishedVersion).toBe(8)
    expect(update.experienceDraft.personality).toBe('strict_shopkeeper')
    expect(update.experienceDraftVersion).toBe(4)
  })

  it('does not churn experience versions when the personality is unchanged', () => {
    const config = {
      experienceDraftVersion: 3,
      experiencePublishedVersion: 7,
      experienceDraft: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'playful_shopkeeper' },
      experiencePublished: { ...DEFAULT_BARGAIN_EXPERIENCE, personality: 'playful_shopkeeper' },
    }
    const update = applyShopkeeperPersonality(config, 'playful_shopkeeper')
    expect(update.shopkeeperPersonality).toBe('playful_shopkeeper')
    expect(update.aiPersona).toBe('playful_friend')
    expect(update.experiencePublished).toBeUndefined()
    expect(update.experienceDraft).toBeUndefined()
  })

  it('restores defaults in both channels', () => {
    const update = defaultsUpdate({ experienceDraftVersion: 4, experiencePublishedVersion: 9 })
    expect(update.experienceDraftVersion).toBe(5)
    expect(update.experiencePublishedVersion).toBe(10)
    expect(update.shopkeeperPersonality).toBe('friendly_shopkeeper')
    expect(update.experiencePublished.personality).toBe('friendly_shopkeeper')
  })
})

describe('shopkeeper personality mapping', () => {
  it('maps new personalities to the existing engine personas', () => {
    expect(enginePersonaFor('friendly_shopkeeper')).toBe('friendly_shopkeeper')
    expect(enginePersonaFor('strict_shopkeeper')).toBe('strict_negotiator')
    expect(enginePersonaFor('playful_shopkeeper')).toBe('playful_friend')
  })

  it('respects a configured personality and migrates legacy personas', () => {
    expect(resolveShopkeeperPersonality('playful_shopkeeper', 'strict_negotiator')).toBe('playful_shopkeeper')
    expect(resolveShopkeeperPersonality(undefined, 'strict_negotiator')).toBe('strict_shopkeeper')
    expect(resolveShopkeeperPersonality(undefined, 'playful_friend')).toBe('playful_shopkeeper')
    expect(resolveShopkeeperPersonality('nonsense', 'friendly_shopkeeper')).toBe('friendly_shopkeeper')
  })

  it('adds personality guidance to the system prompt', () => {
    const prompt = buildSystemPrompt({
      storeName: 'Test',
      originalPrice: 1000,
      minPrice: 700,
      currencySymbol: '₹',
      persona: 'playful_friend',
      shopkeeperPersonality: 'playful_shopkeeper',
    } as any, {
      intent: 'offer',
      priceComplaint: false,
      bid: 800,
      walkout: false,
      urgency: false,
      comparison: false,
      bundleRequested: false,
      repeatedMessage: false,
      repeatedKind: null,
      mentionedCompetitor: false,
      asksPolicy: false,
      asksShipping: false,
      asksWarranty: false,
      asksReturns: false,
      asksAboutProduct: false,
      asksAboutStock: false,
      asksForDiscount: true,
      asksForFreeShipping: false,
      asksForPaymentPlan: false,
      asksForCoupon: false,
      asksForBestPrice: false,
      signals: {},
    } as any)
    expect(prompt).toContain('SHOPKEEPER PERSONALITY: Playful')
  })
})

describe('avatar expression mapping', () => {
  it('maps the same event differently per personality', () => {
    expect(expressionForEvent('friendly_shopkeeper', 'OFFER_REJECTED')).toBe('disappointed')
    expect(expressionForEvent('strict_shopkeeper', 'OFFER_REJECTED')).toBe('declining')
    expect(expressionForEvent('playful_shopkeeper', 'OFFER_REJECTED')).toBe('amused')
  })

  it('celebrates accepted offers and surfaces errors', () => {
    for (const p of ['friendly_shopkeeper', 'strict_shopkeeper', 'playful_shopkeeper'] as const) {
      expect(expressionForEvent(p, 'OFFER_ACCEPTED')).toBe('celebrating')
      expect(expressionForEvent(p, 'API_ERROR')).toBe('error')
    }
  })
})
