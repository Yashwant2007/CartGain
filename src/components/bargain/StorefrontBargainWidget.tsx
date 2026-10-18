'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ShoppingCart, CheckCheck, Clock3 } from 'lucide-react'
import { currencySymbolFor } from '@/lib/bargain/i18n'
import { extractPrice, detectWalkout } from '@/lib/bargain/text'
import { reciprocalCounter, isAbsurdOffer, absurdOfferReply, type NegotiationContext } from '@/lib/bargain/engine'

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

const ENGINE_TO_LOCAL: Record<string, 'friendly' | 'strict' | 'playful'> = {
  friendly_shopkeeper: 'friendly',
  strict_negotiator: 'strict',
  playful_friend: 'playful',
}

const PERSONA_DISPLAY: Record<string, string> = {
  friendly: 'Friendly',
  strict: 'Strict',
  playful: 'Playful',
}

function money(currency: string, n: number): string {
  return `${currencySymbolFor(currency)}${n.toFixed(2)}`
}

// Stable per-message id for React keys + optimistic delivery tracking.
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

type ChatLine = {
  role: string
  content: string
  price?: number
  id: string
  // 'sending' → the shopper's bubble shows a clock; 'delivered' → a single tick.
  delivery: 'sending' | 'delivered'
}

type Props = {
  mode: 'item' | 'cart'
  shop: string
  currency: string
  line: Line
  checkoutUrl: string
  language?: string
  persona?: string
  maxAttempts?: number
  minProfitPercent?: number
}

const PERSONA_MAP: Record<string, string> = {
  friendly: 'friendly_shopkeeper',
  strict: 'strict_negotiator',
  playful: 'playful_friend',
}

