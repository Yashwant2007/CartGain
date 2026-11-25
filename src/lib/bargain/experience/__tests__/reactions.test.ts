import { AVATAR_STATES } from '../avatar-state'
import { EXPRESSION_STATES } from '../expressions'
import { resolveShopkeeperAnimation } from '../living'
import {
  REACTION_EXPRESSION,
  REACTION_MOTION,
  REACTION_STATE,
  V2_REACTIONS,
  reactionForAnimation,
  reactionForShopperMessage,
  reactionForShopperReply,
  v2ReactionCell,
  v2ReactionSheet,
  type BargainReaction,
  type ReactionMotion,
} from '../reactions'

describe('bargain reactions from shopper chat', () => {
  it.each<[string, number | null, BargainReaction]>([
    ['₹50 is all I can do.', 1000, 'absurd'],
    ['Can you do ₹500?', 1000, 'lowball'],
    ['Can you do ₹800?', 1000, 'counter'],
    ['I saw it cheaper on Amazon', 1000, 'comparing'],
    ['This is such a scam.', 1000, 'rude'],
    ["You've been really helpful, thank you!", 1000, 'flattery'],
    ['Thanks a lot!', 1000, 'thanks'],
    ['Haha that is funny 😂', 1000, 'joke'],
    ['Hey there!', 1000, 'greeting'],
    ['Is this the 2026 model?', 1000, 'trend'],
    ['What is it made of?', 1000, 'question'],
    ['Do you have something else?', 1000, 'recommendation'],
    ['Let me think about it.', 1000, 'hesitation'],
    ['Sorry, what do you mean?', 1000, 'confused'],
    ['My budget is tight', 1000, 'budget'],
    ['Sorry, I meant ₹800.', 1000, 'apology'],
    ["Forget it, I'm leaving.", 1000, 'walk_away'],
    ["I'll take it.", 1000, 'deal'],
    ['This store looks nice.', 1000, 'extras'],
  ])('maps %s to %s', (message, originalPrice, expected) => {
    expect(reactionForShopperMessage(message, originalPrice)).toBe(expected)
  })

  it('treats a complaint about the listed price as a lowball without reading it as a bid', () => {
    expect(reactionForShopperMessage('714 is too much', 1000)).toBe('lowball')
  })

  it('maps the shopkeeper reply to cheerful and contextual reactions', () => {
    expect(reactionForShopperReply('Great question! Let me check that for you.')).toBe('flattery')
    expect(reactionForShopperReply("Sorry, I can't go below ₹900.")).toBe('lowball')
    expect(reactionForShopperReply('No problem, come back when you are ready.')).toBe('walk_away')
    expect(reactionForShopperReply('Done deal, I have reserved it for you.')).toBe('deal')
    expect(reactionForShopperReply('Take your time while you decide.')).toBe('hesitation')
    expect(reactionForShopperReply('You are welcome.')).toBe('thanks')
    expect(reactionForShopperReply('Here are two options.')).toBe('recommendation')
  })

  it('lets the shopkeeper reply add a reaction when the shopper cue is neutral', () => {
    const ctx = {
      customerMessage: 'What is it made of?',
      aiReply: 'Great question! It is cotton.',
      originalPrice: 1000,
    }
    expect(reactionForAnimation('ai_reply', ctx)).toBe('flattery')
    expect(reactionForAnimation('counter_offer', { ...ctx, aiReply: "I can't go lower than ₹920." })).toBe('lowball')
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

  it('gives every reaction a valid expression, body state and distinct motion hook', () => {
    const ids = V2_REACTIONS.map((reaction) => reaction.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(18)
    const motions = new Set<ReactionMotion>()
    for (const id of ids) {
      expect(EXPRESSION_STATES).toContain(REACTION_EXPRESSION[id])
      expect(AVATAR_STATES).toContain(REACTION_STATE[id])
      expect(REACTION_MOTION[id]).toBeTruthy()
      motions.add(REACTION_MOTION[id])
    }
    expect(motions.size).toBeGreaterThanOrEqual(10)
  })

  it('follows the shoppers words across thinking and reply events but not while typing', () => {
    expect(reactionForAnimation('customer_message', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBe('absurd')
    expect(reactionForAnimation('ai_thinking', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBe('absurd')
    expect(reactionForAnimation('ai_reply', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBe('absurd')
    expect(reactionForAnimation('customer_typing', { customerMessage: '₹50 is all I can do.', originalPrice: 1000 })).toBeNull()
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
