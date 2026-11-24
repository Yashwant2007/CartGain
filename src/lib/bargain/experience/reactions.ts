import { isConversationState } from '../conversation-state'
import { classifyShopperCue } from './shopper-cues'
import type { AvatarState } from './avatar-state'
import type { ExpressionState } from './expressions'
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

/**
 * Pick the visual reaction from the shopper's own words. This is presentation
 * only: it never changes the reply, the counter-offer or the floor.
 */
export function reactionForShopperMessage(
  message: string,
  originalPrice?: number | null,
): BargainReaction {
  const text = message.trim()
  if (!text) return 'extras'

  const cue = classifyShopperCue(text, originalPrice)
  if (cue === 'insult') return 'rude'
  if (cue === 'walkout') return 'walk_away'
  if (cue === 'purchase_ready') return 'deal'
  if (cue === 'flattery' || cue === 'gratitude' || cue === 'greeting' || cue === 'joke' || cue === 'trend') return 'flattery'
  if (cue === 'mash' || cue === 'hesitation' || cue === 'budget') return 'hesitation'
  if (cue === 'lowball' || cue === 'complaint') return 'lowball'
  if (cue === 'counter' || cue === 'comparison') return 'counter'

  return 'extras'
}

const REPLY_DEAL_RE = /\b(deal|agreed|accepted|locked in|locked|confirmed|congratulations|congrats|great choice|done deal|enjoy it)\b/i
const REPLY_CHEER_RE = /\b(great|glad|happy|delighted|awesome|wonderful|excellent|thank|thanks|appreciate|haha|lol|funny|joke|love|perfect|nice)\b/i
const REPLY_HESITATE_RE = /\b(maybe|not sure|take your time|think it over|hmm|while you decide)\b/i
const REPLY_DECLINE_RE = /\b(no problem|no worries|come back|change your mind|goodbye|totally understand|i understand)\b/i
const REPLY_FIRM_RE = /\b(can'?t|cannot|won'?t|not possible|impossible|below (?:what|my|that)|out of (?:my )?range|best i can do)\b/i
const REPLY_OFFER_RE = /\b(counter|price|offer|meet|middle|discount|final|₹|\$|rs\.?)\b/i

export function reactionForShopperReply(reply: string | null | undefined): BargainReaction | null {
  const text = reply?.trim()
  if (!text) return null
  if (REPLY_DEAL_RE.test(text)) return 'deal'
  if (REPLY_DECLINE_RE.test(text)) return 'walk_away'
  if (REPLY_FIRM_RE.test(text)) return 'lowball'
  if (REPLY_CHEER_RE.test(text)) return 'flattery'
  if (REPLY_HESITATE_RE.test(text)) return 'hesitation'
  if (REPLY_OFFER_RE.test(text)) return 'counter'
  if (/\?/.test(text)) return 'extras'
  return null
}

const STRONG_CUSTOMER_REACTIONS: ReadonlySet<BargainReaction> = new Set<BargainReaction>([
  'rude',
  'walk_away',
  'deal',
  'lowball',
])

export interface ReactionAnimationContext {
  customerMessage?: string | null
  aiReply?: string | null
  originalPrice?: number | null
  decision?: string | null
  ended?: string | null
  conversationState?: string | null
}

/** Keep the face attached to the shopper's words across the whole turn. */
export function reactionForAnimation(
  event: string,
  ctx: ReactionAnimationContext = {},
): BargainReaction | null {
  if (isConversationState(ctx.conversationState)) {
    if (ctx.conversationState === 'COMPLETED') return 'deal'
    if (['REJECTED', 'EXPIRED', 'CANCELLED'].includes(ctx.conversationState)) return 'walk_away'
    if (['CUSTOMER_HESITATION', 'HUMAN_SUPPORT_REQUIRED'].includes(ctx.conversationState)) return 'hesitation'
  }

  const fromMessage = ctx.customerMessage
    ? reactionForShopperMessage(ctx.customerMessage, ctx.originalPrice)
    : null
  const fromReply = event === 'ai_reply' || event === 'counter_offer'
    ? reactionForShopperReply(ctx.aiReply)
    : null

  if (event === 'deal_accepted' || ctx.ended === 'accepted') return 'deal'
  if (event === 'checkout_started') return 'deal'
  if (event === 'deal_rejected' || ctx.ended === 'rejected' || ctx.ended === 'abandoned') {
    return 'walk_away'
  }
  if (event !== 'customer_typing' && fromMessage && STRONG_CUSTOMER_REACTIONS.has(fromMessage)) return fromMessage
  if (fromReply) return fromReply
  if (fromMessage && event !== 'customer_typing') return fromMessage
  if (event === 'counter_offer') return 'counter'

  return null
}
