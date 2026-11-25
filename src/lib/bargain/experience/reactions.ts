import { isConversationState } from '../conversation-state'
import { classifyShopperCue } from './shopper-cues'
import type { AvatarState } from './avatar-state'
import type { ExpressionState } from './expressions'
import type { ShopkeeperPersonality } from './types'
import type { V2AvatarVariant } from './v2-shopkeepers'

export const V2_REACTIONS = [
  {
    id: 'lowball',
    label: 'Lowball',
    trigger: 'Shopper names a price far below the listed price',
    example: '₹50 is all I can do.',
    response: 'That is below what I can do — let me show you the real value.',
    expression: 'skeptical',
    state: 'surprised',
    sheet: 'a',
    position: '0% 0%',
  },
  {
    id: 'counter',
    label: 'Counter',
    trigger: 'Shopper makes a realistic counter-offer',
    example: 'Can you do ₹800?',
    response: 'I can work with that. Here is where we can meet.',
    expression: 'negotiating',
    state: 'negotiating',
    sheet: 'a',
    position: '100% 0%',
  },
  {
    id: 'rude',
    label: 'Rude',
    trigger: 'Shopper is insulting or aggressive',
    example: 'This is such a scam.',
    response: 'I want to help, but let us keep this respectful.',
    expression: 'warning',
    state: 'confused',
    sheet: 'a',
    position: '0% 100%',
  },
  {
    id: 'flattery',
    label: 'Flattery',
    trigger: 'Shopper thanks or compliments the shopkeeper',
    example: "You've been really helpful, thank you!",
    response: 'Thank you, that means a lot. Let me make this easy for you.',
    expression: 'impressed',
    state: 'happy',
    sheet: 'a',
    position: '100% 100%',
  },
  {
    id: 'hesitation',
    label: 'Hesitation',
    trigger: 'Shopper is thinking it over or unsure',
    example: 'Let me think about it.',
    response: 'Take your time. I can explain the details while you decide.',
    expression: 'uncertain',
    state: 'confused',
    sheet: 'b',
    position: '0% 0%',
  },
  {
    id: 'walk_away',
    label: 'Walk-away',
    trigger: 'Shopper says they are leaving or not interested',
    example: "Forget it, I'm leaving.",
    response: 'No problem at all — the offer stays here if you return.',
    expression: 'disappointed',
    state: 'disappointed',
    sheet: 'b',
    position: '100% 0%',
  },
  {
    id: 'deal',
    label: 'Deal',
    trigger: 'Shopper accepts the price or opens checkout',
    example: "I'll take it.",
    response: 'Deal — let me lock that price for you.',
    expression: 'celebrating',
    state: 'celebrating',
    sheet: 'b',
    position: '0% 100%',
  },
  {
    id: 'extras',
    label: 'Extras',
    trigger: 'Questions, alternatives and every other chat',
    example: 'What is it made of?',
    response: 'Happy to help. Here is what you need to know.',
    expression: 'curious',
    state: 'recommending',
    sheet: 'b',
    position: '100% 100%',
  },
] as const

export type BargainReaction = (typeof V2_REACTIONS)[number]['id']
export type ReactionSheet = 'a' | 'b'

export const REACTION_EXPRESSION: Record<BargainReaction, ExpressionState> = {
  lowball: 'skeptical',
  counter: 'negotiating',
  rude: 'warning',
  flattery: 'impressed',
  hesitation: 'uncertain',
  walk_away: 'disappointed',
  deal: 'celebrating',
  extras: 'curious',
}

export const REACTION_STATE: Record<BargainReaction, AvatarState> = {
  lowball: 'surprised',
  counter: 'negotiating',
  rude: 'confused',
  flattery: 'happy',
  hesitation: 'confused',
  walk_away: 'disappointed',
  deal: 'celebrating',
  extras: 'recommending',
}

const SHEET_BY_VARIANT: Record<V2AvatarVariant, Record<ReactionSheet, string>> = {
  morgan: {
    a: '/assets/shopkeepers/v2/reactions/morgan-reactions-a.png',
    b: '/assets/shopkeepers/v2/reactions/morgan-reactions-b.png',
  },
  riley: {
    a: '/assets/shopkeepers/v2/reactions/riley-reactions-a.png',
    b: '/assets/shopkeepers/v2/reactions/riley-reactions-b.png',
  },
  alex: {
    a: '/assets/shopkeepers/v2/reactions/alex-reactions-a.png',
    b: '/assets/shopkeepers/v2/reactions/alex-reactions-b.png',
  },
}

export function isBargainReaction(value: unknown): value is BargainReaction {
  return typeof value === 'string' && (V2_REACTIONS as readonly { id: string }[]).some((r) => r.id === value)
}

export function v2ReactionSheet(variant: V2AvatarVariant, sheet: ReactionSheet): string {
  return SHEET_BY_VARIANT[variant][sheet]
}

