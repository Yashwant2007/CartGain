'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_ATTEMPTS = 3
const PROFIT_PERCENT = 25

type Line =
  | { kind: 'item'; id: string; variantId?: string | null; title: string; price: number; image?: string }
  | { kind: 'cart'; total: number }

export type BargainItem = {
  id: number
  variant_id?: number | null
  title: string
  price?: string | number | null
  final_price?: string | number | null
  quantity?: number
  image?: string | null
  featured_image?: { url?: string } | null
}

const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'AED ', AUD: 'A$',
  CAD: 'C$', SGD: 'S$', JPY: '¥', PKR: 'Rs ', BDT: '৳',
}

const PersonaLabels: Record<string, string> = {
  friendly: '😊 Alex — Friendly',
  strict: '📊 Morgan — Strict',
  playful: '😏 Riley — Playful',
}

function money(currency: string, n: number): string {
  const sym = SYMBOLS[currency?.toUpperCase()] || (currency ? `${currency} ` : '')
  return `${sym}${n.toFixed(2)}`
}

type Props = {
  mode: 'item' | 'cart'
  shop: string
  currency: string
  line: Line
  checkoutUrl: string
}

export default function StorefrontBargainWidget({ mode, shop, currency, line, checkoutUrl }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  const isCart = line.kind === 'cart'
  const productId = !isCart ? line.id : null
  const variantId = !isCart ? (line.variantId || null) : null

  const [step, setStep] = useState<'intro' | 'chat' | 'deal' | 'rejected'>('intro')
  const [messages, setMessages] = useState<{ role: string; content: string; price?: number }[]>([])
  const [input, setInput] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [persona, setPersona] = useState('friendly')
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [codeSaved, setCodeSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const originalPrice = line.kind === 'cart' ? line.total : line.price
  const minPrice = Math.round(originalPrice * (1 - PROFIT_PERCENT / 100) * 100) / 100
  const title = isCart ? 'your cart order' : line.title

  const announceHeight = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const h = Math.ceil(el.getBoundingClientRect().height)
    try {
      window.parent?.postMessage({ type: 'cg_resize', height: h }, '*')
    } catch {}
  }, [])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === 'cg_get_height') announceHeight()
    }
    window.addEventListener('message', onMsg)
    const ro = new ResizeObserver(announceHeight)
    if (rootRef.current) ro.observe(rootRef.current)
    announceHeight()
    setTimeout(announceHeight, 300)
    return () => {
      window.removeEventListener('message', onMsg)
      ro.disconnect()
    }
  }, [announceHeight])

  const openBargain = () => {
    setStep('intro')
    setMessages([])
    setAttempts(0)
    setInput('')
    setFinalPrice(null)
    setDiscountCode(null)
    setCodeSaved(false)
    setError(null)
  }

  // Local fallback helpers
  const extractPrice = (text: string): number | null => {
    const patterns = [
      /(?:₹|INR|Rs\.?|USD|\$|€|£|¥)\s*(\d+(?:\.\d{1,2})?)/i,
      /(\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?|\$|usd|us\s?dollars?|euros?|eur|pounds?|gbp)/i,
      /\b(\d+(?:\.\d{1,2})?)\b/,
    ]
    for (const p of patterns) {
      const m = text.match(p)
      if (m) {
        const v = parseFloat(m[1])
        if (v > 0 && v < 1_000_000) return v
      }
    }
    return null
  }

  const detectWalkout = (text: string): boolean => {
    const t = text.toLowerCase()
    if (/(?:leaving|going)\s+(?:for|to)\s+(?:work|school|gym|dinner|lunch)/.test(t)) return false
    if (/(?:i'?m|i am)\s+(?:out|leaving|done)/.test(t)) return true
    if (/forget\s+(?:it|this)/.test(t)) return true
    if (/never\s+mind|bye|goodbye/.test(t)) return true
    if (/(?:too\s+expensive|rip\s*off|can'?t\s+afford)/.test(t) && /\b(?:leav|go|walk|out|away|elsewhere|another)\b/.test(t)) return true
    if (/(?:take|taking|bring|bringing)\s+my\s+(?:business|money)/.test(t) && /\b(?:elsewhere|another|away|somewhere\s+else)\b/.test(t)) return true
    return false
  }

  const graduatedCounter = (originalPrice: number, minPrice: number, attemptsUsed: number): number => {
    const progress = attemptsUsed / MAX_ATTEMPTS
    const counter = originalPrice - (originalPrice - minPrice) * progress
    return Math.round(counter * 100) / 100
  }

  const PersonaOpenings: Record<string, (item: string, price: number, fmt: (n: number) => string) => string> = {
    friendly: (item, price, f) =>
      `Hey! Welcome 👋 I see you're interested in ${item}. It's listed at ${f(price)}. I'd love to help you get a good deal — what price were you thinking? You've got ${MAX_ATTEMPTS} attempts to bargain with me.`,
    strict: (item, price, f) =>
      `Thank you for your interest in ${item}. The current price is ${f(price)}. I'm open to reasonable offers within ${MAX_ATTEMPTS} exchanges. What price were you considering?`,
    playful: (item, price, f) =>
      `Hey hey! 👋 I see you're checking out ${item} — nice choice! Listed at ${f(price)}, but hey, that's just the starting point 😏 You've got ${MAX_ATTEMPTS} chances to charm me into a better deal. What's your move?`,
  }

  const PersonaAccept: Record<string, (p: number, f: (n: number) => string) => string> = {
    friendly: (p, f) => `Done! ${f(p)} works for me 🎉 Shall we lock it in?`,
    strict: (p, f) => `Transaction confirmed at ${f(p)}. A discount code will be generated.`,
    playful: (p, f) => `DEAL! 🎉🎉🎉 Told you we'd get there! Code's coming right up.`,
  }

  const PersonaLowball: Record<string, (offer: number, counter: number, f: (n: number) => string) => string> = {
    friendly: (offer, counter, f) => `I appreciate the creativity 😄 but I can't do ${f(offer)}. Let me offer ${f(counter)} — a fair starting point. What do you think?`,
    strict: (offer, counter, f) => `That is not a viable offer. A reasonable starting point would be ${f(counter)}.`,
    playful: (offer, counter, f) => `Free?! 😂 I like your confidence! Best I can do is ${f(counter)} and that's me being generous.`,
  }

  const PersonaCounter: Record<string, (offer: number, counter: number, f: (n: number) => string) => string> = {
    friendly: (offer, counter, f) => `Hmm, ${f(offer)} is a bit low for me. Let me meet you partway — how about ${f(counter)}? I think that's fair given the quality.`,
    strict: (offer, counter, f) => `My offer already reflects the market rate for this quality tier. I can offer ${f(counter)}.`,
    playful: (offer, counter, f) => `Can *I* do better? The real question is, can *you*? 😏 Just kidding — here's my final. ${f(counter)}. That's it. No more. Maybe.`,
  }

  const PersonaFinal: Record<string, (floor: number, f: (n: number) => string) => string> = {
    friendly: (floor, f) => `Alright, I've done my best 🙂 This is my final offer: ${f(floor)}. It's the lowest I can go. Take it or leave it — but I really hope you take it!`,
    strict: (floor, f) => `This is my final position: ${f(floor)}. Beyond this, the offer stands. Your decision.`,
    playful: (floor, f) => `OKAY OKAY you win! Here's my absolute last offer: ${f(floor)}. My manager is gonna kill me 🙃 Deal?`,
  }

  const PersonaRetention: Record<string, (price: number, f: (n: number) => string) => string> = {
    friendly: (price, f) => `Wait, friend — before you go! For you, I can do ${f(price)}. That's me stretching every rupee. Please stay — I really want this to work for you.`,
    strict: (price, f) => `One moment. I am prepared to make a one-time adjustment to ${f(price)}. Beyond that, my offer stands. Your decision.`,
    playful: (price, f) => `WAIT WAIT WAIT! 😅 Okay, you drive a hard bargain. FINAL final offer: ${f(price)}. I'm risking my job for this 🙃 Deal?`,
