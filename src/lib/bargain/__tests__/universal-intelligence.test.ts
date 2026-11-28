import {
  buildUniversalConversationState,
  canHandleDeterministically,
  composeUniversalDeterministicReply,
  universalPromptBlock,
} from '../universal-intelligence'
import { buildSessionMemory, countSessionMemorySignals, readSessionMemoryFromMessages } from '../session-memory'
import type { ProductContext } from '../product-context'

function product(over: Partial<ProductContext> = {}): ProductContext {
  return {
    productId: 'p1',
    variantId: null,
    title: 'Vitamin C Brightening Serum',
    vendor: 'Glow Labs',
    productType: 'Skincare',
    tags: ['vitamin c', 'brightening'],
    description: 'A lightweight daily serum with vitamin C.',
    descriptionSource: 'SHOPIFY_VERIFIED',
    variants: [],
    selectedVariant: null,
    price: 3499,
    compareAtPrice: null,
    currency: 'INR',
    available: true,
    inventoryStatus: 'in_stock',
    imageUrl: null,
    productUrl: null,
    activePromotions: [],
    merchantApprovedSellingPoints: ['lightweight daily vitamin C formula'],
    merchantDisallowedClaims: [],
    merchantFaq: [],
    lastSyncedAt: '',
    dataVersion: '1',
    fetchFailed: false,
    ...over,
  } as ProductContext
}

describe('universal conversation intelligence', () => {
  it('recognises a pop-culture reference without reading it as a price bid', () => {
    const state = buildUniversalConversationState({
      message: 'I am Batman 😎',
      persona: 'playful_friend',
      product: product(),
    })
    expect(state.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Batman', kind: 'fictional' }),
    ]))
    expect(state.intents.some((intent) => intent.name === 'social_reference')).toBe(true)
    expect(state.intents.some((intent) => intent.name === 'price_signal')).toBe(false)
    expect(state.mode).toBe('social_reference')

    const reply = composeUniversalDeterministicReply(state, { persona: 'playful_friend', product: product() })
    expect(reply?.reply).toMatch(/Batman entry noted/i)
    expect(reply?.reply).not.toMatch(/₹|price|discount|offer/i)
    expect(reply?.reply).not.toMatch(/viral|trending|bestseller/i)
  })

  it('handles sarcasm with warmth and no invented claim', () => {
    const state = buildUniversalConversationState({
      message: 'Sure, because everyone has unlimited money these days.',
      persona: 'friendly_shopkeeper',
      product: product(),
    })
    expect(state.emotion).toBe('playful')
    expect(canHandleDeterministically(state)).toBe(true)
    const reply = composeUniversalDeterministicReply(state, { persona: 'friendly_shopkeeper' })
    expect(reply?.reply).toMatch(/won't pretend money grows on trees/i)
    expect(reply?.reply).not.toMatch(/everyone|viral|trending|guarantee/i)
  })

  it('drops humour and stays clear when the shopper is frustrated', () => {
    const state = buildUniversalConversationState({
      message: 'I am frustrated, this is taking too long.',
      persona: 'playful_friend',
      product: product(),
    })
    expect(state.emotion).toBe('frustrated')
    expect(state.humorAllowed).toBe(false)
    const reply = composeUniversalDeterministicReply(state, { persona: 'playful_friend' })
    expect(reply?.reply).toMatch(/shouldn't feel like a runaround/i)
    expect(reply?.reply).not.toMatch(/[\uD83D][\uDE00-\uDE4F]|🎉|💯/)
    expect(reply?.sentiment).toBe('neutral')
  })

  it('uses structured memory to avoid repeating the same reference callback', () => {
    const state = buildUniversalConversationState({
      message: 'Batman again 😎',
      persona: 'friendly_shopkeeper',
      product: product(),
      history: [
        { role: 'customer', content: 'I am Batman 😎' },
        { role: 'ai', content: 'Batman entry noted' },
      ],
    })
    expect(state.memory.priorReferences).toContain('Batman')
    expect(state.memory.returningCustomer).toBe(true)
    const reply = composeUniversalDeterministicReply(state, { persona: 'friendly_shopkeeper' })
    expect(reply?.reply).toMatch(/again/i)
    expect(reply?.reply).toMatch(/one callback/i)
  })

  it('classifies product category and verified facts separately', () => {
    const state = buildUniversalConversationState({
      message: 'Do you think aliens use moisturiser?',
      persona: 'friendly_shopkeeper',
      product: product(),
    })
    expect(state.productCategory).toBe('skincare')
    expect(state.productFact).toContain('lightweight daily vitamin C formula')
    expect(state.intents.some((intent) => intent.name === 'price_signal')).toBe(false)
    const reply = composeUniversalDeterministicReply(state, { persona: 'friendly_shopkeeper', product: product() })
    expect(reply?.reply).toContain('verified detail')
    expect(reply?.reply).not.toMatch(/aliens use/i)
  })

  it('never handles terminal opt-out or human-support turns as ordinary chat', () => {
    const optOut = buildUniversalConversationState({
      message: 'STOP',
      intent: { optOutRequested: true } as never,
    })
    const human = buildUniversalConversationState({
      message: 'I want to speak to a human',
      intent: { needHumanSupport: true } as never,
    })
    expect(canHandleDeterministically(optOut)).toBe(false)
    expect(canHandleDeterministically(human)).toBe(false)
    expect(composeUniversalDeterministicReply(optOut)).toBeNull()
    expect(composeUniversalDeterministicReply(human)).toBeNull()
  })

  it('keeps the shared prompt bounded and free of internal price data', () => {
    const state = buildUniversalConversationState({
      message: 'Bhai, ye serum kaisa hai?',
      product: product(),
    })
    const prompt = universalPromptBlock(state)
    expect(prompt).toContain('UNIVERSAL CONVERSATION INTELLIGENCE')
    expect(prompt).toContain('never as evidence of a current trend')
    expect(prompt).toContain('category=skincare')
    expect(prompt).not.toContain('2799.20')
    expect(prompt).not.toContain('minimum')
  })

  it('restores cumulative session memory and counts repeated patterns', () => {
    const first = buildSessionMemory({
      intent: { need: 'gift for my sister', budget: 1200, objection: 'PRICE' } as never,
      signals: { name: 'Asha', emotion: 'hesitant', terse: false, verbose: false, reasking: false } as never,
      customerOfferTrend: 'falling',
      seriousness: 'serious',
      currencySymbol: '₹',
      offTopicCount: 1,
      concessionCount: 1,
    })
    const messages = [
      { role: 'ai', metadata: { sessionMemory: first, liveTurnMode: 'off_topic', decision: 'counter' } },
    ]
    const restored = readSessionMemoryFromMessages(messages)
    const signals = countSessionMemorySignals(messages, 'off_topic')
    const second = buildSessionMemory({
      intent: { need: null, budget: null, objection: null } as never,
      currencySymbol: '₹',
      prior: restored,
      offTopicCount: signals.offTopicCount,
      concessionCount: signals.concessionCount,
    })

    expect(restored?.name).toBe('Asha')
    expect(restored?.need).toBe('gift for my sister')
    expect(restored?.budget).toBe(1200)
    expect(second.need).toBe('gift for my sister')
    expect(second.budget).toBe(1200)
    expect(second.offTopicCount).toBe(2)
    expect(second.concessionCount).toBe(1)
    expect(second.pattern).toContain('drifted repeatedly')
  })
})
