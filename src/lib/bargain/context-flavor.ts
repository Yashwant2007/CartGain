export const CONTEXT_FLAVORS = [
  'political',
  'devotional',
  'fashion',
  'meme',
  'sport',
  'soft_nudge',
  'casual',
] as const

export type ContextFlavor = (typeof CONTEXT_FLAVORS)[number]

type Pattern = { flavor: ContextFlavor; re: RegExp }

const PATTERNS: Pattern[] = [
  {
    flavor: 'political',
    re: /\b(modi|modiji|bjp|congress|rahul|gandhi|pm\b|prime\s+minister|election|neta|politician|sarkar|government|manifesto|desh|nation)\b/i,
  },
  {
    flavor: 'devotional',
    re: /\b(bhagwan|god|devi|dev\b|mandir|temple|puja|pooja|prayer|blessing|bhakti|faith|allah|ram|krishna|shiv|ganesh|dharm|dharma)\b/i,
  },
  {
    flavor: 'soft_nudge',
    re: /\b(thoda\s+(?:aur|or|thoda)?\s*(?:aram|aaram|relax|comfort|kam|sasta|adjust)|aram\s+(?:kar|kr)\s*do|aur\s+(?:aram|aaram|relax|comfort)|little\s+(?:more|bit)\s+(?:relief|room|comfort)|sasta\s+kar|relax\s+thoda|thoda\s+kam|adjust\s+kar)\b/i,
  },
  {
    flavor: 'fashion',
    re: /\b(drip|swag|style|fashion|outfit|fits?|classy|royal|king\s+vibes|sneaker|jacket|looks?|trending)\b/i,
  },
  {
    flavor: 'meme',
    re: /\b(meme|viral|reels|instagram|trend|mood|vibe|flex|slay|goat|bhau|century|sixer|main\s+character|jugaad)\b/i,
  },
  {
    flavor: 'sport',
    re: /\b(ipl|cricket|football|match|wicket|world\s+cup|gta|game|gaming|pubg|valorant|nba|nfl|score|boundary)\b/i,
  },
  {
    flavor: 'casual',
    re: /\b(hyped|famous|celebrity|influencer|series|season|episode|album|song|concert|iphone|android|windows|model|version|202\d)\b/i,
  },
]

export function detectContextFlavors(message?: string | null): ContextFlavor[] {
  if (typeof message !== 'string') return []
  const text = message.trim()
  if (!text) return []
  return CONTEXT_FLAVORS.filter((flavor) =>
    PATTERNS.some((pattern) => pattern.flavor === flavor && pattern.re.test(text)),
  )
}

export function detectContextFlavor(message?: string | null): ContextFlavor | null {
  return detectContextFlavors(message)[0] ?? null
}

export function hasContextFlavor(message?: string | null): boolean {
  return detectContextFlavor(message) !== null
}

const GUIDANCE: Record<ContextFlavor, string> = {
  political:
    'The shopper used a political/cultural reference. Acknowledge the warmth in one fresh line, never endorse or criticize anyone, never claim political favour, and pivot to the product or price. Do not repeat the reference more than once.',
  devotional:
    'The shopper used a religious or spiritual reference. Acknowledge kindly, never endorse or criticize a faith, never claim divine favour, and pivot to the product or price. Do not repeat the reference more than once.',
  fashion:
    'The shopper used fashion/style language. Mirror it with one tasteful, current-feeling line, then tie it to a verified product fact or a genuine price question. Never invent a trend, review or popularity claim.',
  meme:
    'The shopper used meme or internet-culture language. Match the playful register with one kind, non-dated line, then steer to one clear next step. Never claim anything is viral or trending unless verified context says so.',
  sport:
    'The shopper used sport or gaming language. Use one quick, kind comparison if it fits, then return to the deal. Numbers in scores, overs, years, titles and versions are not bids.',
  soft_nudge:
    'The shopper is asking for a little more comfort or relief without naming a bid. Mirror that feeling warmly, name the real concern once, and ask for a genuine price they can honour. Do not treat vague comfort words as an offer.',
  casual:
    'The shopper used casual contemporary language. Acknowledge it once in their register and pivot to the product or price. Never invent a trend or popularity claim.',
}

const EXAMPLES: Record<ContextFlavor, string> = {
  political:
    'Example shape: "Reference samajh gaya 😄  -  main yahin neutral rehta hoon; {product} par aapka comfortable price kya hoga?"',
  devotional:
    'Example shape: "Achhe vibes wala reference samajh gaya 🙏  -  {product} ka deal clear karte hain, aapka price kya hoga?"',
  fashion:
    'Example shape: "Drip check passed 😄  -  {product} ka style aur price dono settle karte hain."',
  meme:
    'Example shape: "Meme mode on 😄  -  {product} ke liye aapka best price bataiye; main punchline nahi, deal deliver karta hoon."',
  sport:
    'Example shape: "Full toss hai 😄  -  {product} par aapka best price kya hoga? Boundary cross karke deal close kar deta hoon."',
  soft_nudge:
    'Example shape: "Thoda aur comfort chahiye  -  samajh gaya 😄 {product} par aapka actual price kya hoga?"',
  casual:
    'Example shape: "Vibe samajh gaya 😄  -  {product} ki details chahiye ya apna best price bata dijiye?"',
}

export function contextFlavorsPromptBlock(flavors?: ContextFlavor[] | null): string {
  const unique = Array.from(new Set(flavors ?? [])).filter((flavor) =>
    (CONTEXT_FLAVORS as readonly string[]).includes(flavor),
  ) as ContextFlavor[]
  if (unique.length === 0) return ''
  const guidance = unique.map((flavor) => GUIDANCE[flavor]).join(' ')
  const examples = unique.map((flavor) => EXAMPLES[flavor]).join(' ')
  return `CULTURAL CONTEXT: ${guidance} Use warm, current Hinglish where natural; say "price" or "प्राइस", never "number" or "नंबर". If the current turn supplies a public counter, use it once in a witty line; never invent or compute a price and never reveal a minimum, margin, floor or hidden number. ${examples}`
}

export function contextFlavorPromptBlock(flavor?: ContextFlavor | null): string {
  return contextFlavorsPromptBlock(flavor ? [flavor] : null)
}
