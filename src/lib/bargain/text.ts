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

// ── Price extraction: pull a numeric offer out of free text ──
export function extractPrice(text: string): number | null {
  // A leading minus before a number/currency means a negative/absurd "offer"
  // (e.g. "-$50"). Never parse those as positive — the customer offered nothing.
  if (/(?:^|[^A-Za-z0-9])-+\s*(?:₹|INR|Rs\.?|\$|USD|€|EUR)?\s*\d/i.test(text)) {
    return null
  }

  const patterns = [
    /(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:\$|USD)\s*(\d+(?:\.\d{1,2})?)/i,
    /(?:€|EUR)\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:\$|dollars?|usd)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:€|euros?|eur)/i,
    /\b(\d+(?:\.\d{1,2})?)\b/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const val = parseFloat(match[1])
      if (val > 0 && val < 1_000_000) return val
    }
  }
  return null
}