export function v2ReactionCell(reaction: BargainReaction): { sheet: ReactionSheet; position: string } {
  const cell = V2_REACTIONS.find((item) => item.id === reaction)
  return { sheet: cell?.sheet ?? 'b', position: cell?.position ?? '100% 100%' }
}

const REPLY_DECLINE_RE = /\b(can'?t|cannot|won'?t|not possible|impossible|below|no can do|not able|out of (?:my )?range)\b/i
const REPLY_FLATTERY_RE = /\b(thank you|thanks|appreciate|pleasure working|happy to help)\b/i
const REPLY_WARM_RE = /\b(congrat|deal done|deal is done|agreed|accepted|locked|perfect|great choice|enjoy|confirmed)\b/i
const REPLY_EXTRAS_RE = /\b(alternatives?|other options?|recommend|show you|here(?:'s| is) what|included|made of|shipping|material|detail|features?|question)\b/i
const REPLY_HESITATION_RE = /\b(take your time|let me think|while you decide|not sure|maybe|later|hmm)\b/i
const REPLY_COUNTER_RE = /\b(counter|meet me|work with|can do|could do|middle|final offer|last offer|split the difference)\b/i

function reactionForAiReply(reply: string): BargainReaction | null {
  const text = reply.trim()
  if (!text) return null
  if (REPLY_DECLINE_RE.test(text)) return 'lowball'
  if (REPLY_FLATTERY_RE.test(text)) return 'flattery'
  if (REPLY_WARM_RE.test(text)) return 'deal'
  if (REPLY_EXTRAS_RE.test(text)) return 'extras'
  if (REPLY_HESITATION_RE.test(text)) return 'hesitation'
  if (REPLY_COUNTER_RE.test(text)) return 'counter'
  return null
}

/**
 * Pick the visual reaction from the shopper's own words. This is presentation
 * only: it never changes the reply, the counter-offer or the floor.
 */
export function reactionForShopperMessage(
  message: string,
  originalPrice?: number | null,
  personality?: ShopkeeperPersonality,
): BargainReaction {
  const text = message.trim()
  if (!text) return 'extras'

  const cue = classifyShopperCue(text, originalPrice)
  if (cue === 'chat' && personality === 'friendly_shopkeeper') return 'flattery'
  if (cue === 'insult') return 'rude'
  if (cue === 'walkout') return 'walk_away'
  if (cue === 'purchase_ready') return 'deal'
  if (cue === 'flattery' || cue === 'joke') return 'flattery'
  if (cue === 'mash' || cue === 'hesitation') return 'hesitation'
  if (cue === 'lowball' || cue === 'complaint') return 'lowball'
  if (cue === 'counter') return 'counter'

  return 'extras'
}

export interface ReactionAnimationContext {
  customerMessage?: string | null
  aiReply?: string | null
  counterOffer?: number | null
  originalPrice?: number | null
  decision?: string | null
  ended?: string | null
  conversationState?: string | null
  hasRecommendations?: boolean
  checkoutStarted?: boolean
}

const DECISION_REACTION: Record<string, BargainReaction> = {
  counter: 'counter',
  accept: 'deal',
  reject: 'lowball',
}

/** Choose one bounded sprite cell from the event that actually just happened. */
export function reactionForAnimation(
  event: string,
  ctx: ReactionAnimationContext = {},
  personality?: ShopkeeperPersonality,
): BargainReaction | null {
  if (isConversationState(ctx.conversationState)) {
    if (ctx.conversationState === 'COMPLETED') return 'deal'
    if (['REJECTED', 'EXPIRED', 'CANCELLED'].includes(ctx.conversationState)) return 'walk_away'
    if (['CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED'].includes(ctx.conversationState)) return 'hesitation'
  }

  if (event === 'deal_accepted' || ctx.ended === 'accepted') return 'deal'
  if (event === 'checkout_started' || ctx.checkoutStarted) return 'deal'
  if (event === 'deal_rejected' || ctx.ended === 'rejected' || ctx.ended === 'abandoned') {
    return 'walk_away'
  }
  if (event === 'customer_message' && ctx.customerMessage) {
    return reactionForShopperMessage(ctx.customerMessage, ctx.originalPrice, personality)
  }
  if (event === 'counter_offer') return 'counter'

  const decisionReaction = ctx.decision ? DECISION_REACTION[ctx.decision] ?? null : null
  if (event === 'ai_reply' && decisionReaction) return decisionReaction
  if (event === 'ai_reply' && ctx.counterOffer != null && Number.isFinite(ctx.counterOffer)) return 'counter'
  if (event === 'recommendations_shown' || event === 'recommendation_selected') return 'extras'
  if (event === 'ai_reply' && ctx.hasRecommendations) return 'extras'
  if (event === 'ai_reply' && ctx.aiReply) {
    const fromReply = reactionForAiReply(ctx.aiReply)
    if (fromReply) return fromReply
  }
  if (event === 'ai_reply' && ctx.customerMessage) {
    return reactionForShopperMessage(ctx.customerMessage, ctx.originalPrice, personality)
  }

  return null
}
