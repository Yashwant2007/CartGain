'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { Zap, Send, Sparkles, MessageCircle, CheckCircle2, RotateCcw, ArrowRight, ShoppingBag, Lock, BadgeCheck, ShieldCheck } from 'lucide-react'
import {
  buildOpeningMessage,
  ruleBasedDecision,
  retentionOffer,
  graduatedCounter,
  type Persona,
  type NegotiationContext,
  type NegotiationResult,
} from '@/lib/bargain/engine'

type ChatMsg = {
  role: 'customer' | 'ai'
  content: string
  offeredPrice?: number | null
}

type DemoProduct = {
  id: string
  title: string
  price: number
  image: string
}

const PRODUCTS: DemoProduct[] = [
  {
    id: 'serum',
    title: 'Vitamin C Brightening Serum',
    price: 1299,
    image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop',
  },
  {
    id: 'cream',
    title: 'Korean Glass-Skin Moisturizer',
    price: 899,
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop',
  },
  {
    id: 'mask',
    title: 'Overnight Repair Sleeping Mask',
    price: 649,
    image: 'https://images.unsplash.com/photo-1570194065650-d99fb4bedf0a?w=400&h=400&fit=crop',
  },
]

const PERSONAS: { id: Persona; name: string; blurb: string }[] = [
  { id: 'friendly_shopkeeper', name: 'Alex — Friendly Shopkeeper', blurb: 'Warm, neighbourly, finds a way.' },
  { id: 'strict_negotiator', name: 'Morgan — Strict Negotiator', blurb: 'Precise, data-driven, no emoji.' },
  { id: 'playful_friend', name: 'Riley — Playful Friend', blurb: 'Cheeky, fun, makes you smile.' },
]

const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'ta', label: 'தமிழ்' },
  { id: 'te', label: 'తెలుగు' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'mr', label: 'मराठी' },
  { id: 'pa', label: 'ਪੰਜਾਬੀ' },
]

const FAREWELLS: Record<Persona, string> = {
  friendly_shopkeeper:
    "I understand completely — you're a valued customer and the door is always open. If you change your mind, we are one message away.",
  strict_negotiator:
    'Understood. Negotiation is closed at the current terms. When you are ready, you may begin a new session.',
  playful_friend:
    'Ah, fair enough — no hard feelings. The invitation stands if you ever change your mind.',
}

const SKIP_REPLIES: Record<Persona, string> = {
  friendly_shopkeeper:
    "Of course — that is the simplest path. Your order at ₹PRICE is ready whenever you are.",
  strict_negotiator:
    'A direct purchase at the listed price — no objections there. Your order at ₹PRICE is confirmed.',
  playful_friend:
    'Hey, the direct route works too. Your order at ₹PRICE is one click away.',
}

// Discount codes a real store would auto-generate (1-use, 24h) per product
const DEMO_CODES: Record<string, string> = {
  serum: 'LUMINA-SERUM10',
  cream: 'LUMINA-GLASS5',
  mask: 'LUMINA-MASK15',
}

// Profit margin the demo "merchant" protects — 25% off is the floor
const DEMO_PROFIT_PERCENT = 25
const MAX_ATTEMPTS = 3

