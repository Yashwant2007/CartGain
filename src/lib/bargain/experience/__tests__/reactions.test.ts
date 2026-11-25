import { resolveShopkeeperAnimation } from '../living'
import {
  V2_REACTIONS,
  reactionForAnimation,
  reactionForShopperMessage,
  v2ReactionCell,
  v2ReactionSheet,
  type BargainReaction,
} from '../reactions'

describe('bargain reactions from shopper chat', () => {
  it.each<[string, number | null, BargainReaction]>([
    ['₹50 is all I can do.', 1000, 'lowball'],
    ['Can you do ₹800?', 1000, 'counter'],
    ['This is such a scam.', 1000, 'rude'],
    ["You've been really helpful, thank you!", 1000, 'flattery'],
    ['Let me think about it.', 1000, 'hesitation'],
    ["Forget it, I'm leaving.", 1000, 'walk_away'],
    ["I'll take it.", 1000, 'deal'],
    ['What is it made of?', 1000, 'extras'],
  ])('maps %s to %s', (message, originalPrice, expected) => {
    expect(reactionForShopperMessage(message, originalPrice)).toBe(expected)
  })

  it('treats a complaint about the listed price as a lowball without reading it as a bid', () => {
    expect(reactionForShopperMessage('714 is too much', 1000)).toBe('lowball')
  })

  it('has a distinct sprite cell for every reaction and keeps each avatar on their own sheets', () => {
    const positions = new Set<string>()
    for (const reaction of V2_REACTIONS) {
      const cell = v2ReactionCell(reaction.id)
      positions.add(`${cell.sheet}:${cell.position}`)
      for (const variant of ['morgan', 'riley', 'alex'] as const) {
        expect(v2ReactionSheet(variant, cell.sheet)).toContain(`${variant}-reactions-${cell.sheet}.png`)
      }
    }
    expect(positions.size).toBe(8)
  })

  it('reacts to the shopper message without reusing it for thinking and typing beats', () => {
    expect(reactionForAnimation('customer_message', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBe('lowball')
    expect(reactionForAnimation('ai_thinking', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBeNull()
    expect(reactionForAnimation('customer_typing', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBeNull()
  })

  it('derives distinct reply reactions from the real turn outcome and copy', () => {
    const customerMessage = '₹50 is all I can do.'
    expect(reactionForAnimation('ai_reply', { customerMessage, originalPrice: 1000, decision: 'counter' })).toBe('counter')
    expect(reactionForAnimation('ai_reply', { customerMessage, originalPrice: 1000, ended: 'accepted' })).toBe('deal')
    expect(reactionForAnimation('ai_reply', { customerMessage, originalPrice: 1000, aiReply: "That's below what I can do." })).toBe('lowball')
    expect(reactionForAnimation('ai_reply', { customerMessage, originalPrice: 1000, aiReply: 'Here is what is included and how shipping works.' })).toBe('extras')
    expect(reactionForAnimation('ai_reply', { customerMessage, originalPrice: 1000, aiReply: 'Take your time while you decide.' })).toBe('hesitation')
    expect(reactionForAnimation('ai_reply', { customerMessage, originalPrice: 1000, aiReply: 'Thank you, I appreciate it.' })).toBe('flattery')
  })

  it('uses a friendly avatar reaction for ordinary chat', () => {
    expect(reactionForAnimation('customer_message', { customerMessage: 'Hello there' }, 'friendly_shopkeeper')).toBe('flattery')
    expect(reactionForAnimation('customer_message', { customerMessage: 'Hello there' }, 'strict_shopkeeper')).toBe('extras')
  })

  it('lets a verified terminal conversation state override the chat reaction', () => {
    const animation = resolveShopkeeperAnimation('friendly_shopkeeper', 'customer_message', {
      customerMessage: 'Let me think about it.',
      conversationState: 'COMPLETED',
    })
    expect(animation.reaction).toBe('deal')
    const hesitation = resolveShopkeeperAnimation('friendly_shopkeeper', 'customer_message', {
      customerMessage: "I'll take it.",
      conversationState: 'CUSTOMER_HESITATION',
    })
    expect(hesitation.reaction).toBe('hesitation')
  })

  it('leaves the existing expression and body mapping untouched', () => {
    const animation = resolveShopkeeperAnimation('strict_shopkeeper', 'customer_message', {
      customerMessage: "Forget it, I'm leaving.",
      originalPrice: 1000,
    })
    expect(animation.reaction).toBe('walk_away')
    expect(animation.expression).toBe('declining')
    expect(animation.state).toBe('disappointed')
  })

  it('does not invent reactions for opening and error events', () => {
    expect(resolveShopkeeperAnimation('friendly_shopkeeper', 'greeting').reaction).toBeUndefined()
    expect(resolveShopkeeperAnimation('friendly_shopkeeper', 'error').reaction).toBeUndefined()
    expect(resolveShopkeeperAnimation('friendly_shopkeeper', 'deal_accepted').reaction).toBe('deal')
  })
})
