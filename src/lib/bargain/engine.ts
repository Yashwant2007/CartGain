// Pure, dependency-free bargain negotiation logic.
// Safe to import from client components (no Prisma, no OpenAI).
// Re-exported by services/bargain.ts for server-side use.

import type { LearningGuidance } from './learning/types'

export type Persona = 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'

export const SUPPORTED_LANGUAGES = ['auto', 'en', 'hinglish', 'hi', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or'] as const
export type BargainLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// ── AI Salesperson: dynamic strategy ─────────────────────────────────────────
// Strategy is chosen by the deterministic pacing layer (src/lib/bargain/goals.ts)
// and only ever nudges behaviour WITHIN the merchant's absolute floor. The
// floor itself is non-negotiable and enforced by the backend, never here.
export type BargainStrategy = 'CONSERVATIVE' | 'NORMAL' | 'AGGRESSIVE' | 'CLOSING'
export type GoalMode = 'ahead' | 'on_track' | 'behind' | 'idle'

export interface NegotiationGoalContext {
  strategy: BargainStrategy
  mode: GoalMode
  goalType: 'orders' | 'revenue'
  closesAt?: string // ISO instant the real goal window closes (truthful urgency)
  campaignName?: string
  campaignMessage?: string
  // ── Customer-visible progress for the widget's "Today's goal" strip ──
  // Populated only while the goal window is active. These are the REAL target
  // and the REAL ledger totals — never derived from (and never revealing) the
  // floor, margin, attempt budget or the internal pacing strategy.
  targetValue?: number
  achievedValue?: number
  orderCount?: number
  progressPercent?: number // 0–100
}

export interface NegotiationContext {
  storeName: string
  currencySymbol: string
  originalPrice: number
  minPrice: number
  attemptsUsed: number
  maxAttempts: number
  persona: Persona
  productTitle?: string
  customerContext?: string
  bulkQuantity?: number
  walkoutTriggered?: boolean
  language?: string
  goal?: NegotiationGoalContext
  /** Deterministic read of the customer's offer direction across the session
   *  (mirrors services/bargain). Drives the tactical pacing nudge. */
  customerOfferTrend?: 'new' | 'rising' | 'flat' | 'falling'
  /** Deterministic buyer-seriousness read (mirrors services/bargain). A genuine
   *  buyer earns a little more movement; a time-waster is held firmer. */
  seriousness?: 'serious' | 'casual' | 'time_waster'
  /** The AI's most recent standing counter in this session. Lets the reciprocal
   *  pacing be monotonic (a real shopkeeper does not RAISE a price mid-haggle)
   *  without ever needing the hidden floor. */
  lastCounter?: number | null
  /** How many absurd lowballs in a row the shopper has now thrown (including the
   *  current one). Lets the persona reply ESCALATE and stop repeating itself,
   *  instead of parroting the same joke line every turn. Callers with history
   *  set it; engines without it fall back to offer-based variation. */
  absurdStreak?: number
  /** Bounded, server-selected style guidance. Never contains the hidden floor. */
  learning?: LearningGuidance
}

export interface NegotiationResult {
  reply: string
  decision: 'accept' | 'counter' | 'reject' | 'welcome' | 'chat'
  counterOffer?: number
  tactic?: string
  sentiment?: string
  metadata?: Record<string, unknown>
}

// ── Graduated counter: near original early, near floor late ──
// Pacing bottoms out at `quotedFloor`, not `minPrice`. At full progress a raw
// curve would return the merchant's exact minimum, and the caller would then
// quote it to the customer — turning an internal threshold into a disclosed
// price. The true floor is reachable only by a customer making their own offer.
export function graduatedCounter(ctx: NegotiationContext): number {
  const { originalPrice, minPrice, attemptsUsed, maxAttempts } = ctx
  const progress = maxAttempts > 0 ? Math.min(1, Math.max(0, attemptsUsed / maxAttempts)) : 1
  const priceRange = originalPrice - minPrice
  const counter = originalPrice - priceRange * progress
  return Math.round(Math.max(quotedFloor(ctx), counter) * 100) / 100
}

// ── Tactical pacing: concede slowly, reward real interest ──
// The graduated curve above moves linearly, so the very first counter can already
// sit well below the listed price — it reads as a panic discount and gives away
// margin before the shopper has shown any real interest. `tacticalCounter` is
// deliberately CONVEX: early counters stay near the listed price and only bend
// toward the safe quote as rounds are actually spent, so the discount has to be
// earned. A deterministic interest read then nudges the number — a serious buyer
// gets a touch more movement, a time-waster is held firmer — and real upward
// movement in the shopper's own offers is rewarded. The result is always clamped
// to [quotedFloor, originalPrice]: pacing shapes the offer, it never breaches the
// floor-secrecy rule (the merchant's true minimum is never quoted).
export function tacticalProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return Math.round(Math.pow(clamped, 1.6) * 1e6) / 1e6
}

