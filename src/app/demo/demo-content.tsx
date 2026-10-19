'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { Send, Sparkles, MessageCircle, CheckCircle2, RotateCcw, ArrowRight, ShoppingBag, Lock, BadgeCheck, ShieldCheck, Check, Copy, ExternalLink, CheckCheck, Clock3, Loader2, Store } from 'lucide-react'
import {
  buildOpeningMessage,
  ruleBasedDecision,
  retentionOffer,
  reciprocalCounter,
  isAbsurdOffer,
  type Persona,
  type NegotiationContext,
  type NegotiationResult,
} from '@/lib/bargain/engine'
import { extractPrice, detectWalkout } from '@/lib/bargain/text'
import { buildQuickOffers } from '@/lib/bargain/offers'
import { currencySymbolFor } from '@/lib/bargain/i18n'
import type { BargainRecommendation } from '@/lib/bargain/api-types'

type ChatMsg = {
  role: 'customer' | 'ai'
  content: string
  offeredPrice?: number | null
  delivery?: 'sending' | 'delivered'
}

type DemoProduct = {
  id: string
  title: string
  price: number
  image: string
  shopifyProductId?: string
  variantId?: string
  real?: boolean
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

// Placeholder thumbnail for a real store product that has no image.
const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop'

const PERSONAS: { id: Persona; name: string; blurb: string }[] = [
  { id: 'friendly_shopkeeper', name: 'Alex — Friendly Shopkeeper', blurb: 'Warm, neighbourly, finds a way.' },
  { id: 'strict_negotiator', name: 'Morgan — Strict Negotiator', blurb: 'Precise, data-driven, no emoji.' },
  { id: 'playful_friend', name: 'Riley — Playful Friend', blurb: 'Cheeky, fun, makes you smile.' },
]

const LANGUAGES: { id: string; label: string }[] = [
  { id: 'auto', label: 'Auto · mirror me' },
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
    'Of course — that is the simplest path. Your order at ₹PRICE is ready whenever you are.',
  strict_negotiator:
    'A direct purchase at the listed price — no objections there. Your order at ₹PRICE is confirmed.',
  playful_friend:
    'Hey, the direct route works too. Your order at ₹PRICE is one click away.',
}

// Sample one-use codes a real store would auto-generate (1-use, 24h) per demo
// product. Real store products instead mint a genuine Shopify code on accept.
const DEMO_CODES: Record<string, string> = {
  serum: 'LUMINA-SERUM10',
  cream: 'LUMINA-GLASS5',
  mask: 'LUMINA-MASK15',
}

// Profit margin the demo "merchant" protects — 25% off is the floor
const DEMO_PROFIT_PERCENT = 25
const MAX_ATTEMPTS = 3
// Delay before the shopper's own bubble flips from a clock to a delivered tick.
const TICK_MS = 550

export default function DemoContent() {
  const { data: session, status } = useSession()
  const [product, setProduct] = useState<DemoProduct>(PRODUCTS[0])
  const [persona, setPersona] = useState<Persona>('friendly_shopkeeper')
  const [language, setLanguage] = useState<string>('auto')
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [ended, setEnded] = useState<null | 'accepted' | 'rejected' | 'abandoned' | 'skipped'>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [alreadyUsed, setAlreadyUsed] = useState(false)
  // Storefront-parity feature state: verified recommendation cards + the real
  // one-use discount code minted on accept.
  const [recommendations, setRecommendations] = useState<BargainRecommendation[]>([])
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [codeStatus, setCodeStatus] = useState<'idle' | 'minting' | 'ready' | 'failed'>('idle')
  const [copied, setCopied] = useState(false)
  // Real-catalog context — populated only when the signed-in merchant has a
  // connected Shopify store. Empty for everyone else (built-in demo products).
  const [realProducts, setRealProducts] = useState<DemoProduct[]>([])
  const [storeName, setStoreName] = useState('Lumina Beauty')
  const [storeDomain, setStoreDomain] = useState<string | null>(null)
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [catalogSource, setCatalogSource] = useState<'demo' | 'store'>('demo')

  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(0)
  // True once a deal was accepted in this exchange, so a stray follow-up chat
  // signals the backend that the deal is locked (never re-quote / renegotiate).
  const dealAcceptedRef = useRef(false)

  const minPrice = useMemo(
    () => Math.round((product.price * (1 - DEMO_PROFIT_PERCENT / 100)) * 100) / 100,
    [product],
  )

  const lastCounter = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'ai' && m.offeredPrice != null) return m.offeredPrice
    }
    return null
  }, [messages])

  // Offer-suggestion chips — identical rules to the live storefront widget
  // (server counter, then conservative percentages of the LISTED price; never
  // floor-derived).
  const quickOffers = useMemo(
    () => buildQuickOffers({ lastCounter, listedPrice: product.price, sessionEnded: !!ended, decision: ended ? 'accept' : 'counter' }),
    [lastCounter, product.price, ended],
  )

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking, recommendations])

  // Claim the one-time demo on mount — enforcement happens server-side
  useEffect(() => {
    fetch('/api/demo/claim', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data?.used === true) setAlreadyUsed(true)
      })
      .catch(() => {})
  }, [])

  // Pull the merchant's real catalog (if any). When a Shopify store is connected
  // the demo can run on the merchant's OWN products — enabling verified product
  // details, real recommendations and a real discount code. Otherwise this is a
  // no-op and the built-in demo products stay.
  useEffect(() => {
    if (status !== 'authenticated') return
    let alive = true
    fetch('/api/bargain/demo')
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return
        if (typeof data.currency === 'string' && data.currency) setCurrencySymbol(currencySymbolFor(data.currency) || '₹')
        if (typeof data.storeDomain === 'string' && data.storeDomain) setStoreDomain(data.storeDomain)
        if (data.storeConnected && Array.isArray(data.products) && data.products.length > 0) {
          const mapped: DemoProduct[] = data.products.map((p: any) => ({
            id: `sp-${p.shopifyProductId}`,
            title: typeof p.title === 'string' ? p.title : 'Product',
            price: Number(p.price),
            image: typeof p.image === 'string' && p.image ? p.image : PLACEHOLDER_IMG,
            shopifyProductId: String(p.shopifyProductId),
            variantId: p.variantId ? String(p.variantId) : undefined,
            real: true,
          }))
          setRealProducts(mapped)
          setCatalogSource('store')
          setProduct(mapped[0])
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [status])

  // Start a fresh demo
  function start() {
    const ctx: NegotiationContext = {
      storeName,
      currencySymbol,
      originalPrice: product.price,
      minPrice,
      attemptsUsed: 0,
      maxAttempts: MAX_ATTEMPTS,
      persona,
      productTitle: product.title,
      language,
    }
    sessionIdRef.current += 1
    dealAcceptedRef.current = false
    setMessages([{ role: 'ai', content: buildOpeningMessage(ctx) }])
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setThinking(false)
    setRecommendations([])
    setDiscountCode(null)
    setCodeStatus('idle')
    setCopied(false)
    setStarted(true)
  }

  function reset() {
    sessionIdRef.current += 1
    dealAcceptedRef.current = false
    setStarted(false)
    setMessages([])
    setInput('')
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setThinking(false)
    setRecommendations([])
    setDiscountCode(null)
    setCodeStatus('idle')
    setCopied(false)
  }

  function replyDelay(len: number) {
    return 250 + Math.min(len, 120) * 0.6
  }

  // Flip every pending customer bubble to a delivered tick. Pure UI ack — it
  // never claims more than "we have your message".
  function markDelivered() {
    setMessages(prev => prev.map(m => (m.role === 'customer' && m.delivery === 'sending' ? { ...m, delivery: 'delivered' } : m)))
  }

  // Mint a REAL one-use Shopify code for the merchant's own store. Only called
  // when the demo runs on a real store product; every failure is swallowed so
  // the demo still shows a sample code instead of dead-ending.
  async function mintRealCode(originalPrice: number, dealPrice: number): Promise<string | null> {
    if (!storeDomain || !product.shopifyProductId) return null
    const code = `CG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    try {
      const res = await fetch('/api/bargain/checkout-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: storeDomain,
          shopifyProductId: product.shopifyProductId,
          variantId: product.variantId,
          originalPrice,
          finalPrice: dealPrice,
          discountPercent: Math.max(0, Math.round((1 - dealPrice / originalPrice) * 100)),
          code,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success && typeof data.code === 'string') return data.code
    } catch {}
    return null
  }

  async function send() {
    if (!input.trim() || ended || thinking) return
    const userText = input.trim()
    const offer = extractPrice(userText)
    const isWalkout = detectWalkout(userText)

    const isOfferTurn = offer != null && !isAbsurdOffer(offer, { minPrice, originalPrice: product.price })
    const nextAttempt = isOfferTurn ? attemptsUsed + 1 : attemptsUsed
    const attemptsLeft = MAX_ATTEMPTS - nextAttempt
    const exhausted = isOfferTurn && nextAttempt >= MAX_ATTEMPTS

    const ctx: NegotiationContext = {
      storeName,
      currencySymbol,
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
            dealAccepted: dealAcceptedRef.current,
            finalPrice: newFinal ?? (ended === 'accepted' ? finalPrice : undefined),
            // Verified product identity — the server quotes real facts, real
            // recommendations and (on accept) a real code only when present.
            shopifyProductId: product.shopifyProductId,
            variantId: product.variantId,
          }),
        })
        const data = await res.json()
        if (res.ok && typeof data?.reply === 'string' && data.reply.trim()) {
          reply = data.reply
          counterOffer = typeof data.counterOffer === 'number' ? data.counterOffer : null
          if (data.decision === 'accept') decision = 'accept'
          else if (data.decision === 'reject') decision = 'reject'
          else decision = 'counter'
          if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
            setRecommendations(data.recommendations)
          }
        }
      } catch {}

      // AI unavailable / rate-limited → local fallback engine
      if (!reply) {
        const lastAiOffer = [...messages].reverse().find(m => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null
        if (isWalkout && attemptsLeft > 0) {
          const lastCounter = [...messages].reverse().find(m => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null
          const r = retentionOffer(ctx, lastCounter)
          reply = r.reply
          counterOffer = r.counterOffer ?? null
        } else if (offer != null) {
          let absurdStreak = 1
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.role !== 'customer' || m.offeredPrice == null) continue
            if (isAbsurdOffer(m.offeredPrice, ctx)) absurdStreak++
            else break
          }
          const result = ruleBasedDecision(offer, { ...ctx, attemptsUsed, lastCounter: lastAiOffer, absurdStreak })
          reply = result.reply
          counterOffer = result.counterOffer ?? null
          decision = result.decision
        } else {
          const counter = reciprocalCounter({ ...ctx, attemptsUsed, lastCounter: lastAiOffer } as NegotiationContext)
          reply = `What price did you have in mind? I could probably do ${currencySymbol}${counter.toFixed(2)} if you make me a fair offer.`
          counterOffer = counter
        }
      }
    }

    // Final round: judge the customer's own number before rejecting, exactly as
    // the storefront route does. Exhausting the attempt budget must not refuse
    // an offer that already clears the floor — that silently lost sales on the
    // live widget. Deterministic, no model call, floor never revealed.
    if (newEnded != null) {
      // already abandoned
    } else if (exhausted && offer != null && offer >= ctx.minPrice && decision !== 'accept') {
      newEnded = 'accepted'
      newFinal = newFinal ?? offer
      decision = 'accept'
      counterOffer = offer
      dealAcceptedRef.current = true
      reply = `${ctx.currencySymbol}${offer.toFixed(2)} works for me — generating your one-use discount code now.`
    } else if (exhausted && decision !== 'accept') {
      newEnded = 'rejected'
    } else if (decision === 'accept') {
      newEnded = 'accepted'
      newFinal = newFinal ?? offer ?? counterOffer ?? null
    }

    if (decision === 'accept') dealAcceptedRef.current = true

    const sid = sessionIdRef.current
    setMessages(prev => [...prev, { role: 'customer', content: userText, offeredPrice: offer, delivery: 'sending' }])
    window.setTimeout(() => { if (sessionIdRef.current === sid) markDelivered() }, TICK_MS)
    setAttemptsUsed(nextAttempt)
    setInput('')
    setThinking(true)

    // Deal closed → mint the code as early as possible so it's ready on reveal.
    if (newEnded === 'accepted' && newFinal != null) {
      if (product.real && product.shopifyProductId && storeDomain) {
        setCodeStatus('minting')
        void mintRealCode(product.price, newFinal).then((code) => {
          if (sessionIdRef.current !== sid) return
          if (code) { setDiscountCode(code); setCodeStatus('ready') }
          else { setDiscountCode(`CG-${product.id.slice(-5).toUpperCase() || 'DEAL'}`); setCodeStatus('failed') }
        })
      } else {
        setDiscountCode(DEMO_CODES[product.id] ?? 'DEAL')
        setCodeStatus('ready')
      }
    }

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
    const reply = SKIP_REPLIES[persona].replace('₹PRICE', `${currencySymbol}${product.price}`)
    const sid = sessionIdRef.current
    setMessages(prev => [...prev, { role: 'customer', content: "Actually, I'll just buy it at the full price.", delivery: 'sending' }])
    setInput('')
    setThinking(true)
    window.setTimeout(() => { if (sessionIdRef.current === sid) markDelivered() }, TICK_MS)
    window.setTimeout(() => {
      if (sessionIdRef.current !== sid) return
      setMessages(prev => [...prev, { role: 'ai', content: reply }])
      setThinking(false)
      setEnded('skipped')
    }, replyDelay(reply.length))
  }

  function copyCode() {
    if (!discountCode) return
    navigator.clipboard?.writeText(discountCode)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
      .catch(() => {})
  }

  function chooseProduct(p: DemoProduct) {
    setProduct(p)
    reset()
  }

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsUsed)
  const pickerProducts = catalogSource === 'store' && realProducts.length > 0 ? realProducts : PRODUCTS

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
              className="rounded"
            />
            <span className="font-bold text-lg">CartGain</span>
          </Link>
          {status === 'authenticated' ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-blue-300/60 hidden sm:inline">{session?.user?.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-blue-800/30 transition"
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-700/40 text-blue-300 text-xs mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Interactive Bargain Demo
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Try the AI negotiator. <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Live.</span>
          </h1>
          <p className="text-blue-200/70 text-sm sm:text-base max-w-2xl mx-auto">
            Pick a product, a persona, and a language — or leave it on Auto and it mirrors whatever language you type in.
            Talks in English, Hinglish, Hindi, Tamil, Telugu, Bengali, Marathi &amp; Punjabi.
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
            {realProducts.length > 0 && (
              <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-slate-950/60 border border-blue-800/30">
                <button
                  onClick={() => { setCatalogSource('store'); chooseProduct(realProducts[0]) }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition ${catalogSource === 'store' ? 'bg-blue-900/50 text-blue-100' : 'text-blue-300/70 hover:text-blue-200'}`}
                >
                  <Store className="w-3.5 h-3.5" /> Your store
                </button>
                <button
                  onClick={() => { setCatalogSource('demo'); chooseProduct(PRODUCTS[0]) }}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-md transition ${catalogSource === 'demo' ? 'bg-blue-900/50 text-blue-100' : 'text-blue-300/70 hover:text-blue-200'}`}
                >
                  Sample
                </button>
              </div>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {pickerProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => chooseProduct(p)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition text-left ${
                    product.id === p.id ? 'bg-blue-900/40 border border-blue-600/50' : 'hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <Image
                    src={p.image}
                    alt={p.title}
                    width={40}
                    height={40}
                    unoptimized
                    loading="lazy"
                    className="rounded-md object-cover"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-xs text-blue-300/70">{currencySymbol}{p.price.toLocaleString('en-IN')}</div>
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
                  <span className="font-mono text-white">{currencySymbol}{product.price}</span>
                </div>
                <div className="flex justify-between">
                  <span>Floor (hidden from customer)</span>
                  {product.real ? (
                    <span className="text-blue-200/60">from your store</span>
                  ) : (
                    <span className="font-mono text-amber-300">{currencySymbol}{minPrice}</span>
                  )}
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

        {!started && (
          <div className="text-center text-xs text-blue-300/60 mb-8">
            {realProducts.length > 0
              ? `Running on ${storeName}'s real catalog — verified product details, real recommendations and a real discount code on accept.`
              : 'Using sample products. Connect a Shopify store and this demo runs on your real catalog — with a real discount code on accept.'}
          </div>
        )}

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
                    className={`max-w-[86%] px-3.5 py-2.5 text-sm ${
                      m.role === 'customer'
                        ? 'bg-primary-600 rounded-2xl rounded-br-md'
                        : 'bg-slate-800 border border-blue-800/30 rounded-2xl rounded-bl-md text-blue-100'
                    }`}
                  >
                    {m.content}
                    {m.role === 'customer' && (
                      <span
                        className="inline-flex items-center ml-1.5 align-[-2px]"
                        aria-label={m.delivery === 'delivered' ? 'Delivered' : 'Sending'}
                      >
                        {m.delivery === 'delivered'
                          ? <CheckCheck className="w-3.5 h-3.5 text-white/70" />
                          : <Clock3 className="w-3 h-3 text-white/50" />}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Verified recommendation cards (only when a real store is connected) */}
              {recommendations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold tracking-wide uppercase text-blue-300/70">
                    You might also like
                  </div>
                  {recommendations.map(card => (
                    <div key={card.productId} className="flex gap-3 p-2.5 bg-slate-950/50 border border-blue-800/30 rounded-xl">
                      {card.imageUrl ? (
                        <Image
                          src={card.imageUrl}
                          alt={card.title}
                          width={48}
                          height={48}
                          unoptimized
                          loading="lazy"
                          className="rounded-md object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-blue-900/40 flex items-center justify-center shrink-0">
                          <ShoppingBag className="w-5 h-5 text-blue-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-blue-100 line-clamp-2">{card.title}</div>
                        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                          <span className="text-sm font-bold text-emerald-300">
                            {currencySymbolFor(card.currency) || currencySymbol}{card.price.toLocaleString('en-IN')}
                          </span>
                          {card.compareAtPrice != null && card.compareAtPrice > card.price && (
                            <span className="text-xs text-blue-300/50 line-through">
                              {currencySymbolFor(card.currency) || currencySymbol}{card.compareAtPrice.toLocaleString('en-IN')}
                            </span>
                          )}
                          {card.onSale && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300">On sale</span>
                          )}
                          {card.budgetFit === 'over' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-300">Over budget</span>
                          )}
                        </div>
                        {card.productUrl && (
                          <a
                            href={card.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2"
                          >
                            View product <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-blue-800/30 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Quick-offer chips — same rules as the live storefront widget */}
            {!ended && quickOffers.length > 0 && (
              <div className="px-4 pt-3 flex flex-wrap gap-2">
                {quickOffers.map(v => (
                  <button
                    key={v}
                    onClick={() => { setInput(String(v)) }}
                    disabled={thinking}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-900/40 border border-blue-600/40 text-blue-100 hover:bg-primary-600 hover:border-primary-600 transition disabled:opacity-50"
                  >
                    {currencySymbol}{v.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            )}

            {/* Outcome panels */}
            {ended === 'accepted' && (
              <div className="px-4 py-4 bg-emerald-900/20 border-t border-emerald-700/40">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-emerald-100">
                        Deal agreed at {currencySymbol}{finalPrice?.toFixed(2)}
                      </div>
                      <div className="text-xs text-emerald-200/70">
                        {product.real && codeStatus === 'ready'
                          ? 'A real one-use code was created on your store via Shopify — apply it at checkout within 24h.'
                          : codeStatus === 'minting'
                          ? 'Creating your one-use discount code…'
                          : 'A one-use code a real store would auto-issue (1 use · 24h).'}
                      </div>
                    </div>
                  </div>
                  {codeStatus === 'minting' ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/40 border border-emerald-600/40 text-xs text-emerald-200">
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                    </div>
                  ) : discountCode ? (
                    <button
                      onClick={copyCode}
                      title="Copy code"
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-900/40 border border-emerald-600/40 rounded-lg font-mono text-xs text-emerald-200 hover:bg-emerald-900/60 transition"
                    >
                      <BadgeCheck className="w-4 h-4 text-emerald-400" />
                      {discountCode}
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  ) : null}
                </div>
                {codeStatus === 'failed' && (
                  <div className="mt-2 text-[11px] text-amber-300/80">
                    Couldn&apos;t reach Shopify to mint a live code — showing a sample instead.
                  </div>
                )}
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
                    placeholder={`Make an offer (e.g. "${currencySymbol}${Math.round(product.price * 0.7)}" or "I will think about it")`}
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
                    Skip — buy at full price ({currencySymbol}{product.price})
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
              Try &quot;free&quot; or a very low number — see how the persona handles it.
            </div>
            <div className="bg-slate-900/40 border border-blue-800/20 rounded-lg p-3">
              <div className="font-semibold text-blue-200 mb-1">Just a complaint</div>
              Try &quot;that&apos;s too expensive&quot; — the AI won&apos;t mistake it for an offer.
            </div>
            <div className="bg-slate-900/40 border border-blue-800/20 rounded-lg p-3">
              <div className="font-semibold text-blue-200 mb-1">Walkout threat</div>
              Try &quot;too expensive, I will leave&quot; — watch the retention offer.
            </div>
          </div>
        )}

        {/* Recovery story callout */}
        <div className="mt-16 bg-gradient-to-br from-blue-900/30 to-purple-900/20 border border-blue-700/30 rounded-xl p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">Bargaining is just the start.</h2>
          <p className="text-blue-200/70 text-sm sm:text-base mb-4 max-w-3xl">
            When a bargain session is abandoned, CartGain&apos;s WhatsApp + Email recovery sequence picks it up — with the
            missed-deal context surfaced in every message. One platform, two touch-points, one recovered cart.
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
