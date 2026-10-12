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
// bare number has no explicit first-person bid near it, it is not an offer.
const COMPARISON_CUE =
  /\b(?:other\s+(?:store|shop|seller|site|guy)|another\s+(?:store|shop|seller|site|guy)|competitor|elsewhere|somewhere\s+else|amazon|flipkart|meesho|myntra|ajio|online|market|cheaper|sasta|kam\s+daam|badhiya\s+daam)\b/i
const BID_CUE =
  /\b(?:i(?:'?ll| will| can| wanna| want to)?\s*(?:give|pay|offer|do|take|buy|spend)|offer|my\s+(?:budget|offer|price|max|maximum|final)|final\s+offer|can\s+you\s+do|will\s+you\s+(?:take|accept|do)|make\s+it)\b/i

// ── Price extraction: pull a numeric offer out of free text ──
export function extractPrice(text: string): number | null {
  // A leading minus before a number/currency means a negative/absurd "offer"
  // (e.g. "-$50"). Never parse those as positive — the customer offered nothing.
  if (/(?:^|[^A-Za-z0-9])-+\s*(?:₹|INR|Rs\.?|\$|USD|€|EUR)?\s*\d/i.test(text)) {
    return null
  }

  const patterns = [
    /(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:\$|USD)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:€|EUR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:\$|dollars?|usd)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:€|euros?|eur)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const val = parseFloat(match[1].replace(/,/g, ''))
      if (val > 0 && val < 1_000_000) return val
    }
  }

  // A bare number only counts as an offer when it is NOT used as a count, an
  // age, or a duration. "I have 2 kids" must not register as a bid of 2, and
  // "my mum is 50" must not register as a bid of 50 — otherwise normal chat
  // silently spends the customer's negotiation budget. A sentence can still
  // contain both ("2 kids ... give me 300"), so scan every number and take the
  // first one that reads as money.
  const bareRe = /\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d{1,2})?/g
  let m: RegExpExecArray | null
  while ((m = bareRe.exec(text)) !== null) {
    const raw = m[0]
    const val = parseFloat(raw.replace(/,/g, ''))
    if (!(val > 0 && val < 1_000_000)) continue
    const after = text.slice(m.index + raw.length)
    const before = text.slice(0, m.index)
    if (NON_PRICE_UNIT_AFTER.test(after)) continue
    // Age idioms: "I am 25", "I'm 30", "age 40" — a small number here is a
    // person's age, not a bid.
    if (val <= 120 && /(?:\bi(?:\s+am|'?m)|\bage\b|\baged\b|\bturning\b)\s*$/i.test(before)) continue

    // Emphasis / echo: "1000 k 1000", "1000 1000", "1000, 1000" — the
    // customer is repeating the merchant's own price to make a point, not
    // bidding. Only the immediately-following repeat counts, so a genuine
    // re-bid ("500 ... 500 is my max") still parses.
    const tail = text.slice(m.index + raw.length, m.index + raw.length + 8)
    const tailNum = tail.match(/\d[\d,]*/)
    if (tailNum && parseFloat(tailNum[0].replace(/,/g, '')) === val) {
      const between = tail.slice(0, tail.indexOf(tailNum[0]))
      if (between.length <= 6) {
        // Skip both numbers so the echoed repeat is not re-read as the offer.
        bareRe.lastIndex = m.index + raw.length + tail.indexOf(tailNum[0]) + tailNum[0].length
        continue
      }
    }

    // Competitor comparison: a bare number near "other store"/"Amazon"/etc.
    // with no first-person bid is context, not an offer.
    const around = text.slice(Math.max(0, m.index - 45), m.index + raw.length + 45)
    if (COMPARISON_CUE.test(around) && !BID_CUE.test(around)) continue

    return val
  }
  return null
}