export function tacticalCounter(ctx: NegotiationContext): number {
  const { originalPrice, attemptsUsed, maxAttempts } = ctx
  const floor = quotedFloor(ctx)
  const range = originalPrice - floor
  if (range <= 0) return Math.round(floor * 100) / 100

  const rawProgress = maxAttempts > 0 ? attemptsUsed / maxAttempts : 1
  const progress = tacticalProgress(rawProgress)
  let counter = originalPrice - range * progress

  // Interest-aware nudge — reward engagement, hold against testing.
  if (ctx.seriousness === 'serious') counter -= range * progress * 0.08
  else if (ctx.seriousness === 'time_waster') counter += range * (1 - progress) * 0.12
  if (ctx.customerOfferTrend === 'rising') counter -= range * progress * 0.05

  return Math.round(Math.min(originalPrice, Math.max(floor, counter)) * 100) / 100
}

// ── Absurd offers get a PERSONA REPLY, never a counter ──
// An offer so far below the merchant's floor that treating it as a genuine bid
// would be theatre. The old engine "countered" these on the schedule, which did
// two bad things: (1) it rewarded a joke with a real price, and (2) it taught
// shoppers that patient lowballing walks the price down to the floor. Instead
// such a turn earns a persona-true reply with NO counter price.
//
// The reply ESCALATES across repeats so it reads like a live negotiator, not a
// looping script: the first joke gets light banter, a rising series of jokes gets
// acknowledged ("you're inching up"), and a sustained streak gets a firm,
// floor-safe ANCHOR (the quotable floor, always ABOVE the hidden minimum) so the
// shopper is handed a real price to work from instead of a dead end. The variant
// is picked deterministically from the offer value and the streak, so two
// identical requests always get identical copy (idempotent) while consecutive
// turns never repeat verbatim.
export function isAbsurdOffer(
  offer: number | null | undefined,
  ctx: Pick<NegotiationContext, 'minPrice' | 'originalPrice'>,
): boolean {
  if (offer == null || !Number.isFinite(offer) || offer <= 0) return true
  const floor = ctx.minPrice > 0 ? ctx.minPrice : ctx.originalPrice
  return offer <= floor * 0.5 || offer <= ctx.originalPrice * 0.1
}

function stableHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function absurdOfferReply(offer: number, ctx: NegotiationContext): string {
  const cur = ctx.currencySymbol
  const item = ctx.productTitle ? `this ${ctx.productTitle}` : 'this'
  const shown = Number.isFinite(offer) && offer > 0 ? offer.toFixed(2) : '0'
  const price = `${cur}${shown}`
  const anchor = `${cur}${quotedFloor(ctx).toFixed(2)}`

  // How many absurd jabs in a row — callers with history pass the true streak;
  // otherwise fall back to the (non-burning) attempt counter.
  const streak = Math.max(1, Math.floor(ctx.absurdStreak ?? ctx.attemptsUsed ?? 0) || 1)
  const stage = streak <= 1 ? 1 : streak === 2 ? 2 : 3

  const banks: Record<Persona, { s1: string[]; s2: string[]; s3: string[] }> = {
    strict_negotiator: {
      s1: [
        `${price} is a little too ambitious for ${item}. No hard feelings — give me a realistic price and I'll see what I can do.`,
        `That one made me smile. ${price} won't get you ${item}, but a realistic price gives us something to work with.`,
        `Let's keep it real: ${price} isn't in the ballpark for ${item}. Name a realistic price and we'll talk.`,
      ],
      s2: [
        `You're edging up, and I see it. ${price} is still not in the conversation for ${item} — give me a realistic price.`,
        `${price} is still far off. I hear the bump, and it helps; a realistic price would help more.`,
      ],
      s3: [
        `We're going in circles. ${price} isn't happening. My realistic starting point is ${anchor} — meet me near that and we have a deal.`,
        `I want to close this for you. ${price} won't work for ${item}, but I can start around ${anchor}; if that's workable, the deal is yours.`,
        `Straight talk: ${price} is off the table. My position starts at ${anchor}. Bring a real price and we'll close.`,
      ],
    },
    playful_friend: {
      s1: [
        `Ha! ${price}? For that I'll throw in the box it came in. Come on — play ball with a real price!`,
        `${price}?! You're joking — for that I'll throw in the box it came in! Give me a real price and let's play ball.`,
        `Nice try! ${price} won't do it — but I like the hustle. Throw a real price at me and we'll play ball.`,
      ],
      s2: [
        `You keep nudging it up — I see the game! But ${price} is still a no. Play ball with a real price.`,
        `Ooh, inching up! ${price} still won't fly, though. Throw me a price I can actually play ball with.`,
      ],
      s3: [
        `Okay, enough games — you're clearly testing me! ${price} won't fly, but let's get real: my ballpark starts around ${anchor}. Play in that range!`,
        `You're persistent, I'll give you that! ${price} is still a joke — real talk, I start around ${anchor}. Meet me there?`,
        `Cards on the table: ${price} is a no. My ballpark opens near ${anchor}. Get in the game and we'll talk!`,
      ],
    },
    friendly_shopkeeper: {
      s1: [
        `Oh friend, ${price} is a bit too far below for ${item}. What feels fair to you?`,
        `Ha, ${price} is a warm-up 🙂 For ${item}, what's a price that feels fair?`,
        `I love the enthusiasm, friend — but ${price} won't work for ${item}. What number feels right?`,
      ],
      s2: [
        `I can see you're inching up, friend — ${price} is still a bit far for ${item}. What's a fair number?`,
        `You're getting warmer, friend 🙂 ${price} still won't quite work. What price should I try for?`,
      ],
      s3: [
        `I want to be straight with you, friend: ${price} won't work for ${item}. I can start around ${anchor} — if that's workable, we'll make it happen.`,
        `I don't want to waste your time: ${price} is out of reach for ${item}. Around ${anchor} is a real starting point. Shall we try that?`,
        `Honestly, ${price} isn't doable for ${item} — but I don't want you to walk away. Around ${anchor}, I can make something work.`,
      ],
    },
  }

  const pick = (pool: string[]): string => pool[(stableHash(shown) + streak) % pool.length]
  const lang = (ctx.language || '').toLowerCase()

  // A customer bargaining in Hinglish/Hindi/Marathi must not get a English
  // jab back. These are bounded, persona-true translations of the SAME three
  // escalation stages — no new pricing logic, no floor disclosure.
  if (lang === 'hinglish') {
    const pools: Record<Persona, { s1: string[]; s2: string[]; s3: string[] }> = {
      strict_negotiator: {
        s1: [`${price} thoda zyada hai. Real price batao, phir baat karenge.`, `Bhai, ${price} se ye ${item} nahi milega. Sahi price do.`, `Himmat achhi hai, par ${price} kam hai. Real offer bhejo.`],
        s2: [`Thoda upar aa gaye ho, par ${price} abhi door hai. Real price batao.`, `${price} abhi bhi nahi chalega. Batao, final kya soch rahe ho?`],
        s3: [`Bhai, ${price} to nahi hoga. Main ${anchor} se shuru kar sakta hoon — uske paas aa jao, deal kar deta hoon.`, `Seedhi baat: ${price} off the table hai. Meri position ${anchor} hai. Real price lao.`, `Do baar bata diya — ${price} nahi. ${anchor} ke aas-paas khelo, pakka deal.`,],
      },
      playful_friend: {
        s1: [`Ha! ${price}? Isse to box bhi free mein mil jayega 😄 Chalo, real price maro!`, `${price}?? Bhai mazaakachhi! Ek solid price bhejo, haggling ka maza lenge 😄`, `Nice try! 😄 ${price} se kaam nahi chalega, par effort pasand hai. Real price?`],
        s2: [`Dekha, thoda upar aa gaye! 😄 ${price} phir bhi no. Play ball karo.`, `Ooh ${price} — abhi bhi bahut chhota hai. Koi price jise main seriously le sakoon?`],
        s3: [`Bas bas, test samajh gaya 😄 ${price} nahi, par main ${anchor} se khel sakta hoon.`, `Bhai tum persistent ho! ${price} masih joke hai. Real talk — ${anchor} se start karein?`, `Cards table pe: ${price} nahi. ${anchor} ke around aa jao, deal pakki 😄`],
      },
      friendly_shopkeeper: {
        s1: [`Bhaiya, ${price} se to packing bhi nahi milegi 😄 Thoda real price batao, dekhte hain kya kar sakta hoon.`, `Ha bhai, ${price} warm-up hai, offer nahi. Sach me kitna dena chahte ho?`, `Mujhe tumhari himmat pasand hai, par ${price} kaam nahi karega. Fair price batao?`],
        s2: [`Tum thoda upar aa rahe ho bhai, aur main dekh raha hoon — par ${price} abhi bhi door hai.`, `Bhai, ${price} se deal nahi banegi. Thoda realistic price do, main try karunga.`],
        s3: [`Bhai, ${price} genuinely nahi chalega. Main ${anchor} se start kar sakta hoon — agar ye theek hai to deal kar deta hoon.`, `Straight bol raha hoon: ${price} is item ke liye possible nahi. ${anchor} ke aas-paas kuch kar sakta hoon.`, `${price} to nahi, par main tumhe khali nahi bhejna chahta. ${anchor} ke around chalega?`],
      },
    }
    const bank = pools[ctx.persona] ?? pools.friendly_shopkeeper
    return pick(stage === 1 ? bank.s1 : stage === 2 ? bank.s2 : bank.s3)
  }

  if (lang === 'hi') {
    const pools: Record<Persona, { s1: string[]; s2: string[]; s3: string[] }> = {
      strict_negotiator: {
        s1: [`${price} बहुत कम है। वास्तविक संख्या बताइए, तब बात करेंगे।`, `${price} से यह ${item} नहीं मिलेगा। सही प्रस्ताव दें।`, `प्रयास अच्छा है, पर ${price} पर्याप्त नहीं है। वास्तविक ऑफ़र भेजें।`],
        s2: [`आप थोड़े ऊपर आए हैं, पर ${price} अभी दूर है। वास्तविक संख्या बताइए।`, `${price} अभी भी संभव नहीं है। अंतिम क्या सोच रहे हैं?`],
        s3: [`${price} स्वीकार्य नहीं है। मैं ${anchor} से शुरू कर सकता हूँ — इसके आस-पास आएँ, सौदा कर दूँगा।`, `सीधी बात: ${price} संभव नहीं। मेरी स्थिति ${anchor} है। वास्तविक प्रस्ताव लाएँ।`, `दो बार कह चुका हूँ — ${price} नहीं। ${anchor} के आस-पास बात करें।`],
      },
      playful_friend: {
        s1: [`हाहा! ${price}? इससे तो डिब्बा भी मुफ़्त मिल जाएगा 😄 चलो, असली नंबर मारो!`, `${price}?? भाई मज़ाक़ अच्छा! एक पक्का नंबर भेजो 😄`, `अच्छी कोशिश! 😄 ${price} से काम नहीं चलेगा, पर हिम्मत पसंद है। असली नंबर?`],
        s2: [`देखा, थोड़े ऊपर आ गए! 😄 ${price} फिर भी नहीं। खेल में आ जाओ।`, `ओह ${price} — अभी भी बहुत छोटा है। ऐसा नंबर दो जिसे मैं गंभीरता से लूँ।`],
        s3: [`बस बस, समझ गया 😄 ${price} नहीं, पर मैं ${anchor} से खेल सकता हूँ।`, `तुम बड़े persevering हो! ${price} अभी भी मज़ाक़ है। सच कहूँ — ${anchor} से शुरू करें?`, `कार्ड मेज़ पर: ${price} नहीं। ${anchor} के आस-पास आ जाओ, सौदा पक्का 😄`],
      },
      friendly_shopkeeper: {
        s1: [`भैया, ${price} से तो पैकिंग भी नहीं मिलेगी 😄 थोड़ा वास्तविक नंबर बताइए, देखते हैं क्या कर सकता हूँ।`, `हाँ भैया, ${price} तो सिर्फ़ शुरुआत है, ऑफ़र नहीं। सच में कितना देना चाहते हैं?`, `आपकी हिम्मत पसंद है, पर ${price} काम नहीं करेगा। उचित नंबर बताएँ?`],
        s2: [`आप थोड़े ऊपर आ रहे हैं और मैं देख रहा हूँ — पर ${price} अभी बहुत दूर है।`, `भैया, ${price} से सौदा नहीं बनेगा। थोड़ा यथार्थवादी नंबर दें, मैं कोशिश करूँगा।`],
        s3: [`भैया, ${price} वास्तव में संभव नहीं। मैं ${anchor} से शुरू कर सकता हूँ — मान्य हो तो सौदा कर दूँगा।`, `सीधे कह रहा हूँ: ${price} इस वस्तु के लिए संभव नहीं। ${anchor} के आस-पास कुछ कर सकता हूँ।`, `${price} तो नहीं, पर मैं आपको खाली नहीं भेजना चाहता। ${anchor} के आस-पास चलेगा?`],
      },
    }
    const bank = pools[ctx.persona] ?? pools.friendly_shopkeeper
    return pick(stage === 1 ? bank.s1 : stage === 2 ? bank.s2 : bank.s3)
  }

  if (lang === 'mr') {
    const pools: Record<Persona, { s1: string[]; s2: string[]; s3: string[] }> = {
      strict_negotiator: {
        s1: [`${price} खूप कम आहे. खरी किंमत सांगा, मग बोलू.`, `${price} ने हे ${item} मिळणार नाही. योग्य ऑफर द्या.`, `हिम्मत चांगली आहे, परंतु ${price} पुरेसे नाही. खरा ऑफर पाठवा.`],
        s2: [`तुम्ही थोडे वर आलात, पर ${price} अजून दूर आहे. खरी किंमत सांगा.`, `${price} अजूनही शक्य नाही. शेवटी काय विचार करत आहात?`],
        s3: [`${price} मान्य नाही. मी ${anchor} पासून सुरू करू शकतो — त्याजवळ या, डील करून देतो.`, `सरळ सांगतो: ${price} शक्य नाही. माझी स्थिती ${anchor} आहे. खरा ऑफर आणा.`, `दोनदा सांगितले — ${price} नाही. ${anchor} जवळ बोलू.`],
      },
      playful_friend: {
        s1: [`हा! ${price}? याने तर डब्बासुद्धा मोफत मिळेल 😄 चल, खरा नंबर मार!`, `${price}?? भाऊ छान मजा! एक पक्का नंबर पाठव 😄`, `छान प्रयत्न! 😄 ${price}ने काम होणार नाही, परंतु हिम्मत आवडली. खरा नंबर?`],
        s2: [`पाहिलंत, थोडे वर आलात! 😄 ${price} अजून नाही. खेळात या.`, `ओह ${price} — अजून खूप छोटे आहे. असा नंबर द्या जो मी गंभीरपणे घेईन.`],
        s3: [`बस बस, समजलो 😄 ${price} नाही, परंतु मी ${anchor} पासून खेळू शकतो.`, `तुम्ही खूप खटपटी आहात! ${price} अजूनही मजा आहे. सरळ सांगू — ${anchor} पासून सुरू करू?`, `कार्ड टेबलवर: ${price} नाही. ${anchor} जवळ या, डील पक्की 😄`],
      },
      friendly_shopkeeper: {
        s1: [`भाऊ, ${price}ने तर पॅकिंगही मिळणार नाही 😄 थोडा खरा नंबर सांगा, काय करू शकतो ते पाहू.`, `हो भाऊ, ${price} ही सुरुवात आहे, ऑफर नाही. खरंच कितना देऊ इच्छिता?`, `तुमची हिम्मत आवडली, परंतु ${price} होणार नाही. योग्य नंबर सांगा?`],
        s2: [`तुम्ही थोडे वर येत आहात, मी पाहतोय — परंतु ${price} अजून दूर आहे.`, `भाऊ, ${price}ने डील होणार नाही. थोडा वास्तविक नंबर द्या, मी प्रयत्न करेन.`],
        s3: [`भाऊ, ${price} खरंच होणार नाही. मी ${anchor} पासून सुरू करू शकतो — मान्य असेल तर डील करून देतो.`, `सरळ सांगतो: ${price} या वस्तुसाठी शक्य नाही. ${anchor} जवळ काही करू शकतो.`, `${price} नाही, परंतु मी तुम्हाला रिकामे पाठवू इच्छित नाही. ${anchor} जवळ चलेगा?`],
      },
    }
    const bank = pools[ctx.persona] ?? pools.friendly_shopkeeper
    return pick(stage === 1 ? bank.s1 : stage === 2 ? bank.s2 : bank.s3)
  }

  const bank = banks[ctx.persona] ?? banks.friendly_shopkeeper
  const pool = stage === 1 ? bank.s1 : stage === 2 ? bank.s2 : bank.s3
  return pick(pool)
}

