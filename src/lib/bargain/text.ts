// Pure text-parsing helpers for the bargain engine.
// Extracted from the offer route so they can be unit-tested in isolation.

const CUSTOMER_TYPO_MAP: Record<string, string> = {
  prize: 'price',
  prizes: 'prices',
  pricee: 'price',
  ofer: 'offer',
  ofeer: 'offer',
  offeer: 'offer',
  offfer: 'offer',
  offerr: 'offer',
  ofers: 'offers',
  ammount: 'amount',
  amout: 'amount',
  amt: 'amount',
  mutch: 'much',
  disount: 'discount',
  dicount: 'discount',
  discout: 'discount',
  discountt: 'discount',
  plz: 'please',
  plzz: 'please',
  pleasee: 'please',
  sennd: 'send',
  chep: 'cheap',
  cheapr: 'cheaper',
  expensiv: 'expensive',
  qualty: 'quality',
  warrnty: 'warranty',
  delet: 'delete',
  recieve: 'receive',
  recieved: 'received',
}

export function normalizeCustomerText(input: string): string {
  const normalized = input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/([₹$€£])\s+(\d)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => {
      const numberMatch = token.match(/^([₹$€£]?)(\d[\dolIsO]{1,6})([.,!?;:]?)$/)
      if (numberMatch) {
        const digits = numberMatch[2]
          .replace(/o/g, '0')
          .replace(/O/g, '0')
          .replace(/[lI]/g, '1')
          .replace(/s/g, '5')
          .replace(/S/g, '5')
        if (/^\d+$/.test(digits)) return `${numberMatch[1]}${digits}${numberMatch[3]}`
      }
      const bare = token.toLowerCase().replace(/[^a-z]/g, '')
      const suffix = token.slice(bare.length)
      return CUSTOMER_TYPO_MAP[bare] ? `${CUSTOMER_TYPO_MAP[bare]}${suffix}` : token
    })
    .join(' ')
    .replace(/\bto\s+much\b/gi, 'too much')
    .replace(/\bcan\s+u\b/gi, 'can you')
    .replace(/\bu\s+r\b/gi, 'you are')
    .replace(/\br\s+u\b/gi, 'are you')

  return normalized
}

