export type OverListPersona = 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend'

export interface OverListOfferReplyInput {
  rawOffer: number
  originalPrice: number
  currencySymbol: string
  persona: OverListPersona
  language?: string | null
  customerMessage?: string
}

const HINGLISH_RE = /chlo|chalo|laga\s+do|lag\s+do|kar\s+do|bhej\s+do|ready\s+hoon|ready\s+hu|shukriya|zaroorat/i

export function isOverListOffer(rawOffer: number | null | undefined, originalPrice: number | null | undefined): boolean {
  if (!Number.isFinite(rawOffer) || !Number.isFinite(originalPrice)) return false
  const offer = rawOffer as number
  const list = originalPrice as number
  if (offer <= 0 || list <= 0) return false
  return offer > list + Math.max(1, list * 0.02)
}

export function formatOfferMoney(amount: number, currencySymbol: string): string {
  const safe = Number.isFinite(amount) ? amount : 0
  const formatted = safe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${currencySymbol.trim() || '₹'}${formatted}`
}

export function overListOfferReply(input: OverListOfferReplyInput): string {
  const raw = formatOfferMoney(input.rawOffer, input.currencySymbol)
  const list = formatOfferMoney(input.originalPrice, input.currencySymbol)
  const hinglish = input.language === 'hinglish' || HINGLISH_RE.test(input.customerMessage ?? '')

  const english: Record<OverListPersona, string> = {
    friendly_shopkeeper: `I appreciate that — you're clearly ready to go. I won't charge above the listed price: it's ${list}, so I'll lock it in at ${list}. No need to pay ${raw}.`,
    strict_negotiator: `You've offered ${raw} for an item listed at ${list}. I won't charge above the list price. ${list} works — I'll lock it in for you.`,
    playful_friend: `That's very generous! The listed price is only ${list}, so I'll lock it in at ${list} — no need to pay ${raw}.`,
  }

  const hinglishCopy: Record<OverListPersona, string> = {
    friendly_shopkeeper: `Shukriya — aap clearly ready ho. Main listed price se upar charge nahi karunga: ${list} hai, main yahi lock kar deta hoon. ${raw} dena zaroorat nahi.`,
    strict_negotiator: `Aapne ${raw} offer kiya, par item listed ${list} hai. Main list se upar charge nahi karunga. ${list} par lock kar deta hoon.`,
    playful_friend: `Wow, that's generous! Par listed price sirf ${list} hai — main ${raw} nahi lunga. ${list} par lock kar deta hoon, deal?`,
  }

  const copy = hinglish ? hinglishCopy : english
  return copy[input.persona] ?? copy.friendly_shopkeeper
}
