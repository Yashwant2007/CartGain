// Pure text-parsing helpers for the bargain engine.
// Extracted from the offer route so they can be unit-tested in isolation.

// ── Walkout detection: does the customer threaten to leave / close the deal? ──
export function detectWalkout(text: string): boolean {
  const t = text.toLowerCase()

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
  const t = text.trim()

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

// A customer naming a competitor's price ("the other store is giving it for
// 500", "Amazon has it for 400") is citing context, not bidding. When such a
// number has no explicit bid near it, it is not an offer.
const COMPARISON_CUE =
  /\b(?:other\s+(?:store|shop|seller|site|guy)|another\s+(?:store|shop|seller|site|guy)|competitor|elsewhere|somewhere\s+else|amazon|flipkart|meesho|myntra|ajio|online|market|cheaper|sasta|kam\s+daam|badhiya\s+daam)\b/i

// Explicit bid language. Tightened so a plain statement that merely contains a
// verb ("why should I buy this product for ₹1000") is NOT read as a bid: bare
// give/pay/offer need first person; buy/take/spend need a modal; and a
// competitor "for X" only counts when the shopper is naming their own number.
const BID_CUE =
  /\b(?:i(?:'?ll|\s+will|\s+can|\s+'?d|\s+wanna|\s+want\s+to|\s+am\s+willing\s+to|\s+would)\s+(?:give|pay|offer|do|take|buy|spend)|i\s+(?:give|pay|offer)|my\s+(?:offer|budget|price|max|maximum|final|limit)|final\s+offer|best\s+i\s+can|(?:can|could|will|would)\s+you\s+(?:do|take|accept|give|make|sell|offer|come\s+down)|make\s+it|give\s+it\s+to\s+me\s+for|for\s+me\s+at)\b/i

// The SELLER'S / reference price, not the shopper's bid: "the price is 1000",
// "it costs 1000", "listed at 1000", "1000 is the price". A message that only
// cites the price is not an offer.
const REFERENCE_PRICE_BEFORE =
  /\b(?:price|costs?|mrp|worth|value|retails?|listed|selling|seller|sticker|rate|tag)\s*(?:is|was|at|for|of|:)?\s*[₹$€£]?\s*$/i
const REFERENCE_PRICE_AFTER =
  /^\s*(?:rupees?|rs\.?|inr|dollars?|bucks)?\s*(?:is|was|hai|a|an|the)?\s*(?:good|fair|reasonable|ok|okay|bad|high|low|expensive|cheap|pricey)?\s*(?:price|mrp|cost|rate|tag|worth|deal)\b/i

// ── Price extraction: pull the shopper's numeric offer out of free text ──
export function extractPrice(text: string): number | null {
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
    const around = text.slice(Math.max(0, c.index - 45), c.index + c.len + 45)

    if (!c.anchored) {
      if (NON_PRICE_UNIT_AFTER.test(after)) continue
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

    // Competitor comparison without a real bid nearby is context, not an offer.
    if (COMPARISON_CUE.test(around) && !BID_CUE.test(around)) continue

    scored.push({
      val: c.val,
      reference: REFERENCE_PRICE_BEFORE.test(before) || REFERENCE_PRICE_AFTER.test(after),
      bid: BID_CUE.test(around),
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
