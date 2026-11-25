import { analyzeIntent } from '../intent'
import { extractPrice } from '../text'

export type ShopperCue =
  | 'insult'
  | 'mash'
  | 'joke'
  | 'greeting'
  | 'gratitude'
  | 'trend'
  | 'walkout'
  | 'purchase_ready'
  | 'recommendation'
  | 'flattery'
  | 'apology'
  | 'confusion'
  | 'hesitation'
  | 'budget'
  | 'lowball'
  | 'comparison'
  | 'complaint'
  | 'counter'
  | 'question'
  | 'chat'

const RUDE_RE = /\b(idiot|stupid|dumb|scam|rip[\s-]?off|ripping me off|robber|thief|fraud|liar|bullshit|\bbs\b|trash|useless|waste of (?:my )?time|shut up|stop wasting|ridiculous|insult(?:ing)?|disgusting|bakwas|chap|loot|dhoka)\b/i
const MASH_RE = /^(?:(?:[a-z]{1,3}\d{1,3}|\d{1,3}[a-z]{1,3})[\s\W_]*){2,}$/i
const JOKE_RE = /\b(haha|hehe|lol|lmao|joke|joking|kidding|funny|hilarious)\b/i
const GREETING_RE = /^(hi|hey|hello|yo|namaste|good (?:morning|afternoon|evening))\b/i
const GRATITUDE_RE = /\b(thanks|thank you|appreciate it|much appreciated|dhanyavaad)\b/i
const TREND_RE = /\b(trend|trending|viral|meme|202[4-9]|gta|iphone|windows|chatgpt|instagram|reels|whatsapp|cricket|ipl|movie|game|gaming)\b/i
const WALKOUT_RE = /\b(forget it|i(?:'m| am) (?:out|leaving|done)|not interested|cancel(?:ling)?|bye|goodbye|no thanks|stop|walk away)\b/i
const PURCHASE_READY_RE = /\b(i(?:'ll| will) take it|buy(?:ing)?(?: it)?|checkout|purchase|order(?: it)?|yes(?: please)?|let(?:'s| us) do it|deal)\b/i
const RECOMMENDATION_RE = /\b(recommend|suggest|alternatives?|other options?|something else|similar|instead|what else do you have|show me more)\b/i
const FLATTERY_RE = /\b(you(?:'re| are|'ve been| have been) (?:so |very |really )?(?:great|helpful|kind|awesome|amazing|wonderful|the best)|nice (?:one|job|work)|well done|love (?:this|it|you)|good (?:service|job)|you rock|superb|brilliant)\b/i
const CONFUSION_RE = /\b(confused|confusing|don'?t understand|do not understand|what do you mean|huh|not clear|lost me)\b/i
const APOLOGY_RE = /\b(sorry|apologies|my bad|my mistake)\b/i
const HESITATION_RE = /\b(let me think|thinking|not sure|maybe|later|wait|hmm|hesitant|need time)\b/i
const BUDGET_RE = /\b(budget|can'?t afford|cannot afford|too tight|low on cash|student discount|pocket money)\b/i
const COMPLAINT_RE = /\b(too (?:much|expensive|high|costly)|expensive|pricey|costs? too|overpriced|discount|cheap)\b/i
const COMPARISON_RE = /\b(cheaper|elsewhere|other store|amazon|flipkart|myntra|competitor|compared to|versus|vs\.?)\b/i
const COUNTER_RE = /\b(counter|meet me (?:at|in the middle)|i can do(?!\s+(?:₹|\d))|i'?ll do(?!\s+(?:₹|\d))|how about|what about|can you do|could you do|final offer|last offer|meet halfway|split the difference)\b/i
const QUESTION_RE = /\?|^(what|why|how|does|do|is|are|can|could|would|will|tell me|describe|show me)\b/i

export function classifyShopperCue(message: string, originalPrice?: number | null): ShopperCue {
  const text = message.trim()
  if (!text) return 'chat'

  if (RUDE_RE.test(text)) return 'insult'
  if (MASH_RE.test(text)) return 'mash'
  if (JOKE_RE.test(text)) return 'joke'
  if (GREETING_RE.test(text)) return 'greeting'
  if (FLATTERY_RE.test(text)) return 'flattery'
  if (GRATITUDE_RE.test(text)) return 'gratitude'
  if (TREND_RE.test(text)) return 'trend'
  if (WALKOUT_RE.test(text)) return 'walkout'
  if (PURCHASE_READY_RE.test(text)) return 'purchase_ready'
  if (RECOMMENDATION_RE.test(text)) return 'recommendation'
  if (CONFUSION_RE.test(text)) return 'confusion'
  if (APOLOGY_RE.test(text)) return 'apology'
  if (HESITATION_RE.test(text)) return 'hesitation'
  if (BUDGET_RE.test(text)) return 'budget'

  const intent = analyzeIntent(text)
  if (intent.intent === 'WALKOUT') return 'walkout'
  if (intent.intent === 'PURCHASE_READY') return 'purchase_ready'
  if (intent.intent === 'PURCHASE_HESITATION') return 'hesitation'

  const offer = extractPrice(text)
  const ratio = offer != null && originalPrice != null && Number.isFinite(originalPrice) && originalPrice > 0
    ? offer / originalPrice
    : null
  if (ratio != null && ratio <= 0.6) return 'lowball'
  if (COMPARISON_RE.test(text) || intent.intent === 'COMPARISON') return 'comparison'
  if (intent.priceComplaint || COMPLAINT_RE.test(text) || intent.intent === 'BUDGET_CONSTRAINT') {
    return 'complaint'
  }
  if (COUNTER_RE.test(text) || (ratio != null && ratio <= 0.95)) return 'counter'
  if (intent.intent === 'RECOMMENDATION_REQUEST' || intent.intent === 'PRODUCT_DISCOVERY') return 'recommendation'
  if (QUESTION_RE.test(text) || intent.intent === 'PRODUCT_QUESTION' || intent.intent === 'VALUE_UNCLEAR') return 'question'

  return 'chat'
}
