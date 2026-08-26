'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Zap, Send, Sparkles, MessageCircle, CheckCircle2, RotateCcw, ArrowRight, ShoppingBag } from 'lucide-react'
import {
  buildOpeningMessage,
  ruleBasedDecision,
  retentionOffer,
  graduatedCounter,
  type Persona,
  type NegotiationContext,
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

// Profit margin the demo "merchant" protects — 25% off is the floor
const DEMO_PROFIT_PERCENT = 25
const MAX_ATTEMPTS = 3

export default function DemoPage() {
  const [product, setProduct] = useState<DemoProduct>(PRODUCTS[0])
  const [persona, setPersona] = useState<Persona>('friendly_shopkeeper')
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [ended, setEnded] = useState<null | 'accepted' | 'rejected' | 'abandoned'>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const minPrice = useMemo(
    () => Math.round((product.price * (1 - DEMO_PROFIT_PERCENT / 100)) * 100) / 100,
    [product],
  )

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

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
    }
    setMessages([{ role: 'ai', content: buildOpeningMessage(ctx) }])
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setStarted(true)
  }

  function reset() {
    setStarted(false)
    setMessages([])
    setInput('')
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
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

  function send() {
    if (!input.trim() || ended) return
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
    }

    let result
    let newEnded: null | 'accepted' | 'rejected' | 'abandoned' = null
    let newFinal: number | null = null

    if (isWalkout && attemptsLeft > 0) {
      // First walkout → retention offer
      const lastCounter = [...messages].reverse().find(m => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null
      result = retentionOffer(ctx, lastCounter)
    } else if (isWalkout) {
      // No attempts left + walks out → abandon
      const farewell = {
        friendly_shopkeeper: "I understand, friend. The door's always open. Take care! 👋",
        strict_negotiator: 'Understood. This negotiation is closed. You may start a new session anytime.',
        playful_friend: 'Aw, really? 😅 No hard feelings! Come back anytime 🙌',
      }[persona]
      setMessages(prev => [...prev, { role: 'customer', content: userText, offeredPrice: offer }, { role: 'ai', content: farewell }])
      setAttemptsUsed(nextAttempt)
      setEnded('abandoned')
      setInput('')
      return
    } else if (offer != null) {
      result = ruleBasedDecision(offer, { ...ctx, attemptsUsed })
      if (result.decision === 'accept') {
        newFinal = offer
      }
    } else {
      // No price mentioned → conversational graduated counter
      const counter = graduatedCounter({ ...ctx, attemptsUsed })
      result = {
        reply: `What price did you have in mind? I could probably do ₹${counter.toFixed(2)} if you make me a fair offer.`,
        decision: 'counter' as const,
        counterOffer: counter,
        tactic: 'invite_offer',
        sentiment: 'neutral',
      }
    }

    // Exhausted final attempt → reject
    if (exhausted && result.decision !== 'accept') {
      newEnded = 'rejected'
    } else if (result.decision === 'accept') {
      newEnded = 'accepted'
      newFinal = result.counterOffer ?? offer ?? null
    }

    setMessages(prev => [
      ...prev,
      { role: 'customer', content: userText, offeredPrice: offer },
      { role: 'ai', content: result.reply, offeredPrice: result.counterOffer ?? null },
    ])
    setAttemptsUsed(nextAttempt)
    if (newEnded) setEnded(newEnded)
    if (newFinal != null) setFinalPrice(newFinal)
    setInput('')
  }

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsUsed)

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
          <Link
            href="/signup"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-sm font-semibold rounded-lg transition active:scale-95"
          >
            Get Started Free
          </Link>
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
            Pick a product, pick a persona, and try to bargain. This is the exact logic our AI uses on real beauty stores
            — no signup, no backend, fully client-side.
          </p>
        </div>

        {/* Setup panel */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
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

          {/* Start button */}
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> 3. Start bargaining
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
                <span>Attempts left: <span className="font-mono font-semibold text-white">{attemptsLeft}</span></span>
                {ended && (
                  <span className={`px-2 py-0.5 rounded-full ${ended === 'accepted' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
                    {ended}
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4 sm:p-6 space-y-4">
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
            </div>

            {/* Outcome banner */}
            {ended === 'accepted' && finalPrice != null && (
              <div className="px-4 py-4 bg-emerald-900/20 border-t border-emerald-700/40 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-emerald-200">Deal accepted at ₹{finalPrice.toFixed(2)}!</div>
                  <div className="text-xs text-emerald-300/80">
                    Customers save ₹{(product.price - finalPrice).toFixed(2)}. On a real store, a Shopify discount code
                    (1-use, 24h) is auto-generated at checkout.
                  </div>
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

            {/* Input */}
            {!ended && (
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
                  disabled={!input.trim()}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-lg transition active:scale-95"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
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