export default function DemoContent() {
  const { data: session, status } = useSession()
  const [product, setProduct] = useState<DemoProduct>(PRODUCTS[0])
  const [persona, setPersona] = useState<Persona>('friendly_shopkeeper')
  const [language, setLanguage] = useState<string>('hinglish')
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [ended, setEnded] = useState<null | 'accepted' | 'rejected' | 'abandoned' | 'skipped'>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [alreadyUsed, setAlreadyUsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(0)

  const minPrice = useMemo(
    () => Math.round((product.price * (1 - DEMO_PROFIT_PERCENT / 100)) * 100) / 100,
    [product],
  )

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking])

  // Claim the one-time demo on mount — enforcement happens server-side
  useEffect(() => {
    fetch('/api/demo/claim', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data?.used === true) setAlreadyUsed(true)
      })
      .catch(() => {})
  }, [])

  // Start a fresh demo
  function start() {
    const ctx: NegotiationContext = {
      storeName: 'Lumina Beauty',
      currencySymbol: '₹',
      originalPrice: product.price,
      minPrice,
      attemptsUsed: 0,
      maxAttempts: MAX_ATTEMPTS,
      persona,
      productTitle: product.title,
      language,
    }
    sessionIdRef.current += 1
    setMessages([{ role: 'ai', content: buildOpeningMessage(ctx) }])
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setThinking(false)
    setStarted(true)
  }

  function reset() {
    sessionIdRef.current += 1
    setStarted(false)
    setMessages([])
    setInput('')
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setThinking(false)
  }

  // Lightweight price extractor (mirrors lib/bargain/text.extractPrice)
  function extractPriceLocal(text: string): number | null {
    const patterns = [
      /(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d{1,2})?)/i,
      /(\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?)/i,
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

  function detectWalkoutLocal(text: string): boolean {
    const t = text.toLowerCase()
    if (/(?:leaving|going)\s+(?:for|to)\s+(?:work|school|gym|dinner|lunch)/.test(t)) return false
    if (/(?:i'?m|i am)\s+(?:out|leaving|done)/.test(t)) return true
    if (/forget\s+(?:it|this)/.test(t)) return true
    if (/never\s+mind|bye|goodbye/.test(t)) return true
    if (/(?:too\s+expensive|rip\s*off|can'?t\s+afford)/.test(t)
      && /\b(?:leav|go|walk|out|away|elsewhere|another)\b/.test(t)) return true
    return false
  }

  function replyDelay(len: number) {
    return 650 + Math.min(len, 240) * 1.1
  }

  async function send() {
    if (!input.trim() || ended || thinking) return
    const userText = input.trim()
    const offer = extractPriceLocal(userText)
    const isWalkout = detectWalkoutLocal(userText)

    const nextAttempt = attemptsUsed + 1
    const attemptsLeft = MAX_ATTEMPTS - nextAttempt
    const exhausted = nextAttempt >= MAX_ATTEMPTS

    const ctx: NegotiationContext = {
      storeName: 'Lumina Beauty',
      currencySymbol: '₹',
      originalPrice: product.price,
      minPrice,
      attemptsUsed,
      maxAttempts: MAX_ATTEMPTS,
      persona,
      productTitle: product.title,
      language,
    }

    let reply = ''
    let counterOffer: number | null = null
    let decision: NegotiationResult['decision'] = 'counter'
    let newEnded: null | 'accepted' | 'rejected' | 'abandoned' | 'skipped' = null
    let newFinal: number | null = null

    // Walkout with zero attempts left always abandons locally
    if (isWalkout && attemptsLeft <= 0) {
      reply = FAREWELLS[persona]
      newEnded = 'abandoned'
    } else {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
        offeredPrice: m.offeredPrice ?? undefined,
      }))

      try {
        const res = await fetch('/api/bargain/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            offer,
            history,
            storeName: ctx.storeName,
            currencySymbol: ctx.currencySymbol,
            originalPrice: ctx.originalPrice,
            minPrice: ctx.minPrice,
            maxAttempts: ctx.maxAttempts,
            attemptsUsed: ctx.attemptsUsed,
            persona: ctx.persona,
            productTitle: ctx.productTitle,
            language: ctx.language,
            walkoutTriggered: isWalkout,
          }),
        })
        const data = await res.json()
        if (res.ok && typeof data?.reply === 'string' && data.reply.trim()) {
          reply = data.reply
          counterOffer = typeof data.counterOffer === 'number' ? data.counterOffer : null
          if (data.decision === 'accept') decision = 'accept'
          else if (data.decision === 'reject') decision = 'reject'
          else decision = 'counter'
        }
      } catch {}

      // AI unavailable / rate-limited → local fallback engine
      if (!reply) {
        if (isWalkout && attemptsLeft > 0) {
          const lastCounter = [...messages].reverse().find(m => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null
          const r = retentionOffer(ctx, lastCounter)
          reply = r.reply
          counterOffer = r.counterOffer ?? null
        } else if (offer != null) {
          const result = ruleBasedDecision(offer, { ...ctx, attemptsUsed })
          reply = result.reply
          counterOffer = result.counterOffer ?? null
          decision = result.decision
        } else {
          const counter = graduatedCounter({ ...ctx, attemptsUsed })
          reply = `What price did you have in mind? I could probably do ₹${counter.toFixed(2)} if you make me a fair offer.`
          counterOffer = counter
        }
      }
    }

    // Exhausted final attempt → reject
    if (newEnded != null) {
      // already abandoned
    } else if (exhausted && decision !== 'accept') {
      newEnded = 'rejected'
    } else if (decision === 'accept') {
      newEnded = 'accepted'
      newFinal = newFinal ?? offer ?? counterOffer ?? null
    }

    const sid = sessionIdRef.current
    setMessages(prev => [...prev, { role: 'customer', content: userText, offeredPrice: offer }])
    setAttemptsUsed(nextAttempt)
    setInput('')
    setThinking(true)

    window.setTimeout(() => {
      if (sessionIdRef.current !== sid) return
      setMessages(prev => [...prev, { role: 'ai', content: reply, offeredPrice: counterOffer }])
      setThinking(false)
      if (newEnded) setEnded(newEnded)
      if (newFinal != null) setFinalPrice(newFinal)
    }, replyDelay(reply.length))
  }

  function skipFullPrice() {
    if (ended || thinking) return
    const reply = SKIP_REPLIES[persona].replace('₹PRICE', `₹${product.price}`)
    const sid = sessionIdRef.current
    setMessages(prev => [...prev, { role: 'customer', content: "Actually, I'll just buy it at the full price." }])
    setInput('')
    setThinking(true)
    window.setTimeout(() => {
      if (sessionIdRef.current !== sid) return
      setMessages(prev => [...prev, { role: 'ai', content: reply }])
      setThinking(false)
      setEnded('skipped')
    }, replyDelay(reply.length))
  }

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsUsed)

  if (alreadyUsed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-900/60 border border-blue-800/30 rounded-2xl p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-blue-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">This session is already booked</h1>
          <p className="text-sm text-blue-200/70 mb-6">
            Your one-time demo was used from another tab. Each account gets a single live session.
          </p>
          <Link href="/" className="text-blue-300 hover:text-blue-200 text-sm underline underline-offset-2">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-lg border-b border-blue-800/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/favicon-32x32.png"
              alt="CartGain"
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg"
            />
            <span className="text-lg font-bold">CartGain</span>
            <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-900/50 text-blue-300 border border-blue-700/40">
              Live Demo
            </span>
          </Link>
          {status === 'authenticated' ? (
            <div className="flex items-center gap-3">
              <span className="hidden md:inline max-w-48 truncate text-xs text-blue-300/70">{session?.user?.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-blue-800/40 text-xs font-semibold rounded-lg transition active:scale-95"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/signup"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-sm font-semibold rounded-lg transition active:scale-95"
            >
              Get Started Free
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-700/40 text-blue-300 text-xs mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Interactive Bargain Demo
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Try the AI negotiator. <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Live.</span>
          </h1>
          <p className="text-blue-200/70 text-sm sm:text-base max-w-2xl mx-auto">
            Pick a product, pick a persona, pick a language — and bargain with the exact AI our engine runs on real beauty stores.
            Talks in English, Hinglish, Hindi, Tamil, Telugu, Bengali, Marathi & Punjabi.
            One live session per account, signed in and server-verified.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-blue-300/50">
            <Lock className="w-3 h-3" /> One-time per account · Margins protected · No stored chat
          </p>
        </div>

        {/* Setup panel */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          {/* Product picker */}
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" /> 1. Choose a product
            </h3>
            <div className="space-y-2">
              {PRODUCTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setProduct(p); reset() }}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition text-left ${
                    product.id === p.id ? 'bg-blue-900/40 border border-blue-600/50' : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <Image src={p.image} alt={p.title} width={40} height={40} className="rounded-md object-cover" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-xs text-blue-300/70">₹{p.price}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Persona picker */}
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> 2. Pick a negotiator
            </h3>
            <div className="space-y-2">
              {PERSONAS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPersona(p.id); reset() }}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    persona === p.id ? 'bg-blue-900/40 border border-blue-600/50' : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-blue-300/70 mt-0.5">{p.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Language picker */}
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> 3. Choose a language
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {LANGUAGES.map(l => (
                <button
                  key={l.id}
                  onClick={() => { setLanguage(l.id); started && reset() }}
                  className={`px-2 py-1.5 text-xs rounded-lg transition ${
                    language === l.id
                      ? 'bg-blue-900/40 border border-blue-600/50 text-blue-100'
                      : 'hover:bg-slate-800/50 border border-transparent text-blue-300/70'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Start button */}
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> 4. Start bargaining
              </h3>
              <div className="text-xs text-blue-300/70 space-y-1.5 mb-4">
                <div className="flex justify-between">
                  <span>Listed price</span>
                  <span className="font-mono text-white">₹{product.price}</span>
                </div>
                <div className="flex justify-between">
                  <span>Floor (hidden from customer)</span>
                  <span className="font-mono text-amber-300">₹{minPrice}</span>
                </div>
                <div className="flex justify-between">
                  <span>Max attempts</span>
                  <span className="font-mono text-white">{MAX_ATTEMPTS}</span>
                </div>
              </div>
            </div>
            {!started ? (
              <button
                onClick={start}
                className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 text-sm font-semibold rounded-lg transition active:scale-95"
              >
                Start Bargain Session
              </button>
            ) : (
              <button
                onClick={reset}
                className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-sm font-semibold rounded-lg transition active:scale-95 flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Reset Session
              </button>
            )}
          </div>
        </div>

        {/* Chat panel */}
        {started && (
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
            {/* Status bar */}
            <div className="px-4 py-3 border-b border-blue-800/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-blue-200">{PERSONAS.find(p => p.id === persona)?.name}</span>
              </div>
              <div className="flex items-center gap-3 text-blue-300/70">
                <span>{thinking ? 'negotiating…' : `Attempts left: ${attemptsLeft}`}</span>
                {ended && (
                  <span className={`px-2 py-0.5 rounded-full ${
                    ended === 'accepted' || ended === 'skipped'
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : 'bg-red-900/40 text-red-300'
                  }`}>
                    {ended}
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-slate-950/40 to-transparent">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                      m.role === 'customer'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-slate-800 text-blue-100 rounded-bl-sm border border-blue-800/40'
                    }`}
                  >
                    <div>{m.content}</div>
                    {m.offeredPrice != null && (
                      <div className="text-[11px] mt-1 opacity-70 font-mono">
                        {m.role === 'customer' ? 'offered' : 'counter'}: ₹{m.offeredPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-blue-800/40 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Outcome banner */}
            {ended === 'accepted' && finalPrice != null && (
              <div className="px-4 py-4 bg-emerald-900/20 border-t border-emerald-700/40 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-emerald-200">Deal accepted at ₹{finalPrice.toFixed(2)}!</div>
                  <div className="text-xs text-emerald-300/80 mt-0.5">
                    Customers save ₹{(product.price - finalPrice).toFixed(2)}. A 1-use, 24-hour discount code is
                    auto-generated at checkout on a real store.
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 border border-emerald-600/40 rounded-lg font-mono text-xs text-emerald-200">
                  <BadgeCheck className="w-4 h-4 text-emerald-400" />
                  {DEMO_CODES[product.id] ?? 'DEAL'}
                </div>
              </div>
            )}
            {ended === 'rejected' && (
              <div className="px-4 py-4 bg-red-900/20 border-t border-red-700/40 text-sm text-red-200">
                Negotiation ended — attempts exhausted. The customer walked without buying.
                On a real store, this session feeds into CartGain&apos;s cart-recovery flow with &quot;missed bargain&quot; context.
              </div>
            )}
            {ended === 'abandoned' && (
              <div className="px-4 py-4 bg-amber-900/20 border-t border-amber-700/40 text-sm text-amber-200">
                Session abandoned. On a real store, this triggers the WhatsApp / Email recovery sequence.
              </div>
            )}
            {ended === 'skipped' && (
              <div className="px-4 py-4 bg-slate-800/60 border-t border-slate-600/50 text-sm text-blue-200">
                Full-price purchase — no discount generated, margin fully intact. On a real store this is a valid,
                protected outcome too.
              </div>
            )}

            {/* Input */}
            {!ended && (
              <>
                <div className="p-4 border-t border-blue-800/30 flex items-center gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') send() }}
                    placeholder={`Make an offer (e.g. "₹${Math.round(product.price * 0.7)}" or "I will think about it")`}
                    className="flex-1 bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-blue-300/40 focus:outline-none focus:border-blue-500"
                    maxLength={300}
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || thinking}
                    className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-lg transition active:scale-95"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-4 pb-3 -mt-1 flex justify-end">
                  <button
                    onClick={skipFullPrice}
                    className="text-xs text-blue-300/60 hover:text-blue-200 underline underline-offset-2 transition"
                    aria-label="Skip negotiation and buy at full price"
                  >
                    Skip — buy at full price (₹{product.price})
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Try-it tips */}
        {started && !ended && (
          <div className="mt-4 text-xs text-blue-300/60 grid sm:grid-cols-3 gap-2">
            <div className="bg-slate-900/40 border border-blue-800/20 rounded-lg p-3">
              <div className="font-semibold text-blue-200 mb-1">Free / lowball</div>
              Try &quot;₹0&quot; or &quot;free&quot; — see how the persona handles it.
            </div>
            <div className="bg-slate-900/40 border border-blue-800/20 rounded-lg p-3">
              <div className="font-semibold text-blue-200 mb-1">Walkout threat</div>
              Try &quot;too expensive, I will leave&quot; — watch the retention offer.
            </div>
            <div className="bg-slate-900/40 border border-blue-800/20 rounded-lg p-3">
              <div className="font-semibold text-blue-200 mb-1">Just above floor</div>
              Try &quot;&#8377;{Math.ceil(minPrice + 20)}&quot; to see acceptance instantly.
            </div>
          </div>
        )}

        {/* Recovery story callout */}
        <div className="mt-16 bg-gradient-to-br from-blue-900/30 to-purple-900/20 border border-blue-700/30 rounded-xl p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Bargaining is just the start.</h2>
          <p className="text-blue-200/70 text-sm sm:text-base mb-4 max-w-3xl">
            When a bargain session is abandoned, CartGain&apos;s WhatsApp + Email + SMS recovery sequence picks it up — with the
            missed-deal context surfaced in every message. One platform, three touch-points, one recovered cart.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-semibold transition active:scale-95"
            >
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://wa.me/918708718426"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-blue-700/40 rounded-lg text-sm font-semibold transition active:scale-95"
            >
              <MessageCircle className="w-4 h-4" /> Talk to a human
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-blue-800/30 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-xs text-blue-300/50">
          CartGain · Recover what you are losing ·{' '}
          <Link href="/" className="hover:text-blue-200 transition">Home</Link> ·{' '}
          <Link href="/pricing" className="hover:text-blue-200 transition">Pricing</Link> ·{' '}
          <Link href="/signup" className="hover:text-blue-200 transition">Sign up</Link>
        </div>
      </footer>
    </div>
  )
}