// ── Reciprocal counter: bargain like a person, not a schedule ──
// The old model conceded on a fixed curve keyed only to the turn number, so the
// same numbers appeared every session (₹964.25, then ₹950, …) and any shopper
// who simply waited always saw the price march down to the floor. This model
// instead RESPONDS to what the customer actually does:
//   • it holds at this round's EARNED price — a convex, interest-aware position
//     that concedes slowly at first and never sinks to the hidden floor for an
//     ordinary buyer (only a genuinely serious buyer earns the bottom),
//   • it MEETS a customer who moves up to or beyond that price (they named a
//     number we can live with — we take it, never ask for more),
//   • it HOLDS when the shopper is unserious, repeats a lowball, or goes
//     backwards (no reward for testing), and
//   • it is MONOTONIC — the standing price never rises mid-negotiation.
// Because the customer's own offer, the trend, the seriousness and the AI's last
// standing price all move the number, two sessions with different behaviour
// produce different prices: genuine haggling, not a fixed rate of steps.
export function reciprocalCounter(
  ctx: NegotiationContext,
  offer?: number | null,
  lastCounter?: number | null,
): number {
  const list = ctx.originalPrice
  const quoted = quotedFloor(ctx)
  if (list <= quoted) return Math.round(quoted * 100) / 100

  const range = list - quoted
  const rawProgress = ctx.maxAttempts > 0 ? ctx.attemptsUsed / ctx.maxAttempts : 1
  const progress = tacticalProgress(rawProgress)

  // How far the AI is WILLING to move this turn. Interest-aware: a serious buyer
  // earns more movement, a time-waster is held firm, and the shopper's own offer
  // direction matters most (rising rewards, flat/falling holds).
  let engagement = 0.75
  if (ctx.seriousness === 'serious') engagement = 1
  else if (ctx.seriousness === 'casual') engagement = 0.55
  else if (ctx.seriousness === 'time_waster') engagement = 0.1
  if (ctx.customerOfferTrend === 'rising') engagement = Math.min(1, engagement + 0.2)
  else if (ctx.customerOfferTrend === 'flat') engagement = Math.max(0.05, engagement - 0.3)
  else if (ctx.customerOfferTrend === 'falling') engagement = Math.max(0.05, engagement - 0.45)

  // This round's earned price. Note engagement < 1 stops an ordinary buyer ABOVE
  // the hidden floor — the AI does not always reach it, so holding out is not
  // automatically rewarded.
  const earnedFloor = list - range * progress * engagement

  // The AI's standing price: its last counter if there was one, else the list.
  const base =
    lastCounter != null && Number.isFinite(lastCounter) && lastCounter >= quoted && lastCounter <= list
      ? lastCounter
      : list

  // The hold price for this turn — never above the standing price (monotonic),
  // never below the safe floor.
  const low = Math.min(base, Math.max(earnedFloor, quoted))

  // If the customer has moved to or above the price we're willing to hold, meet
  // them at their own number (we never ask for more than they offered). Otherwise
  // hold firm — a low or repeated offer is not rewarded.
  const meet = offer != null && Number.isFinite(offer) && offer > low ? Math.min(base, offer) : low

  return Math.round(Math.min(list, Math.max(quoted, meet)) * 100) / 100
}

