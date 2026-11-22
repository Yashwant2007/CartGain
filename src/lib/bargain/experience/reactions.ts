import { analyzeIntent } from '../intent'
import { extractPrice } from '../text'
import { isConversationState } from '../conversation-state'
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

const RUDE_RE = /\b(idiot|stupid|dumb|scam|rip[\s-]?off|ripping me off|robber|thief|fraud|liar|bullshit|\bbs\b|trash|useless|waste of (?:my )?time|shut up|stop wasting|ridiculous|insult(?:ing)?|disgusting|bakwas|chap|loot|dhoka)\b/i
const FLATTERY_RE = /\b(thanks|thank you|appreciate|you(?:'re| are) (?:so |very |really )?(?:great|helpful|kind|awesome|amazing|wonderful|the best)|nice (?:one|job|work)|well done|love (?:this|it|you)|good (?:service|job)|you rock|superb|brilliant)\b/i
const COUNTER_RE = /\b(counter|meet me (?:at|in the middle)|i can do(?!\s+(?:₹|\d))|i'?ll do(?!\s+(?:₹|\d))|how about|what about|can you do|could you do|final offer|last offer|meet halfway|split the difference)\b/i

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

  const intent = analyzeIntent(text)
  if (RUDE_RE.test(text)) return 'rude'
  if (intent.intent === 'WALKOUT') return 'walk_away'
  if (intent.intent === 'PURCHASE_READY') return 'deal'
  if (FLATTERY_RE.test(text)) return 'flattery'
  if (intent.intent === 'PURCHASE_HESITATION') return 'hesitation'

  const offer = extractPrice(text)
  const ratio = offer != null && originalPrice != null && Number.isFinite(originalPrice) && originalPrice > 0
    ? offer / originalPrice
    : null
  if (ratio != null && ratio <= 0.6) return 'lowball'
  if (intent.priceComplaint || intent.intent === 'COMPARISON' || intent.intent === 'BUDGET_CONSTRAINT') return 'lowball'
  if (COUNTER_RE.test(text) || (ratio != null && ratio <= 0.95)) return 'counter'

  return 'extras'
}

export interface ReactionAnimationContext {
  customerMessage?: string | null
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

  if (event === 'deal_accepted' || ctx.ended === 'accepted') return 'deal'
  if (event === 'checkout_started') return 'deal'
  if (event === 'deal_rejected' || ctx.ended === 'rejected' || ctx.ended === 'abandoned') {
    return fromMessage && fromMessage !== 'extras' ? fromMessage : 'walk_away'
  }
  if (fromMessage && event !== 'customer_typing') return fromMessage
  if (event === 'counter_offer') return 'counter'

  return null
}