// ── Walkout detection: does the customer threaten to leave / close the deal? ──
export function detectWalkout(text: string): boolean {
  const t = normalizeCustomerText(text).toLowerCase()

  // "leaving for work/school" etc. — NOT a walkout
  if (/(?:leaving|going|out|step\s+away)\s+(?:for|to)\s+(?:work|office|school|gym|dinner|lunch|break|class)/.test(t)) {
    return false
  }

  const strong = [
    /(?:i'?m|i am)\s+(?:out|gone|done|leaving|heading\s+out)/,
    /forget\s+(?:it|this|that)/i,
    /never\s+mind/i,
    /chang(?:e|ed|ing)\s+my\s+mind/i,
    /walk(?:ing)?\s+away/i,
    /(?:going|heading)\s+(?:elsewhere|somewhere\s+else)/,
    /(?:buy|purchase|get|shop)\s+(?:it\s+)?(?:from|at)\s+another/i,
    /not\s+(?:interested|buying)\s+anymore/i,
    /(?:no|skip|drop|dropping)\s+the\s+deal/i,
    /\b(?:bye|goodbye|good\s+bye)\b/i,
    /(?:eff|screw)\s+this|give\s+up/i,
    /too\s+expensive,?\s+(?:i'?m|i)\s+(?:leaving|going|out)/i,
    // Quit-family wording. Treated as WALKOUT (→ retention, not termination):
    // a single "I quit…" must NOT end the session — see negotiation-state.ts
    // walkoutOutcome() for the deterministic retain/abandon decision. Tightened
    // so harmless "quit your day job" / "the app keeps quitting on me" /
    // "quit asking" sentences never fire a false walkout.
    /^\s*i(?:'?m| am)\s+quit(?:ting|ted)?/i,
    /quit(?:ting|ted)?\s+(?:trying|bargaining|negotiating)/i,
    /(?:quit|stop)\s+(?:this\s+|the\s+)?(?:offer|deal|price|negotiation|bargain)/i,
    /quitting(?!\s+on\b)/i,
  ]
  if (strong.some(r => r.test(t))) return true

  // Price complaint + exit intent combined
  if (/(?:too\s+expensive|rip\s*off|overpriced|high\s+price|can'?t\s+afford)/.test(t)
    && /\b(?:leav(?:e|ing)|go(?:ing)?|walk(?:ing)?|out|away|elsewhere|another\s+store|amazon|flipkart|meesho)\b/.test(t)) {
    return true
  }

  // "I'll take my business elsewhere"
  if (/(?:take|taking|bring|bringing)\s+my\s+(?:business|money)/.test(t)
    && /\b(?:elsewhere|another|away|somewhere\s+else)\b/.test(t)) {
    return true
  }

  return false
}

// ── Bulk quantity extraction: how many units does the customer want? ──
export function extractQuantity(text: string): number | null {
  const t = normalizeCustomerText(text)

  if (/(?:half\s+(?:a\s+)?dozen)/i.test(t)) return 6
  if (/(?:\bdozen\b)/i.test(t)) return 12
  if (/\ba\s+couple\s+of\s+(?:these|them|those|units?|pieces?|items?)\b/i.test(t)) return 2

  // Word numbers: "three units", "I need five", "buy two" — a shopper who names
  // a count in words must not be treated as having asked nothing.
  const WORD_NUM: Record<string, number> = {
    two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  }
  const word = t.match(
    /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\s*(?:pieces?|units?|items?|qty\.?|pcs\.?|nos\.?|numbers?|copies?)\b/i,
  )
  if (word) {
    const n = WORD_NUM[word[1].toLowerCase()]
    if (n) return n
  }
  const wordBare = t.match(
    /(?:buy|take|want|need|get|order|purchase|grabbing)\s+(?:about\s+|around\s+)?(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?:days?|weeks?|months?|years?|hours?|hrs?|minutes?|mins?|kids?|children))/i,
  )
  if (wordBare) {
    const n = WORD_NUM[wordBare[1].toLowerCase()]
    if (n && !/\b(?:₹|rs\.?|inr|\$|usd|€|eur|euros?|rupees?|dollars?)\s*\d|\d\s*(?:₹|rs\.?|inr|\$|usd|€|eur|euros?|rupees?|dollars?)\b/i.test(t)) {
      return n
    }
  }

  const patterns = [
    // explicit unit words: "2 units", "5 pieces", "3 qty", "4 pcs", "10 items"
    /(\d{1,3})\s*(?:pieces?|units?|items?|qty\.?|pcs\.?|nos\.?|numbers?|copies?)\b/i,
    // "qty: 5", "quantity 5"
    /(?:qty|quantity)\s*[:=]?\s*(\d{1,3})\b/i,
    // "2 of these/them/those"
    /(\d{1,3})\s+of\s+(?:these|them|those|this|it)\b/i,
    // "3x" / "3 x" multiplier
    /(\d{1,2})\s*[x×]\b/i,
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n >= 2 && n <= 100) return n
  }

  // Bare "take N" — only when N is small (2-20) and no currency symbol anywhere
  const bare = t.match(/(?:buy|take|want|need|get|order|purchase|grabbing)\s+(?:about\s+|around\s+)?(\d{1,2})\b/)
  if (bare) {
    const n = parseInt(bare[1], 10)
    if (n >= 2 && n <= 20 && !/\b(?:₹|rs\.?|inr|\$|usd|€|eur|euros?|rupees?|dollars?)\s*\d|\d\s*(?:₹|rs\.?|inr|\$|usd|€|eur|euros?|rupees?|dollars?)\b/i.test(t)) {
      return n
    }
  }

  return null
}

// Non-price "unit" words that, when they follow a bare number, mark it as a
// count / age / duration rather than a money offer ("2 kids", "50 years",
// "3 days", "10 minutes"). Currency-anchored numbers bypass this check.
const NON_PRICE_UNIT_AFTER =
  /^\s*(?:kids?|children|child|yrs?|years?|months?|weeks?|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|people|persons?|members?|guys?|girls?|boys?|reviews?|stars?|times?|percent|%|\d\s*(?:am|pm)\b)/i

const QUANTITY_UNIT_AFTER =
  /^\s*(?:products?|pieces?|units?|items?|qty\.?|pcs\.?|nos\.?|numbers?|copies?|boxes?|packs?|sets?|dozen)\b/i

const QUANTITY_BEFORE =
  /\b(?:qty|quantity|products?|pieces?|units?|items?|pcs\.?|nos\.?|copies?|boxes?|packs?|sets?)\s*(?:of|is|are|:|=)?\s*[₹$€£]?\s*$/i

// "I will buy 4", "take 3", "order 6" are purchase counts, not bids. The bare
// number is bounded like extractQuantity(): small counts only, so "I will buy
// 950" can still be read as a price offer when nothing else clues the amount.
const PURCHASE_COUNT_BEFORE =
  /\b(?:buy|buying|bought|take|taking|order|ordered|purchase|purchasing|grabbing|add|adding|pick|picking)\s+(?:about\s+|around\s+)?$/i

const IDENTIFIER_BEFORE =
  /\b(?:order|invoice|ticket|tracking|product|model|sku|variant|style|id|no\.?|number|reference|ref)\s*(?:no\.?|number|id|#)?\s*[₹$€£]?\s*$/i

const IDENTIFIER_AFTER =
  /^\s*(?:order|invoice|ticket|tracking|product|model|sku|variant|style|id)\b/i

const CONTACT_BEFORE =
  /\b(?:call|phone|mobile|whatsapp|contact|reach\s+me|text\s+me)\s+(?:me\s+)?(?:at|on|to)?\s*(?:number\s*)?$/i

const BUDGET_BEFORE =
  /\b(?:budget|only\s+(?:have|spend|can\s+spend|got)|can\s+(?:spend|afford)|afford|max(?:imum)?|up\s+to|at\s+most|under|below|within)\s*(?:of|is|was|at|:|=)?\s*[₹$€£]?\s*$/i

const BUDGET_AFTER =
  /^\s*(?:is|was)?\s*(?:my\s+)?(?:budget|max(?:imum)?|limit|cap|upper\s+limit)\b/i

const TOPIC_NUMBER_BEFORE =
  /\b(?:gta|grand\s+theft\s+auto|minecraft|fortnite|call\s+of\s+duty|cod|pubg|roblox|valorant|nba|nfl|ipl|iphone|ipad|android|windows|macbook|playstation|ps|xbox|nintendo|switch|steam|season|episode|chapter|level|stage|version|ver|v|gen|generation|year|grade|class|flat|house|apartment|apt|room|street|road|lane|plot|sector|gate|floor|bus|train|flight|seat|table)\s*(?:no\.?|number|part|version|gen|generation|season|episode|chapter|level|stage|edition|series)?\s*(?:#)?\s*[₹$€£]?\s*$/i

const TOPIC_NUMBER_AFTER =
  /^\s*(?:k|km|kg|gb|mb|tb|inch(?:es)?|mm|cm|ft|feet|star(?:s)?|mp|megapixel|mah|fps|hz|watts?|w|years?|yrs?|months?|weeks?|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|am|pm|season|episode|chapter|level|stage|version|gen|generation|series|model|edition|no\.?|number|#)(?:\b|$)/i

const SAVING_GOAL_BEFORE =
  /\b(?:sav(?:e|ing|ed)|putting\s+aside|setting\s+aside|collecting|need(?:ed)?\s+to\s+save|have\s+to\s+save|goal|target)\b[^.!?\d]{0,30}[₹$€£]?\s*$/i

const YEAR_CONTEXT_BEFORE = /\b(?:in|since|from|during|around|by|until|till|back\s+in)\s*$/i

const YEAR_CONTEXT_AFTER = /^\s*(?:(?:was|is|were|will\s+be|going\s+to\s+be|gonna\s+be)\s+)*(?:wild|crazy|insane|lit|fire|happening|going\s+on|trending|viral|the\s+year|a\s+good\s+year)\b/i

const STRONG_BID_BEFORE =
  /\b(?:i(?:'ll|\s+will|\s+can|\s+'?d|\s+would)\s+(?:give|pay|offer|do|take|spend|buy)(?:\s+you)?|i\s+(?:give|pay|offer)|(?:can|could|will|would)\s+you\s+(?:do|take|accept|give|make|sell|offer|come\s+down)|give\s+it\s+to\s+me\s+for|(?:my\s+)?final(?:\s+offer)?(?:\s+is|\s+at|:|=)?|my\s+offer(?:\s+is|\s+at|:|=)?|(?:^|[\s,])offer\s*[₹$€£]?\s*$|bid\s*[₹$€£]?\s*$)\s*[₹$€£]?\s*$/i

// A first-person bid that follows the number ("450 is what I can pay"). This
// is deliberately narrower than BID_CUE so "500, can you do 450?" cannot make
// the competitor/reference number look like the shopper's own offer.
const OWN_BID_AFTER =
  /^[\s,.!—–-]*(?:is|was)?\s*(?:what\s+)?(?:i(?:'ll|\s+will|\s+can|\s+'?d|\s+would|\s+am\s+willing\s+to)\s+(?:give|pay|offer|do|take|buy|spend)|(?:that'?s\s+)?(?:my\s+|the\s+)?final(?:\s+offer)?\b|(?:that'?s\s+)?my\s+offer\b)/i

export type NonOfferNumberContext =
  | 'quantity'
  | 'identifier'
  | 'budget'
  | 'contact'
  | 'percent'
  | 'comparison'
  | 'complaint'
  | 'reference'
  | 'duration'
  | 'casual'
  | null

function nonOfferContext(before: string, after: string, anchored: boolean, value?: number): NonOfferNumberContext {
  if (/%|percent/i.test(after.slice(0, 6))) return 'percent'
  if (!anchored && NON_PRICE_UNIT_AFTER.test(after)) return 'duration'
  if (!anchored && QUANTITY_UNIT_AFTER.test(after)) return 'quantity'
  if (!anchored && QUANTITY_BEFORE.test(before)) return 'quantity'
  if (!anchored && value != null && value <= 20 && PURCHASE_COUNT_BEFORE.test(before)) return 'quantity'
  if (TOPIC_NUMBER_BEFORE.test(before) || TOPIC_NUMBER_AFTER.test(after) || SAVING_GOAL_BEFORE.test(before)) return 'casual'
  if (YEAR_CONTEXT_BEFORE.test(before) || YEAR_CONTEXT_AFTER.test(after)) return 'casual'
  if (IDENTIFIER_BEFORE.test(before) || IDENTIFIER_AFTER.test(after)) return 'identifier'
  if (CONTACT_BEFORE.test(before)) return 'contact'
  if (BUDGET_BEFORE.test(before) || BUDGET_AFTER.test(after)) return 'budget'
  if (/\b(?:in|from)\s+(?:my\s+)?(?:other|another)\s+cart\b/i.test(after)) return 'comparison'
  if (COMPARISON_CUE.test(before.slice(-80)) || COMPARISON_CUE.test(after.slice(0, 60))) {
    const ownBidNear = STRONG_BID_BEFORE.test(before.slice(-30)) || OWN_BID_AFTER.test(after.slice(0, 45))
    if (!ownBidNear) return 'comparison'
  }
  if (COMPLAINT_AFTER_RE.test(after) || COMPLAINT_BEFORE_RE.test(before)) return 'complaint'
  if (REFERENCE_PRICE_BEFORE.test(before) || REFERENCE_PRICE_AFTER.test(after)) return 'reference'
  return null
}

export function classifyNonOfferNumber(message: string): NonOfferNumberContext {
  const normalized = normalizeCustomerText(message)
  const numberRe = /\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?/g
  let match: RegExpExecArray | null
  while ((match = numberRe.exec(normalized)) !== null) {
    const before = normalized.slice(0, match.index)
    const after = normalized.slice(match.index + match[0].length)
    const value = parseFloat(match[0].replace(/,/g, ''))
    const context = nonOfferContext(before, after, false, value)
    if (context) return context
  }
  return null
}

// A customer naming a competitor's price ("the other store is giving it for
// 500", "Amazon has it for 400") is citing context, not bidding. When such a
// number has no explicit bid near it, it is not an offer.
const COMPARISON_CUE =
  /\b(?:other|another)\s+(?:brand|company|store|shop|seller|site|guy|marketplace|reseller)|competitor|elsewhere|somewhere\s+else|someone\s+else|amazon|flipkart|meesho|myntra|ajio|online|marketplace|reseller|market|cheaper|sasta|kam\s+daam|badhiya\s+daam|charges?|quoted?|(?:giving|has|have|selling|offering|available|charging|quoted?)\s+it\s+(?:for|at)|available\s+for\b/i

// The SELLER'S / reference price, not the shopper's bid: "the price is 1000",
// "it costs 1000", "listed at 1000", "1000 is the price". A message that only
// cites the price is not an offer.
const REFERENCE_PRICE_BEFORE =
  /\b(?:price|costs?|mrp|worth|value|retails?|listed|selling|seller|sticker|rate|tag)\s*(?:is|was|at|for|of|:)?\s*[₹$€£]?\s*$/i
const REFERENCE_PRICE_AFTER =
  /^\s*(?:rupees?|rs\.?|inr|dollars?|bucks)?\s*(?:is|was|hai|a|an|the)?\s*(?:good|fair|reasonable|ok|okay|bad|high|low|expensive|cheap|pricey)?\s*(?:price|mrp|cost|rate|tag|worth|deal)\b/i

// A number the shopper is COMPLAINING about ("714 is a little too much",
// "900 seems steep", "1500 is expensive") is the price they are OBJECTING to —
// not a bid. The criticism words sit right after the number, often behind a few
// filler words ("is", "a little", "way"). Recognising this stops the engine from
// treating a rejected price as an offer and "accepting" a figure the shopper
// never proposed.
const COMPLAINT_AFTER_RE =
  /^[\s,.!—–-]*(?:(?:is|was|it'?s|that'?s|this(?:\s+is)?|seems?|sounds?|feels?|looks?|a\s+bit|a\s+little|a\s+tad|a\s+touch|little|bit|way|far|rather|quite|pretty|very|really|so|just|still|too)\b[\s,.!—–-]*){0,3}(?:too\s+(?:much|high|expensive|pricey|steep|costly)|expensive|pricey|costly|overpriced|steep|a\s+lot(?:\s+of\s+money)?|out\s+of\s+(?:my\s+)?(?:budget|range)|above\s+my\s+budget|beyond\s+my\s+budget|over\s+my\s+budget|more\s+than\s+i|not\s+worth|unaffordable)\b/i

// Complaint language that PRECEDES the number ("not worth 900", "too much for 900").
const COMPLAINT_BEFORE_RE = /\b(?:not\s+worth|too\s+much\s+for)\s*[₹$€£]?\s*$/i

// ── Price extraction: pull the shopper's numeric offer out of free text ──
export function extractPrice(input: string): number | null {
  const text = normalizeCustomerText(input)
  // A leading minus before a number/currency means a negative/absurd "offer"
  // (e.g. "-$50"). Never parse those as positive — the customer offered nothing.
  if (/(?:^|[^A-Za-z0-9])-+\s*(?:₹|INR|Rs\.?|\$|USD|€|EUR)?\s*\d/i.test(text)) {
    return null
  }

  type Candidate = { val: number; index: number; len: number; anchored: boolean }
  const candidates: Candidate[] = []

  // Currency-anchored amounts (symbol before OR after the number). Collected
  // with their positions so a message carrying several figures — a referenced
  // list price AND the shopper's real bid — can be disambiguated below instead
  // of blindly returning the first match.
  const currencyPatterns = [
    /(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:\$|USD)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:€|EUR)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:\$|dollars?|usd)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:€|euros?|eur)/gi,
  ]
  for (const re of currencyPatterns) {
    re.lastIndex = 0
    let cm: RegExpExecArray | null
    while ((cm = re.exec(text)) !== null) {
      const raw = cm[1]
      const val = parseFloat(raw.replace(/,/g, ''))
      if (!(val > 0 && val < 1_000_000)) continue
      candidates.push({ val, index: cm.index + cm[0].indexOf(raw), len: raw.length, anchored: true })
    }
  }

  // Bare numbers not already captured as a currency-anchored amount.
  const bareRe = /\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d{1,2})?/g
  let bm: RegExpExecArray | null
  while ((bm = bareRe.exec(text)) !== null) {
    const raw = bm[0]
    const val = parseFloat(raw.replace(/,/g, ''))
    if (!(val > 0 && val < 1_000_000)) continue
    const index = bm.index
    if (candidates.some((c) => index >= c.index && index < c.index + c.len)) continue
    candidates.push({ val, index, len: raw.length, anchored: false })
  }

  const scored: { val: number; reference: boolean; bid: boolean }[] = []
  for (const c of candidates) {
    const before = text.slice(0, c.index)
    const after = text.slice(c.index + c.len)

    if (!c.anchored) {
      // Age idioms: "I am 25", "I'm 30", "age 40" — a small number is an age.
      if (c.val <= 120 && /(?:\bi(?:\s+am|'?m)|\bage\b|\baged\b|\bturning\b)\s*$/i.test(before)) continue
      // Emphasis / echo: "1000 k 1000", "1000 1000" — the shopper is repeating
      // the seller's own figure, not bidding. Drop both the echoed pair.
      const nextWindow = after.slice(0, 8)
      const nextNum = nextWindow.match(/\d[\d,]*/)
      const nextEcho = Boolean(
        nextNum &&
          (nextNum.index ?? 0) <= 6 &&
          parseFloat(nextNum[0].replace(/,/g, '')) === c.val,
      )
      const prevWindow = text.slice(Math.max(0, c.index - 8), c.index)
      const prevRe = /\d[\d,]*/g
      let prevEcho = false
      let lastPrev: RegExpExecArray | null = null
      let pv: RegExpExecArray | null
      while ((pv = prevRe.exec(prevWindow)) !== null) lastPrev = pv
      if (lastPrev) {
        const gap = prevWindow.length - (lastPrev.index + lastPrev[0].length)
        prevEcho = gap <= 6 && parseFloat(lastPrev[0].replace(/,/g, '')) === c.val
      }
      if (nextEcho || prevEcho) continue
    }

    const context = nonOfferContext(before, after, c.anchored, c.val)
    if (context && context !== 'complaint' && context !== 'reference') continue

    const ownBidBefore = STRONG_BID_BEFORE.test(before.slice(-30))
    const ownBidAfter = OWN_BID_AFTER.test(after.slice(0, 45))
    const bidNear = ownBidBefore || ownBidAfter
    const complaint = !bidNear && (context === 'complaint' || COMPLAINT_AFTER_RE.test(after) || COMPLAINT_BEFORE_RE.test(before))

    scored.push({
      val: c.val,
      reference: context === 'reference' || REFERENCE_PRICE_BEFORE.test(before) || REFERENCE_PRICE_AFTER.test(after) || complaint,
      bid: bidNear,
    })
  }

  if (scored.length === 0) return null
  // Prefer the shopper's own bid over a merely-referenced/list price; a message
  // that names only the price is not an offer.
  const nonReference = scored.filter((s) => !s.reference)
  if (nonReference.length === 0) return null
  const bids = nonReference.filter((s) => s.bid)
  return (bids.length > 0 ? bids : nonReference)[0].val
}