export interface QuoteBand {
  floorSafeMin: number
  target: number
  hold: number
}

export function quoteBand(
  ctx: NegotiationContext,
  sessionId: string,
  offer: number | null | undefined,
  lastCounter: number | null | undefined,
): QuoteBand {
  const list = ctx.originalPrice
  const safe = quotedFloor(ctx)
  const pacing = reciprocalCounter(ctx, offer, lastCounter)
  const base = Math.min(list, Math.max(safe, pacing))
  const room = Math.max(0, base - safe)
  const step = Math.min(room * 0.18, list * 0.015)
  if (step <= 0) return { floorSafeMin: safe, target: base, hold: base }

  const seed = stableHash([
    sessionId,
    ctx.persona,
    ctx.seriousness ?? '',
    ctx.customerOfferTrend ?? '',
    (ctx as NegotiationContext & { negotiationStyle?: string }).negotiationStyle ?? '',
    ctx.attemptsUsed,
  ].join('|'))
  const drift = (seed % 1000) / 1000
  const round = (value: number) => Math.round(value * 100) / 100
  return {
    floorSafeMin: safe,
    target: round(Math.max(safe, base - step * drift)),
    hold: round(Math.min(list, base + step * (1 - drift))),
  }
}

// ── Strategy-aware counter ──
// Shifts a base counter within [minPrice, originalPrice] according to the
// deterministically-chosen strategy. CONSERVATIVE keeps the price higher
// (protect margin when the daily goal is ahead); AGGRESSIVE/CLOSING push lower
// (close more deals when behind near the window end). The strategy NEVER moves a
// counter below the absolute merchant floor.
export function strategyAdjustedCounter(
  ctx: NegotiationContext,
  strategy: BargainStrategy,
  base?: number,
): number {
  const { originalPrice, minPrice } = ctx
  const range = originalPrice - minPrice
  const start = base ?? graduatedCounter(ctx)
  if (range <= 0) return minPrice

  let adjusted = start
  switch (strategy) {
    case 'CONSERVATIVE':
      adjusted = start + range * 0.25
      break
    case 'AGGRESSIVE':
      adjusted = start - range * 0.12
      break
    case 'CLOSING':
      adjusted = start - range * 0.3
      break
    case 'NORMAL':
      break
  }

  return Math.round(Math.min(originalPrice, Math.max(minPrice, adjusted)) * 100) / 100
}

