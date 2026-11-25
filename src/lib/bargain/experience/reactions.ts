import { isConversationState } from '../conversation-state'
import { extractPrice } from '../text'
import { classifyShopperCue } from './shopper-cues'
import type { AvatarState } from './avatar-state'
import type { ExpressionState } from './expressions'
import type { V2AvatarVariant } from './v2-shopkeepers'

export const V2_REACTIONS = [
  {
    id: 'lowball',
    label: 'Lowball',
    trigger: 'Shopper names a price below the listed price',
    example: 'Can you do ₹700?',
    response: 'That is below what I can do — let me show you the real value.',
    expression: 'skeptical',
    state: 'surprised',
    sheet: 'a',
    position: '0% 0%',
    motion: 'lean',
  },
  {
    id: 'absurd',
    label: 'Absurd offer',
    trigger: 'Shopper names a wildly unrealistic price',
    example: '₹50 is all I can do.',
    response: 'That is far below what I can do, but let me show you the value.',
    expression: 'surprised',
    state: 'surprised',
    sheet: 'a',
    position: '0% 0%',
    motion: 'pop',
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
    motion: 'lean',
  },
  {
    id: 'comparing',
    label: 'Comparing',
    trigger: 'Shopper compares the price with another store',
    example: 'I saw it cheaper on Amazon.',
    response: 'I understand — let us look at what is included here.',
    expression: 'focused',
    state: 'calculating',
    sheet: 'a',
    position: '100% 0%',
    motion: 'tilt',
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
    motion: 'shake',
  },
  {
    id: 'flattery',
    label: 'Flattery',
    trigger: 'Shopper compliments the shopkeeper',
    example: "You've been really helpful!",
    response: 'Thank you, that means a lot. Let me make this easy for you.',
    expression: 'impressed',
    state: 'happy',
    sheet: 'a',
    position: '100% 100%',
    motion: 'pop',
  },
  {
    id: 'thanks',
    label: 'Thank you',
    trigger: 'Shopper says thank you',
    example: 'Thanks a lot!',
    response: 'You are very welcome. Happy to help.',
    expression: 'happy',
    state: 'happy',
    sheet: 'a',
    position: '100% 100%',
    motion: 'nod',
  },
  {
    id: 'joke',
    label: 'Laughing',
    trigger: 'Shopper jokes or laughs',
    example: 'Haha that is funny 😂',
    response: 'Glad you liked that. Let us find a price you like too.',
    expression: 'amused',
    state: 'happy',
    sheet: 'a',
    position: '100% 100%',
    motion: 'bounce',
  },
  {
    id: 'greeting',
    label: 'Greeting',
    trigger: 'Shopper says hello',
    example: 'Hey there!',
    response: 'Hello! Tell me what you are looking for.',
    expression: 'happy',
    state: 'greeting',
    sheet: 'a',
    position: '100% 100%',
    motion: 'wave',
  },
  {
    id: 'trend',
    label: 'Trend talk',
    trigger: 'Shopper makes casual pop-culture or trend small talk',
    example: 'Is this the 2026 model?',
    response: 'Good question. Let us stick to the details that matter for this item.',
    expression: 'curious',
    state: 'recommending',
    sheet: 'b',
    position: '100% 100%',
    motion: 'tilt',
  },
  {
    id: 'question',
    label: 'Question',
    trigger: 'Shopper asks about the product or price',
    example: 'What is it made of?',
    response: 'Happy to help. Here is what you need to know.',
    expression: 'curious',
    state: 'recommending',
    sheet: 'b',
    position: '100% 100%',
    motion: 'lean',
  },
  {
    id: 'recommendation',
    label: 'Showing options',
    trigger: 'Shopper asks for alternatives or suggestions',
    example: 'Do you have something else?',
    response: 'Let me show you a few verified options.',
    expression: 'encouraging',
    state: 'recommending',
    sheet: 'b',
    position: '100% 100%',
    motion: 'present',
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
    motion: 'settle',
  },
  {
    id: 'confused',
    label: 'Confused',
    trigger: 'Shopper says they do not understand',
    example: "Sorry, what do you mean?",
    response: 'No problem — let me explain that more simply.',
    expression: 'uncertain',
    state: 'confused',
    sheet: 'b',
    position: '0% 0%',
    motion: 'tilt',
  },
  {
    id: 'budget',
    label: 'Budget',
    trigger: 'Shopper explains a budget constraint',
    example: 'My budget is tight.',
    response: 'I understand. Let me see what is possible within that.',
    expression: 'concerned',
    state: 'confused',
    sheet: 'b',
    position: '0% 0%',
    motion: 'settle',
  },
  {
    id: 'apology',
    label: 'Apology',
    trigger: 'Shopper apologises or corrects themselves',
    example: 'Sorry, I meant ₹800.',
    response: 'No worries at all. Let us continue.',
    expression: 'relieved',
    state: 'happy',
    sheet: 'a',
    position: '100% 100%',
    motion: 'nod',
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
    motion: 'recede',
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
    motion: 'celebrate',
  },
  {
    id: 'extras',
    label: 'Listening',
    trigger: 'Every other grounded chat message',
    example: 'I am just browsing right now.',
    response: 'Take a look. I am here if you want a deal.',
    expression: 'listening',
    state: 'recommending',
    sheet: 'b',
    position: '100% 100%',
    motion: 'listen',
  },
] as const

