import { describe, expect, it } from '@jest/globals'
import {
  expressionForShopperMessage,
  expressionForTurn,
} from '../expressions'
import type { ShopkeeperPersonality } from '../types'

const PERSONALITIES: ShopkeeperPersonality[] = [
  'friendly_shopkeeper',
  'strict_shopkeeper',
  'playful_shopkeeper',
]

describe('persona-aware shopkeeper reactions', () => {
  it('reacts to a lowball differently for each personality', () => {
    expect(expressionForShopperMessage('friendly_shopkeeper', '₹200', 1000)).toBe('skeptical')
    expect(expressionForShopperMessage('strict_shopkeeper', '₹200', 1000)).toBe('skeptical')
    expect(expressionForShopperMessage('playful_shopkeeper', '₹200', 1000)).toBe('surprised')
  })

  it('reads a walkout threat before the reply', () => {
    expect(expressionForShopperMessage('friendly_shopkeeper', 'Forget it, I am leaving.', 1000)).toBe('disappointed')
    expect(expressionForShopperMessage('strict_shopkeeper', 'Forget it, I am leaving.', 1000)).toBe('declining')
    expect(expressionForShopperMessage('playful_shopkeeper', 'Forget it, I am leaving.', 1000)).toBe('skeptical')
  })

  it('reads price complaints and product questions', () => {
    expect(expressionForShopperMessage('friendly_shopkeeper', 'This is too expensive for me.', 1000)).toBe('listening')
    expect(expressionForShopperMessage('strict_shopkeeper', 'This is too expensive for me.', 1000)).toBe('skeptical')
    expect(expressionForShopperMessage('playful_shopkeeper', 'This is too expensive for me.', 1000)).toBe('amused')
    expect(expressionForShopperMessage('playful_shopkeeper', 'What material is this made of?', 1000)).toBe('curious')
  })

  it('recognises a buying signal', () => {
    for (const personality of PERSONALITIES) {
      expect(expressionForShopperMessage(personality, 'I will take it, let us do it.', 1000)).toBe('happy')
    }
  })

  it('shows the real outcome after a counter, accept, or reject', () => {
    expect(expressionForTurn('friendly_shopkeeper', { counterOffer: 900, decision: 'counter' })).toBe('negotiating')
    expect(expressionForTurn('strict_shopkeeper', { counterOffer: 900, decision: 'counter' })).toBe('negotiating')
    expect(expressionForTurn('playful_shopkeeper', { counterOffer: 900, decision: 'counter' })).toBe('surprised')

    for (const personality of PERSONALITIES) {
      expect(expressionForTurn(personality, { decision: 'accept', ended: 'accepted' })).toBe('celebrating')
    }

    expect(expressionForTurn('friendly_shopkeeper', { decision: 'reject', ended: 'rejected' })).toBe('disappointed')
    expect(expressionForTurn('strict_shopkeeper', { decision: 'reject', ended: 'rejected' })).toBe('declining')
    expect(expressionForTurn('playful_shopkeeper', { decision: 'reject', ended: 'abandoned' })).toBe('disappointed')
  })

  it('falls back to the reply tone when there is no price decision', () => {
    expect(expressionForTurn('friendly_shopkeeper', { aiReply: "I can't go that low." })).toBe('skeptical')
    expect(expressionForTurn('strict_shopkeeper', { aiReply: 'I cannot go lower than that.' })).toBe('declining')
  })
})