// ── Deterministic final safety validator ──
// The last line of defence shared by every path that turns a suggested price
// into an offer: clamp to [minPrice, originalPrice] and round to 2dp. Strategy
// or AI may suggest anything; this decides what is actually offered.
export function clampOfferToSafety(opts: {
  originalPrice: number
  minPrice: number
  suggested: number
}): number {
  const { originalPrice, minPrice, suggested } = opts
  if (!Number.isFinite(suggested) || suggested < 0) return minPrice
  const rounded = Math.round(suggested * 100) / 100
  return Math.min(originalPrice, Math.max(minPrice, rounded))
}

// ── Bulk-volume floor factor (quantity is not verifiable, so never lowers the floor) ──
export function bulkFloorFactor(quantity: number): number {
  void quantity
  return 1
}

// ── Default opening message (persona-aware, language-aware) ──
// A real shopkeeper never counts chances aloud — the attempt budget stays an
// internal mechanic. The welcome names the price and explicitly invites BOTH a
// number and product questions ("ask me anything"), so the bot reads as an
// interactive salesperson, not a fixed script.
export function buildOpeningMessage(ctx: NegotiationContext): string {
  const { originalPrice, currencySymbol, productTitle, customerContext, language } = ctx
  const item = productTitle ? `this ${productTitle}` : 'this'
  const warmup = customerContext ? ' Welcome back!' : ''
  const price = `${currencySymbol}${originalPrice.toFixed(2)}`

  if (language === 'hinglish') {
    const opening: Record<Persona, string> = {
      playful_friend: `Arré arre! Aap ${productTitle ?? 'yeh item'} dekh rahe ho? Kamaal hai! Listed hai ${price} — par yeh to bas shuruwat hai. Bolo, aapka best rate kya hai — ya kuch poochhna ho toh poochh lo!${warmup}`,
      strict_negotiator: `${productTitle ?? 'Is item'} mein interest ke liye dhanyavaad.${warmup} Current price hai ${price}. Reasonable offer sunne ke liye taiyar hoon. Aapke mann mein kitna price hai?`,
      friendly_shopkeeper: `Arré welcome!${warmup} Main dekha ${productTitle ?? 'yeh item'} aapko pasand aaya. Iska price ${price} hai — par hum achha deal kar sakte hain. Aap apna rate batao, ya iske baare mein kuch bhi poochh lo!`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (language === 'hi') {
    const opening: Record<Persona, string> = {
      playful_friend: `अरे अरे! आप ${productTitle ?? 'ये आइटम'} देख रहे हैं — शानदार चुनाव! लिस्टेड कीमत है ${price}। पर ये तो बस शुरुआत है। बताइए, आप कितनी कीमत सोच रहे हैं? या कुछ पूछना हो तो पूछिए!${warmup}`,
      strict_negotiator: `${productTitle ?? 'इस आइटम'} में रुचि दिखाने के लिए धन्यवाद${warmup}। वर्तमान कीमत ${price} है। आपका प्रस्ताव क्या है?`,
      friendly_shopkeeper: `नमस्ते!${warmup} आपको ${productTitle ?? 'ये आइटम'} पसंद आया, ये बहुत अच्छा है। कीमत है ${price}। आप क्या कीमत सोच रहे हैं? या इसके बारे में कुछ पूछना हो तो पूछिए!`,
    }
    return opening[ctx.persona] ?? opening.friendly_shopkeeper
  }

  if (ctx.persona === 'playful_friend') {
    return `${warmup} Hey hey! I see you're checking out ${item} — nice choice! Listed at ${price}, and it's yours for the right price. What's your move — name a price, or ask me anything about it?`
  }
  if (ctx.persona === 'strict_negotiator') {
    return `Thank you for your interest in ${item}.${warmup} The current price is ${price}. I'm open to a reasonable offer — what price did you have in mind?`
  }
  return `Hey! Welcome!${warmup} I see you're interested in ${item}. It's listed at ${price}. I'd love to help you get a good deal — what price were you thinking? And if you have any questions about it, just ask!`
}

// ── Safe final-quote floor (the merchant's true minimum is never spoken) ──
// A quoted "final" price sits 1% ABOVE the internal accept threshold, so a
// customer can always reach it by haggling but the hidden floor itself is never
// named, printed, or implied. minPrice stays the internal accept rule — a
// shopper's OWN offer at/above the floor is still honoured — while the bot never
// volunteers floor-level money. Shared with the server path so the storefront
// widget and the client-side demo can never disagree on this number.
export function quotedFloor(ctx: Pick<NegotiationContext, 'minPrice' | 'originalPrice'>): number {
  const cushion = Math.max(1, Math.round(ctx.minPrice * 0.01 * 100) / 100)
  return Math.min(ctx.originalPrice, Math.round((ctx.minPrice + cushion) * 100) / 100)
}

// ── Rule-based decision (no AI) ──
// This runs precisely when the AI tier is down, so it is what a shopper sees
// during an outage. It must therefore be persona-true and floor-safe: it quotes
// `quotedFloor` and never describes any price as the lowest/final limit.
//
// `counterFor` lets the server inject its goal/strategy-aware counter while the
// client-side demo uses the pure pacing curve — same copy, same secrecy, one
// implementation.
export function ruleBasedDecision(
  offer: number,
  ctx: NegotiationContext,
  counterFor: (ctx: NegotiationContext, offer: number, last: number | null) => number = reciprocalCounter,
): NegotiationResult {
  const boundedOffer = Math.max(0, Math.min(offer, ctx.originalPrice))
  const { minPrice, originalPrice, attemptsUsed, maxAttempts, persona } = ctx
  const attemptsLeft = maxAttempts - attemptsUsed
  const currencySymbol = ctx.currencySymbol

  if (boundedOffer >= minPrice) {
    // A shopper who offers the listed price (or more) has simply met the asking
    // price — thank them without pretending it was a discounted "deal" (which
    // would show a bogus "saved ₹0.00").
    const atList = boundedOffer >= originalPrice
    const accept: Record<Persona, string> = atList
      ? {
          strict_negotiator: `Understood — the listed ${currencySymbol}${boundedOffer.toFixed(2)} works. Confirm and I'll generate your code.`,
          playful_friend: `Sold at the full ${currencySymbol}${boundedOffer.toFixed(2)} — no haggling required! Tap Accept and I'll grab your code.`,
          friendly_shopkeeper: `That's the listed ${currencySymbol}${boundedOffer.toFixed(2)} — happy to get it sorted for you! Accept it and I'll bring up your code.`,
        }
      : {
          strict_negotiator: `Agreed at ${currencySymbol}${boundedOffer.toFixed(2)}. Confirm the acceptance and your discount code will be generated.`,
          playful_friend: `DEAL! ${currencySymbol}${boundedOffer.toFixed(2)} — you absolute legend! Hit Accept and the magic code is yours.`,
          friendly_shopkeeper: `It's a deal, friend! ${currencySymbol}${boundedOffer.toFixed(2)} works for me. Accept it and I'll sort your code right away.`,
        }
    return {
      reply: accept[persona] ?? accept.friendly_shopkeeper,
      decision: 'accept',
      counterOffer: boundedOffer,
      tactic: 'accept_at_floor',
      sentiment: 'happy',
      metadata: { aiSource: 'emergency' },
    }
  }

  // An absurd offer is NOT a bid to be answered with a price. Reply in persona
  // (strict handles it strictly, playful jokes, friendly stays warm) and invite a
  // real price — never reward a joke with a price, and never burn a scheduled
  // step on it.
  if (isAbsurdOffer(boundedOffer, ctx)) {
    return {
      reply: absurdOfferReply(boundedOffer, ctx),
      decision: 'chat',
      tactic: 'absurd_offer',
      sentiment: persona === 'playful_friend' ? 'playful' : persona === 'strict_negotiator' ? 'firm' : 'warm',
      metadata: { aiSource: 'emergency' },
    }
  }

  // A genuine below-floor offer: respond with the reciprocal counter (never below
  // the round's earned, floor-safe standing price).
  let counter = counterFor(ctx, boundedOffer, ctx.lastCounter ?? null)
  counter = Math.min(originalPrice, Math.max(quotedFloor(ctx), counter))
  // A counter must always be a REAL drop below the listed price.
  if (counter >= originalPrice) {
    counter = Math.max(quotedFloor(ctx), originalPrice - Math.max(1, originalPrice * 0.01))
  }

  if (attemptsLeft > 1) {
    const meet: Record<Persona, string> = {
      strict_negotiator: `I appreciate the offer, however ${currencySymbol}${boundedOffer.toFixed(2)} is below my position. Given the quality, I can offer ${currencySymbol}${counter.toFixed(2)}. Your call.`,
      playful_friend: `Mmm, ${currencySymbol}${boundedOffer.toFixed(2)}? You'll have to do better than that. I'll meet you at ${currencySymbol}${counter.toFixed(2)} — and that's me being generous!`,
      friendly_shopkeeper: `Hmm, ${currencySymbol}${boundedOffer.toFixed(2)} is a little low for me. Let's meet in the middle — how about ${currencySymbol}${counter.toFixed(2)}? I think that's fair for the quality.`,
    }
    return {
      reply: meet[persona] ?? meet.friendly_shopkeeper,
      decision: 'counter',
      counterOffer: counter,
      tactic: 'meet_partway',
      sentiment: 'conciliatory',
      metadata: { aiSource: 'emergency' },
    }
  }

  const final: Record<Persona, string> = {
    strict_negotiator: `This is the last price I can do: ${currencySymbol}${counter.toFixed(2)}. If you'd rather not, that's entirely your call.`,
    playful_friend: `Okay, this is the last price I can do — ${currencySymbol}${counter.toFixed(2)}. Take it or leave it, friend; I'll still like you either way!`,
    friendly_shopkeeper: `Friend, this is the last I can do: ${currencySymbol}${counter.toFixed(2)}. If it works, great; if not, no pressure at all — the choice is yours.`,
  }
  return {
    reply: final[persona] ?? final.friendly_shopkeeper,
    decision: 'counter',
    counterOffer: counter,
    tactic: 'final_offer',
    sentiment: 'final',
    metadata: { aiSource: 'emergency' },
  }
}

// ── Walkout retention offer (no AI) ──
// Floor-safe for the same reason as `ruleBasedDecision`: never below
// `quotedFloor`, so a retention price can never be mistaken for the minimum.
export function retentionOffer(ctx: NegotiationContext, lastCounter: number | null): NegotiationResult {
  const { minPrice, originalPrice, currencySymbol, persona } = ctx
  const last = lastCounter ?? originalPrice
  const step = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1)
  const price = Math.max(quotedFloor(ctx), Math.round((last - step) * 100) / 100)
  const fmt = (n: number) => n.toFixed(2)

  let reply: string
  if (persona === 'strict_negotiator') {
    reply = `One moment. For this order I can stretch to ${currencySymbol}${fmt(price)}. Your call.`
  } else if (persona === 'playful_friend') {
    reply = `Hold on — you drive a hard bargain! I can do ${currencySymbol}${fmt(price)}. Shall I lock it for you?`
  } else {
    reply = `Before you go — one honest step from me: ${currencySymbol}${fmt(price)}. If that works, I'll lock it; if not, no pressure.`
  }

  return { reply, decision: 'counter', counterOffer: price, tactic: 'walkout_retention', sentiment: 'sympathetic' }
}