export type BargainReaction = (typeof V2_REACTIONS)[number]['id']
export type ReactionSheet = 'a' | 'b'
export type ReactionMotion =
  | 'listen' | 'settle' | 'pop' | 'shake' | 'nod' | 'bounce'
  | 'wave' | 'tilt' | 'lean' | 'present' | 'recede' | 'celebrate'

type ReactionDefinition = (typeof V2_REACTIONS)[number]
const REACTION_BY_ID = Object.fromEntries(V2_REACTIONS.map((reaction) => [reaction.id, reaction])) as Record<BargainReaction, ReactionDefinition>

export const REACTION_EXPRESSION: Record<BargainReaction, ExpressionState> = Object.fromEntries(
  V2_REACTIONS.map((reaction) => [reaction.id, reaction.expression]),
) as Record<BargainReaction, ExpressionState>

export const REACTION_STATE: Record<BargainReaction, AvatarState> = Object.fromEntries(
  V2_REACTIONS.map((reaction) => [reaction.id, reaction.state]),
) as Record<BargainReaction, AvatarState>

export const REACTION_MOTION: Record<BargainReaction, ReactionMotion> = Object.fromEntries(
  V2_REACTIONS.map((reaction) => [reaction.id, reaction.motion]),
) as Record<BargainReaction, ReactionMotion>

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
  const cell = REACTION_BY_ID[reaction]
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
  if (cue === 'greeting') return 'greeting'
  if (cue === 'gratitude') return 'thanks'
  if (cue === 'flattery') return 'flattery'
  if (cue === 'joke') return 'joke'
  if (cue === 'trend') return 'trend'
  if (cue === 'recommendation') return 'recommendation'
  if (cue === 'apology') return 'apology'
  if (cue === 'confusion') return 'confused'
  if (cue === 'mash' || cue === 'hesitation') return 'hesitation'
  if (cue === 'budget') return 'budget'
  if (cue === 'question') return 'question'

  const offer = extractPrice(text)
  const ratio = offer != null && originalPrice != null && Number.isFinite(originalPrice) && originalPrice > 0
    ? offer / originalPrice
    : null
  if ((cue === 'lowball' || cue === 'complaint') && ratio != null && ratio <= 0.25) return 'absurd'
  if (cue === 'lowball' || cue === 'complaint') return 'lowball'
  if (cue === 'comparison') return 'comparing'
  if (cue === 'counter') return 'counter'

  return 'extras'
}

const REPLY_DEAL_RE = /\b(deal|agreed|accepted|locked in|locked|confirmed|congratulations|congrats|great choice|done deal|enjoy it)\b/i
const REPLY_THANKS_RE = /\b(you(?:'re| are) welcome|thank you|thanks a lot|appreciate it|my pleasure)\b/i
const REPLY_JOKE_RE = /\b(haha|hehe|lol|lmao|joking|kidding|funny|hilarious|made you smile)\b/i
const REPLY_RECOMMEND_RE = /\b(here are|let me show|options|alternatives|recommend|suggest|other one)\b/i
const REPLY_CHEER_RE = /\b(great|glad|happy|delighted|awesome|wonderful|excellent|thank|thanks|appreciate|love|perfect|nice|well done)\b/i
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
  if (REPLY_THANKS_RE.test(text)) return 'thanks'
  if (REPLY_JOKE_RE.test(text)) return 'joke'
  if (REPLY_RECOMMEND_RE.test(text)) return 'recommendation'
  if (REPLY_CHEER_RE.test(text)) return 'flattery'
  if (REPLY_HESITATE_RE.test(text)) return 'hesitation'
  if (REPLY_OFFER_RE.test(text)) return 'counter'
  if (/\?/.test(text)) return 'question'
  return null
}

const STRONG_CUSTOMER_REACTIONS: ReadonlySet<BargainReaction> = new Set<BargainReaction>([
  'rude',
  'walk_away',
  'deal',
  'absurd',
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