export default function StorefrontBargainWidget({
  mode,
  shop,
  currency,
  line,
  checkoutUrl,
  language = 'auto',
  persona: personaProp,
  maxAttempts = 3,
  minProfitPercent = 25,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  const isCart = line.kind === 'cart'
  const productId = !isCart ? line.id : null
  const variantId = !isCart ? (line.variantId || null) : null

  const [step, setStep] = useState<'intro' | 'chat' | 'deal' | 'rejected'>('intro')
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [input, setInput] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [persona, setPersona] = useState<'friendly' | 'strict' | 'playful'>(() =>
    personaProp && ENGINE_TO_LOCAL[personaProp] ? ENGINE_TO_LOCAL[personaProp] : 'friendly',
  )
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [codeSaved, setCodeSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // The "thinking" dots are held back until the delivered tick has landed, so
  // the sequence reads naturally: message → delivered tick → thinking → reply.
  const [showThinking, setShowThinking] = useState(false)
  const thinkingTimerRef = useRef<number | null>(null)
  const thinkingShownAtRef = useRef(0)
  // Synchronous in-flight guard: blocks a second Enter/click that lands before
  // the `loading` state re-render, so a message is never sent twice.
  const busyRef = useRef(false)

  const originalPrice = line.kind === 'cart' ? line.total : line.price
  const minPrice = Math.round(originalPrice * (1 - minProfitPercent / 100) * 100) / 100
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

  // Local fallback pacing (only used if the API is unreachable) — the same
  // offer-aware, reciprocal model as the server so the client can never disagree
  // with it. Responds to the customer's actual offer and the AI's last standing
  // price, so counters are monotonic and never a fixed schedule.
  const localCounter = (attemptsUsed: number, offer: number | null, lastCounter: number | null): number =>
    reciprocalCounter({
      storeName: shop,
      currencySymbol: currencySymbolFor(currency),
      originalPrice,
      minPrice,
      attemptsUsed,
      maxAttempts,
      persona: PERSONA_MAP[persona] as NegotiationContext['persona'] ?? 'friendly_shopkeeper',
      productTitle: title,
      language,
      lastCounter,
    } as NegotiationContext, offer)

  const PersonaOpenings: Record<string, (item: string, price: number, fmt: (n: number) => string) => string> = {
    friendly: (item, price, f) =>
      `Hey! Welcome! I see you're interested in ${item}. It's listed at ${f(price)}. I'd love to help you get a good deal — what price were you thinking?`,
    strict: (item, price, f) =>
      `Thank you for your interest in ${item}. The current price is ${f(price)}. I'm open to a fair offer. What price were you considering?`,
    playful: (item, price, f) =>
      `Hey hey! I see you're checking out ${item} — nice choice! Listed at ${f(price)}, but hey, that's just the starting point. What's your move?`,
  }

  const PersonaAccept: Record<string, (p: number, f: (n: number) => string) => string> = {
    friendly: (p, f) => `Done! ${f(p)} works for me. Shall we lock it in?`,
    strict: (p, f) => `Transaction confirmed at ${f(p)}. A discount code will be generated.`,
    playful: (p, f) => `DEAL! Told you we'd get there! Code's coming right up.`,
  }

  const PersonaCounter: Record<string, (offer: number, counter: number, f: (n: number) => string) => string> = {
    friendly: (offer, counter, f) => `Hmm, ${f(offer)} is a bit low for me. Let me meet you partway — how about ${f(counter)}? I think that's fair given the quality.`,
    strict: (offer, counter, f) => `My offer already reflects the market rate for this quality tier. I can offer ${f(counter)}.`,
    playful: (offer, counter, f) => `Can *I* do better? The real question is, can *you*? Just kidding — here's my final. ${f(counter)}. That's it. No more. Maybe.`,
  }

  const PersonaRetention: Record<string, (price: number, f: (n: number) => string) => string> = {
    friendly: (price, f) => `Wait, friend — before you go! For you, I can do ${f(price)}. That's me stretching every rupee. Please stay — I really want this to work for you.`,
    strict: (price, f) => `One moment. I am prepared to make a one-time adjustment to ${f(price)}. Beyond that, my offer stands. Your decision.`,
    playful: (price, f) => `WAIT WAIT WAIT! Okay, you drive a hard bargain. FINAL final offer: ${f(price)}. I'm risking my job for this. Deal?`,
  }

  const PersonaFarewell: Record<string, string> = {
    friendly: "I understand, friend. The door's always open. Take care!",
    strict: 'Understood. This negotiation is closed.',
    playful: 'Aw, really? No hard feelings! Come back anytime',
  }

  // Human send rhythm — the sequence should read like a real messaging app:
  //   1. your bubble paints instantly (with a "sending" clock)
  //   2. a single delivered tick lands almost immediately
  //   3. the three-dot "thinking" bubble appears a beat later
  //   4. the reply arrives, and is never yanked in faster than a typed pace
  // The minimum is length-scaled so a one-word reply still feels considered,
  // while a long one is never padded.
  const TICK_MS = 180
  const THINKING_DELAY_MS = 380
  const minThinkingMs = (reply: string) =>
    Math.min(1000, Math.max(460, reply.length * 6))
  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

  const markDelivered = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, delivery: 'delivered' } : m)))
  }, [])

  const pushAi = useCallback((content: string, price?: number) => {
    setMessages((prev) => [...prev, { role: 'ai', content, price, id: uid(), delivery: 'delivered' }])
  }, [])

  const handleSend = async () => {
    if (!input.trim() || loading || busyRef.current) return
    const userText = input.trim()
    busyRef.current = true
    const userMsgId = uid()
    setMessages((prev) => [
      ...prev,
      { role: 'customer', content: userText, id: userMsgId, delivery: 'sending' },
    ])
    setInput('')
    setLoading(true)
    setError(null)
    // Optimistic delivery ack: flip the clock to a single tick almost
    // immediately so the bubble reads "sent" while the assistant thinks — the
    // same rhythm as a real messaging app. The finally block guarantees the
    // tick lands even when the round-trip resolves faster than the timer.
    const ack = window.setTimeout(() => markDelivered(userMsgId), TICK_MS)

    // Hold the thinking bubble back until the tick has landed, then guarantee a
    // minimum visible "typing" beat before the reply is revealed.
    setShowThinking(false)
    thinkingShownAtRef.current = 0
    const thinkingReady = new Promise<void>((resolve) => {
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current)
      thinkingTimerRef.current = window.setTimeout(() => {
        thinkingShownAtRef.current = Date.now()
        setShowThinking(true)
        resolve()
      }, THINKING_DELAY_MS)
    })

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
          minPrice,
          maxAttempts,
          attemptsUsed: attempts,
          persona: PERSONA_MAP[persona] || 'friendly_shopkeeper',
          personaSource: 'store',
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

      if (data.persona && ENGINE_TO_LOCAL[data.persona]) {
        setPersona(ENGINE_TO_LOCAL[data.persona])
      }

      const nextAttempt = attempts + 1
      // A joke offer far below the floor gets a persona reply but must not burn
      // the customer's bargain budget — otherwise "₹5 … ₹2" ends the session at
      // "you've reached the limit" without a real round having happened.
      const isAbsurdTurn = offer != null && isAbsurdOffer(offer, { minPrice, originalPrice })
      const exhausted = !isAbsurdTurn && nextAttempt >= maxAttempts

      // 'chat' replies (product questions, greetings) carry no price — only a
      // real counter/accept lands a "Counter: ₹X" tag on the bubble.
      const priceTag = data.decision !== 'chat' && typeof data.counterOffer === 'number'
        ? data.counterOffer
        : undefined
      await thinkingReady
      const seenFor = Date.now() - thinkingShownAtRef.current
      const hold = minThinkingMs(data.reply ?? '') - seenFor
      if (hold > 0) await wait(hold)
      pushAi(data.reply, priceTag)
      setAttempts(isAbsurdTurn ? attempts : nextAttempt)

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
      const userText = input.trim()
      const offer = extractPrice(userText)
      const isWalkout = detectWalkout(userText)
      const nextAttempt = attempts + 1
      const exhausted = nextAttempt >= maxAttempts
      const lastAiPrice = [...messages].reverse().find((m) => m.role === 'ai' && m.price != null)?.price ?? null

      let result: { reply: string; decision: string; counterOffer?: number }
      let newStep: string = 'chat'
      let newFinal: number | null = null
      let newCode: string | null = null

      if (isWalkout && attempts < maxAttempts - 1) {
        const lastCounter = [...messages].reverse().find((m) => m.role === 'ai' && m.price != null)?.price ?? originalPrice
        const stepSize = Math.max(Math.round((originalPrice - minPrice) * 0.08 * 100) / 100, 1)
        const p = Math.max(minPrice, Math.round((lastCounter - stepSize) * 100) / 100)
        result = { reply: PersonaRetention[persona](p, (n) => money(currency, n)), decision: 'counter', counterOffer: p }
      } else if (isWalkout) {
        pushAi(PersonaFarewell[persona])
        setStep('rejected')
        setLoading(false)
        return
      } else if (offer != null) {
        if (offer >= minPrice) {
          result = { reply: PersonaAccept[persona](offer, (n) => money(currency, n)), decision: 'accept', counterOffer: offer }
        } else if (isAbsurdOffer(offer, { minPrice, originalPrice })) {
          // Absurd → persona reply, NO counter price. Count the trailing run of
          // absurd customer offers so the copy escalates instead of repeating.
          let absurdStreak = 1
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.role !== 'customer') continue
            const p = extractPrice(m.content)
            if (p == null) continue
            if (isAbsurdOffer(p, { minPrice, originalPrice })) absurdStreak++
            else break
          }
          const reply = absurdOfferReply(offer, {
            storeName: shop,
            currencySymbol: currencySymbolFor(currency),
            originalPrice,
            minPrice,
            attemptsUsed: nextAttempt,
            maxAttempts,
            persona: PERSONA_MAP[persona] as NegotiationContext['persona'] ?? 'friendly_shopkeeper',
            productTitle: title,
            language,
            lastCounter: lastAiPrice,
            absurdStreak,
          })
          result = { reply, decision: 'chat' }
        } else {
          const counter = localCounter(attempts, offer, lastAiPrice)
          result = { reply: PersonaCounter[persona](offer, counter, (n) => money(currency, n)), decision: 'counter', counterOffer: counter }
        }
      } else {
        const counter = localCounter(attempts, null, lastAiPrice)
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

      await thinkingReady
      const seenFor = Date.now() - thinkingShownAtRef.current
      const hold = minThinkingMs(result.reply) - seenFor
      if (hold > 0) await wait(hold)
      pushAi(result.reply, result.counterOffer)
      setAttempts(nextAttempt)
    } finally {
      window.clearTimeout(ack)
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current)
      markDelivered(userMsgId)
      setShowThinking(false)
      setLoading(false)
      busyRef.current = false
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
    <div
      ref={rootRef}
      className="w-full bg-white text-gray-900 rounded-xl shadow-lg border border-gray-200"
      data-cg-bargain-widget
      role="region"
      aria-label="Price negotiation"
    >
      {/* Scoped chat motion — namespaced so no Shopify theme CSS is touched.
          A single delivered tick, a calm three-dot thinking pulse, and a soft
          bubble entrance keep the negotiation feeling quick and professional. */}
      <style>{`
        .cgf-msg { animation: cgfMsgIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) }
        @keyframes cgfMsgIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }

        .cgf-tick {
          display: inline-flex; align-items: center; gap: 3px; margin-left: 6px;
          vertical-align: -1px; color: #c7d2fe; opacity: 0.55;
          font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em;
          transition: color 0.2s ease, opacity 0.2s ease;
        }
        .cgf-tick-in {
          color: #ffffff; opacity: 1;
          animation: cgfTickIn 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes cgfTickIn {
          0% { opacity: 0; transform: scale(0.6) }
          60% { transform: scale(1.12) }
          100% { opacity: 1; transform: scale(1) }
        }

        .cgf-dot {
          width: 6px; height: 6px; border-radius: 999px; background: #818cf8;
          animation: cgfDot 1.1s infinite ease-in-out;
        }
        @keyframes cgfDot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0) scale(0.85) }
          40% { opacity: 1; transform: translateY(-2px) scale(1) }
        }

        @media (prefers-reduced-motion: reduce) {
          .cgf-msg, .cgf-tick, .cgf-tick-in, .cgf-dot { animation: none !important; transition: none !important }
          .cgf-tick { opacity: 1 }
        }
      `}</style>

      {step === 'intro' && (
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            {!isCart && line.image ? (
              <Image
                src={line.image}
                alt=""
                width={48}
                height={48}
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-500 flex-shrink-0">
                <ShoppingCart size={22} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 text-sm truncate" title={line.kind === 'item' ? line.title : ''}>{title}</p>
              <p className="text-gray-500 text-xs mt-0.5">Listed: {money(currency, originalPrice)}</p>
              {isCart && <p className="text-gray-500 text-xs mt-0.5">Negotiate the whole cart total</p>}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-600">{PersonaOpenings[persona](title, originalPrice, (n) => money(currency, n))}</p>

          <div className="text-[11px] text-indigo-600 bg-indigo-50 rounded-md px-3 py-1.5">
            This store runs: <span className="font-semibold">{PERSONA_DISPLAY[persona]}</span>
          </div>

          <button
            type="button"
            className={buttonCls + ' w-full'}
            onClick={() => setStep('chat')}
            aria-label="Start price negotiation"
          >
            Negotiate Price
          </button>
        </div>
      )}

      {step === 'chat' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Attempts left: {maxAttempts - attempts}/{maxAttempts}</p>
            <p className="text-xs text-indigo-500 font-medium">{PERSONA_DISPLAY[persona]}</p>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto" role="log" aria-live="polite" aria-label="Negotiation conversation">
            {messages.map((msg) => {
              const isCustomer = msg.role === 'customer'
              return (
                <div
                  key={msg.id}
                  className={`cgf-msg rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    isCustomer
                      ? 'bg-indigo-600 text-white text-right ml-8'
                      : 'bg-gray-100 text-gray-700 mr-8'
                  }`}
                >
                  {msg.content}
                  {isCustomer && (
                    <span
                      className={`cgf-tick ${msg.delivery === 'delivered' ? 'cgf-tick-in' : ''}`}
                      role="img"
                      aria-label={msg.delivery === 'delivered' ? 'Delivered' : 'Sending'}
                    >
                      {msg.delivery === 'delivered'
                        ? <><CheckCheck size={13} strokeWidth={2.5} /><span>Delivered</span></>
                        : <Clock3 size={10} />}
                    </span>
                  )}
                  {msg.price != null && (
                    <span className={`block mt-1 ${isCustomer ? 'text-indigo-200' : 'text-indigo-600'}`}>
                      {isCustomer ? 'Offered' : 'Counter'}: {money(currency, msg.price)}
                    </span>
                  )}
                </div>
              )
            })}
            {showThinking && (
              <div
                className="cgf-msg rounded-lg px-3 py-2.5 bg-gray-100 mr-8 inline-flex items-center gap-1.5"
                role="status"
                aria-label="Assistant is thinking"
              >
                <span className="sr-only">Assistant is thinking</span>
                <span className="cgf-dot" />
                <span className="cgf-dot" style={{ animationDelay: '0.15s' }} />
                <span className="cgf-dot" style={{ animationDelay: '0.3s' }} />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder='e.g. "₹400" or "I will think about it"'
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500"
              aria-label="Your offer or message"
            />
            <button
              type="button"
              className={buttonCls}
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label={loading ? 'Sending…' : 'Send offer'}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {step === 'deal' && finalPrice != null && (
        <div className="p-4 space-y-3 text-center">
          <p className="text-emerald-600 font-semibold text-sm">Deal Accepted!</p>
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
              <button
                type="button"
                className={`${ghostCls} text-xs`}
                onClick={copyCode}
                aria-label={copied ? 'Copied to clipboard' : 'Copy discount code'}
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{error}</p>}

          {codeSaved ? (
            <p className="text-xs text-emerald-600">Code is ready — copy it and apply at checkout.</p>
          ) : (
            <button type="button" className={buttonCls + ' w-full'} onClick={saveDeal} disabled={loading}>
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
        <div className="p-4 space-y-3 text-center">
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