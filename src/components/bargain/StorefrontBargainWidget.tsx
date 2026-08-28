'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { currencySymbolFor } from '@/lib/bargain/i18n'

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

const PersonaLabels: Record<string, string> = {
  friendly: '😊 Alex — Friendly',
  strict: '📊 Morgan — Strict',
  playful: '😏 Riley — Playful',
}

function money(currency: string, n: number): string {
  return `${currencySymbolFor(currency)}${n.toFixed(2)}`
}

type Props = {
  mode: 'item' | 'cart'
  shop: string
  currency: string
  line: Line
  checkoutUrl: string
  language?: string
}

const PERSONA_MAP: Record<string, string> = {
  friendly: 'friendly_shopkeeper',
  strict: 'strict_negotiator',
  playful: 'playful_friend',
}

export default function StorefrontBargainWidget({ mode, shop, currency, line, checkoutUrl, language = 'auto' }: Props) {
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
  }

  const PersonaFarewell: Record<string, string> = {
    friendly: "I understand, friend. The door's always open. Take care! 👋",
    strict: 'Understood. This negotiation is closed.',
    playful: 'Aw, really? 😅 No hard feelings! Come back anytime 🙌',
  }
  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userText = input.trim()
    setMessages((prev) => [...prev, { role: 'customer', content: userText }])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const offer = extractPrice(userText)
      const isWalkout = detectWalkout(userText)
      const history = messages.map((m) => ({
        role: m.role === 'customer' ? 'customer' : 'ai',
        content: m.content,
        offeredPrice: typeof m.price === 'number' ? m.price : undefined,
      }))

      const res = await fetch(`/api/bargain/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          offer,
          history,
          storeName: shop,
          currencySymbol: currencySymbolFor(currency),
          originalPrice,
          minPrice: Math.round(originalPrice * (1 - PROFIT_PERCENT / 100) * 100) / 100,
          maxAttempts: MAX_ATTEMPTS,
          attemptsUsed: attempts,
          persona: PERSONA_MAP[persona] || 'friendly_shopkeeper',
          productTitle: title,
          language,
          walkoutTriggered: isWalkout,
          bulkQuantity: isCart ? undefined : null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || 'API error')
      }

      const nextAttempt = attempts + 1
      const exhausted = nextAttempt >= MAX_ATTEMPTS

      setMessages((prev) => [...prev, { role: 'ai', content: data.reply, price: data.counterOffer }])
      setAttempts(nextAttempt)

      if (data.decision === 'accept') {
        setStep('deal')
        setFinalPrice(data.counterOffer ?? offer)
        setDiscountCode(`BARGAIN_${Date.now().toString(36).toUpperCase()}`)
      } else if (data.decision === 'reject' || (exhausted && data.decision !== 'accept')) {
        setStep('rejected')
      } else {
        setStep('chat')
      }
    } catch (err: any) {
      console.warn('[StorefrontBargain] API failed, using local fallback:', err.message)
      // Local fallback logic
      const userText = input.trim()
      const offer = extractPrice(userText)
      const isWalkout = detectWalkout(userText)
      const nextAttempt = attempts + 1
      const exhausted = nextAttempt >= MAX_ATTEMPTS

      let result: { reply: string; decision: string; counterOffer?: number }
      let newStep: string = 'chat'
      let newFinal: number | null = null
      let newCode: string | null = null

      if (isWalkout && attempts < MAX_ATTEMPTS - 1) {
        const lastCounter = [...messages].reverse().find((m) => m.role === 'ai' && m.price != null)?.price ?? originalPrice
        const stepSize = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1)
        const p = Math.max(minPrice, Math.round((lastCounter - stepSize) * 100) / 100)
        result = { reply: PersonaRetention[persona](p, (n) => money(currency, n)), decision: 'counter', counterOffer: p }
      } else if (isWalkout) {
        setMessages((prev) => [...prev, { role: 'ai', content: PersonaFarewell[persona] }])
        setStep('rejected')
        setLoading(false)
        return
      } else if (offer != null) {
        if (offer >= minPrice) {
          result = { reply: PersonaAccept[persona](offer, (n) => money(currency, n)), decision: 'accept', counterOffer: offer }
        } else if (offer < minPrice * 0.3) {
          const counter = graduatedCounter(originalPrice, minPrice, attempts)
          result = { reply: PersonaLowball[persona](offer, counter, (n) => money(currency, n)), decision: 'counter', counterOffer: counter }
        } else {
          const counter = graduatedCounter(originalPrice, minPrice, attempts)
          if (exhausted) {
            result = { reply: PersonaFinal[persona](minPrice, (n) => money(currency, n)), decision: 'counter', counterOffer: minPrice }
          } else {
            result = { reply: PersonaCounter[persona](offer, counter, (n) => money(currency, n)), decision: 'counter', counterOffer: counter }
          }
        }
      } else {
        const counter = graduatedCounter(originalPrice, minPrice, attempts)
        result = {
          reply: `What price did you have in mind? I could probably do ${money(currency, counter)} if you make me a fair offer.`,
          decision: 'counter',
          counterOffer: counter,
        }
      }

      if (exhausted && result.decision !== 'accept') {
        setStep('rejected')
      } else if (result.decision === 'accept') {
        setStep('deal')
        setFinalPrice(result.counterOffer ?? offer)
        setDiscountCode(`BARGAIN_${Date.now().toString(36).toUpperCase()}`)
      } else {
        setStep('chat')
      }

      setMessages((prev) => [...prev, { role: 'ai', content: result.reply, price: result.counterOffer }])
      setAttempts(nextAttempt)
    } finally {
      setLoading(false)
    }
  }

  const saveDeal = async () => {
    if (!discountCode || !finalPrice || !shop) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bargain/checkout-accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: shop,
          shopifyProductId: isCart ? null : productId,
          variantId: isCart ? null : variantId,
          originalPrice,
          finalPrice,
          discountPercent: Math.round((1 - finalPrice / originalPrice) * 100),
          code: discountCode,
          orderLevel: isCart,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to create discount code')
      setCodeSaved(true)
    } catch (err: any) {
      setError(err.message || 'Failed to create discount code')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = async () => {
    if (!discountCode) return
    try {
      await navigator.clipboard.writeText(discountCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const buttonCls =
    'px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ' +
    'bg-indigo-600 text-white hover:bg-indigo-700 disabled:cursor-not-allowed'
  const ghostCls =
    'px-4 py-2 rounded-lg font-semibold text-sm transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200'
  return (
    <div ref={rootRef} className="w-full bg-white text-gray-900 rounded-xl shadow-lg border border-gray-200" data-cg-bargain-widget>
      {step === 'intro' && (
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            {!isCart && line.image ? (
              <Image src={line.image} alt="" width={48} height={48} className="w-12 h-12 rounded-lg object-cover" unoptimized />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center text-lg">🛒</div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{title}</p>
              <p className="text-gray-500 text-xs mt-0.5">Listed: {money(currency, originalPrice)}</p>
              {isCart && <p className="text-gray-500 text-xs mt-0.5">Negotiate the whole cart total</p>}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-600">{PersonaOpenings[persona](title, originalPrice, (n) => money(currency, n))}</p>

          <div className="flex flex-wrap gap-2">
            {Object.entries(PersonaLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPersona(value)}
                className={persona === value ? buttonCls : ghostCls}
              >
                {label}
              </button>
            ))}
          </div>

          <button type="button" className={buttonCls} onClick={() => setStep('chat')}>
            Start Bargaining
          </button>
        </div>
      )}

      {step === 'chat' && (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Attempts left: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}</p>
            <button type="button" className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setStep('intro')}>
              Change negotiator
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'customer'
                    ? 'bg-indigo-600 text-white text-right ml-8'
                    : 'bg-gray-100 text-gray-700 mr-8'
                }`}
              >
                {msg.content}
                {msg.price != null && (
                  <span className={`block mt-1 ${msg.role === 'customer' ? 'text-indigo-200' : 'text-indigo-600'}`}>
                    {msg.role === 'customer' ? 'Offered' : 'Counter'}: {money(currency, msg.price)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder='e.g. "₹400" or "I will think about it"'
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500"
            />
            <button type="button" className={buttonCls} onClick={handleSend} disabled={!input.trim() || loading}>
              {loading ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {step === 'deal' && finalPrice != null && (
        <div className="space-y-3 p-4 text-center">
          <p className="text-emerald-600 font-semibold text-sm">Deal Accepted! 🎉</p>
          <div>
            <p className="text-gray-900 font-bold text-lg">
              {isCart ? 'New order total:' : 'Final price:'} {money(currency, finalPrice)}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              You saved {money(currency, Math.max(0, originalPrice - finalPrice))} ({Math.round((1 - finalPrice / originalPrice) * 100)}%)
            </p>
          </div>

          <div className="bg-gray-100 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-500">Use this single-use code at checkout, valid 24h:</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-indigo-600 font-mono font-bold text-sm tracking-wider bg-indigo-100 rounded-lg px-3 py-1">
                {discountCode}
              </code>
              <button type="button" className={`${ghostCls} text-xs`} onClick={copyCode}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{error}</p>}

          {codeSaved ? (
            <p className="text-xs text-emerald-600">Code is ready — copy it and apply at checkout.</p>
          ) : (
            <button type="button" className={buttonCls} onClick={saveDeal} disabled={loading}>
              {loading ? 'Creating code…' : 'Create My Discount Code'}
            </button>
          )}

          <div className="flex justify-center gap-2 pt-1">
            <a href={checkoutUrl} className={buttonCls + ' no-underline'}>
              Go to Checkout
            </a>
            <button type="button" className={ghostCls} onClick={openBargain}>
              Bargain again
            </button>
          </div>
        </div>
      )}

      {step === 'rejected' && (
        <div className="space-y-3 p-4 text-center">
          <p className="text-red-500 font-semibold text-sm">Negotiation Ended</p>
          <p className="text-xs text-gray-500">Attempts exhausted. No deal this time.</p>
          <div className="flex justify-center gap-2">
            <a href={checkoutUrl} className={buttonCls + ' no-underline'}>
              Continue to Checkout
            </a>
            <button type="button" className={ghostCls} onClick={openBargain}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
