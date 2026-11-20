'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ShoppingCart, CheckCheck, Clock3 } from 'lucide-react'
import { currencySymbolFor, uiText, type UiKey } from '@/lib/bargain/i18n'
import { extractPrice, detectWalkout } from '@/lib/bargain/text'
import { reciprocalCounter, isAbsurdOffer, absurdOfferReply, type NegotiationContext } from '@/lib/bargain/engine'
import { GoalStrip } from '@/components/bargain/BargainPrimitives'
import { isConversationState, priorityReaction } from '@/lib/bargain/conversation-state'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import {
  resolveShopkeeperAnimation,
  type FireAvatarContext,
  type ShopkeeperAnimation,
} from '@/lib/bargain/experience/living'
import type { LivingEvent } from '@/lib/bargain/experience/avatar-state'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { BargainDemoGoal } from '@/lib/bargain/api-types'
import {
  createConversationId,
  minThinkingMs,
  REQUEST_TIMEOUT_MS,
  THINKING_DELAY_MS,
  TICK_MS,
  useConversationAutoScroll,
  wait,
} from '@/components/bargain/conversation-utils'

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
  strict_shopkeeper: 'strict',
  playful_shopkeeper: 'playful',
}

const PERSONA_DISPLAY: Record<string, string> = {
  friendly: 'Friendly',
  strict: 'Strict',
  playful: 'Playful',
}

const PERSONA_NAME: Record<string, string> = {
  friendly: 'Alex',
  strict: 'Morgan',
  playful: 'Riley',
}

const AVATAR_PERSONALITY: Record<string, ShopkeeperPersonality> = {
  friendly: 'friendly_shopkeeper',
  strict: 'strict_shopkeeper',
  playful: 'playful_shopkeeper',
}

function money(currency: string, n: number): string {
  return `${currencySymbolFor(currency)}${n.toFixed(2)}`
}

function sampleCode(productId: number | null, cart: boolean): string {
  const seed = cart ? 'CART' : String(productId ?? 'DEAL')
  return `CG-${seed.slice(-5).toUpperCase() || 'DEAL'}`
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
  demo?: boolean
  persona?: string
  maxAttempts?: number
  minProfitPercent?: number
  /** Active daily-goal preview (from /api/bargain/config or a demo turn). */
  goal?: BargainDemoGoal
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
  demo = true,
  persona: personaProp,
  maxAttempts = 3,
  minProfitPercent = 25,
  goal: goalProp,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerInputRef = useRef<HTMLInputElement>(null)
  const customerTypingRef = useRef(false)

  const isCart = line.kind === 'cart'
  const productId = !isCart ? line.id : null
  const variantId = !isCart ? (line.variantId || null) : null
  const t = (key: UiKey, vars?: Record<string, string | number>) => uiText(language, key, vars)

  const [step, setStep] = useState<'intro' | 'chat' | 'deal' | 'rejected'>('intro')
  const [messages, setMessages] = useState<ChatLine[]>([])
  const [input, setInput] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [persona, setPersona] = useState<'friendly' | 'strict' | 'playful'>(() =>
    personaProp && ENGINE_TO_LOCAL[personaProp] ? ENGINE_TO_LOCAL[personaProp] : 'friendly',
  )
  const [character, setCharacter] = useState<ShopkeeperAnimation>({
    state: 'listening',
    expression: 'listening',
    gesture: 'rest',
    position: 'conversation',
  })
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [codeSaved, setCodeSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Daily-goal strip: seeded from the config fetch, refreshed on every demo
  // turn (progress/pace come only from the server).
  const [goalState, setGoalState] = useState<BargainDemoGoal | undefined>(goalProp)
  const [shippingInfo, setShippingInfo] = useState<{
    total: number
    shippingCost: number
    freeShipping: boolean
    upsell: string | null
  } | null>(null)
  useEffect(() => {
    if (goalProp) setGoalState(goalProp)
  }, [goalProp])

  useEffect(() => () => requestAbortRef.current?.abort(), [])
  // The "thinking" dots are held back until the delivered tick has landed, so
  // the sequence reads naturally: message → delivered tick → thinking → reply.
  const [showThinking, setShowThinking] = useState(false)
  const {
    unread: conversationUnread,
    handleScroll: handleConversationScroll,
    noteSent: noteConversationSent,
    jumpToLatest: jumpToLatestMessage,
  } = useConversationAutoScroll({
    scrollRef,
    messageCount: messages.length,
    activityKey: showThinking,
  })
  const thinkingTimerRef = useRef<number | null>(null)
  const thinkingShownAtRef = useRef(0)
  // Synchronous in-flight guard: blocks a second Enter/click that lands before
  // the `loading` state re-render, so a message is never sent twice.
  const busyRef = useRef(false)
  const requestAbortRef = useRef<AbortController | null>(null)

  const originalPrice = line.kind === 'cart' ? line.total : line.price
  const minPrice = Math.round(originalPrice * (1 - minProfitPercent / 100) * 100) / 100
  const title = isCart ? t('yourCartOrder') : line.title

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

  const avatarPersonality = AVATAR_PERSONALITY[persona] ?? 'friendly_shopkeeper'
  const reactAvatar = (event: LivingEvent, ctx: FireAvatarContext = {}) => {
    setCharacter((prev) => {
      const resolved = resolveShopkeeperAnimation(avatarPersonality, event, { ...prev, ...ctx })
      const override = ctx.conversationState ? priorityReaction(ctx.conversationState as any) : null
      return override ? { ...resolved, expression: override } : resolved
    })
  }
  const latestAiLine = [...messages].reverse().find((m) => m.role === 'ai')?.content
  const stageLine = showThinking
    ? t('checking')
    : error || latestAiLine?.replace(/\s+/g, ' ').trim() || t('stageMakeOffer')

  const openBargain = () => {
    setStep('intro')
    reactAvatar('widget_opened', { opening: true })
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
  const markDelivered = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, delivery: 'delivered' } : m)))
  }, [])

  const pushAi = useCallback((content: string, price?: number) => {
    setMessages((prev) => [...prev, { role: 'ai', content, price, id: createConversationId('f'), delivery: 'delivered' }])
  }, [])

  const handleSend = async () => {
    if (!input.trim() || loading || busyRef.current) return
    customerTypingRef.current = false
    const userText = input.trim()
    requestAbortRef.current?.abort()
    const controller = new AbortController()
    requestAbortRef.current = controller
    const requestTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    // Complaint-aware: the same parser the server runs. A message like
    // "729 is too much" is not an offer, so the bubble must not tag it as one.
    const offer = extractPrice(userText)
    const isWalkout = detectWalkout(userText)
    busyRef.current = true
    const userMsgId = createConversationId('f')
    reactAvatar('customer_message', { customerMessage: userText, originalPrice })
    setMessages((prev) => [
      ...prev,
      { role: 'customer', content: userText, price: offer ?? undefined, id: userMsgId, delivery: 'sending' },
    ])
    setInput('')
    noteConversationSent()
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
        reactAvatar('ai_thinking')
        resolve()
      }, THINKING_DELAY_MS)
    })

    try {
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
        signal: controller.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || data.message || 'API error')
      }

      if (data.persona && ENGINE_TO_LOCAL[data.persona]) {
        setPersona(ENGINE_TO_LOCAL[data.persona])
      }
      if (data.goal) setGoalState(data.goal)
      if (data.shipping && typeof data.shipping.total === 'number') setShippingInfo(data.shipping)

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

      const ended = data.decision === 'reject' || (exhausted && data.decision !== 'accept')
        ? 'rejected'
        : data.decision === 'accept'
          ? 'accepted'
          : null
      if (data.decision === 'accept') {
        setStep('deal')
        setFinalPrice(data.counterOffer ?? offer)
        setDiscountCode(null)
        setCodeSaved(false)
      } else if (ended === 'rejected') {
        setStep('rejected')
      } else {
        setStep('chat')
      }
      reactAvatar(ended === 'accepted' ? 'deal_accepted' : ended === 'rejected' ? 'deal_rejected' : data.decision === 'counter' ? 'counter_offer' : 'ai_reply', {
        customerMessage: userText,
        aiReply: data.reply,
        counterOffer: priceTag ?? data.counterOffer ?? null,
        originalPrice,
        decision: data.decision,
        ended,
        conversationState: isConversationState(data.conversationState) ? data.conversationState : null,
      })
    } catch (err: any) {
      console.warn('[StorefrontBargain] API failed, using local fallback:', err.message)
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
        reactAvatar('session_ended', {
          customerMessage: userText,
          aiReply: PersonaFarewell[persona],
          originalPrice,
          decision: 'reject',
          ended: 'abandoned',
        })
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
        setDiscountCode(null)
        setCodeSaved(false)
      } else {
        setStep('chat')
      }

      await thinkingReady
      const seenFor = Date.now() - thinkingShownAtRef.current
      const hold = minThinkingMs(result.reply) - seenFor
      if (hold > 0) await wait(hold)
      pushAi(result.reply, result.counterOffer)
      reactAvatar(exhausted && result.decision !== 'accept' ? 'deal_rejected' : result.decision === 'accept' ? 'deal_accepted' : result.decision === 'counter' ? 'counter_offer' : 'ai_reply', {
        customerMessage: userText,
        aiReply: result.reply,
        counterOffer: result.counterOffer ?? null,
        originalPrice,
        decision: result.decision,
        ended: exhausted && result.decision !== 'accept'
          ? 'rejected'
          : result.decision === 'accept'
            ? 'accepted'
            : null,
      })
      setAttempts(nextAttempt)
    } finally {
      window.clearTimeout(ack)
      window.clearTimeout(requestTimer)
      if (requestAbortRef.current === controller) requestAbortRef.current = null
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current)
      markDelivered(userMsgId)
      setShowThinking(false)
      setLoading(false)
      busyRef.current = false
    }
  }

  const saveDeal = async () => {
    if (!finalPrice || (!demo && !shop)) return
    if (demo) {
      setDiscountCode(sampleCode(productId != null ? Number(productId) : null, isCart))
      setCodeSaved(true)
      return
    }
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
          ...(discountCode ? { code: discountCode } : {}),
          orderLevel: isCart,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to create discount code')
      if (typeof data.code !== 'string' || !data.code) throw new Error('Shopify did not confirm a discount code')
      setDiscountCode(data.code)
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
      aria-label={t('priceNegotiation')}
    >
      {/* Scoped chat motion — namespaced so no Shopify theme CSS is touched.
          A single delivered tick, a calm three-dot thinking pulse, and a soft
          bubble entrance keep the negotiation feeling quick and professional. */}
      <style dangerouslySetInnerHTML={{ __html: `
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
      ` }} />

      {/* Today's goal — merchant live preview: real server progress plus the
          strategy chip driving the agent (customers never see that chip;
          their storefront widget renders the public view of the same strip). */}
      {(step === 'intro' || step === 'chat') && (
        <GoalStrip
          goal={goalState}
          currencySymbol={currencySymbolFor(currency)}
          internal
          t={t}
        />
      )}

      <ShopkeeperStage
        personality={avatarPersonality}
        expression={character.expression}
        state={character.state}
        event={character.event}
        eventSequence={character.eventSequence}
        eventContext={character}
        gesture={character.gesture}
        position={character.position}
        name={`${PERSONA_NAME[persona]} · Shopkeeper`}
        status={t('online')}
        line={stageLine}
        enable3D
        targetRef={scrollRef}
        forbiddenRefs={[composerInputRef]}
      />

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
              <p className="text-gray-500 text-xs mt-0.5">{t('listed')} {money(currency, originalPrice)}</p>
              {isCart && <p className="text-gray-500 text-xs mt-0.5">{t('negotiateCartTotal')}</p>}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-600">{PersonaOpenings[persona](title, originalPrice, (n) => money(currency, n))}</p>

          <div className="text-[11px] text-indigo-600 bg-indigo-50 rounded-md px-3 py-1.5">
            {t('thisStoreRuns', { persona: PERSONA_DISPLAY[persona] })}
          </div>

          <button
            type="button"
            className={buttonCls + ' w-full'}
            onClick={() => { reactAvatar('greeting'); setStep('chat') }}
            aria-label={t('startNegotiation')}
          >
            {t('negotiate')}
          </button>
        </div>
      )}

      {step === 'chat' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{t('attemptsLeftOf', { n: maxAttempts - attempts, m: maxAttempts })}</p>
            <p className="text-xs text-indigo-500 font-medium">{PERSONA_DISPLAY[persona]}</p>
          </div>

          <div
            ref={scrollRef}
            className="cgf-chat-log space-y-3 overflow-y-auto pr-1"
            role="log"
            aria-live="polite"
            aria-label={t('conversationLabel')}
            onScroll={handleConversationScroll}
            style={{ height: 'min(52dvh, 480px)', minHeight: 'min(280px, 42dvh)' }}
          >
            {messages.map((msg) => {
              const isCustomer = msg.role === 'customer'
              return (
                <div
                  key={msg.id}
                  className={`cgf-msg rounded-xl px-4 py-3 text-sm leading-6 ${
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
                      aria-label={msg.delivery === 'delivered' ? t('delivered') : t('sending')}
                    >
                      {msg.delivery === 'delivered'
                        ? <><CheckCheck size={13} strokeWidth={2.5} /><span>{t('delivered')}</span></>
                        : <Clock3 size={10} />}
                    </span>
                  )}
                  {msg.price != null && (
                    <span className={`block mt-1 ${isCustomer ? 'text-indigo-200' : 'text-indigo-600'}`}>
                      {isCustomer ? t('offerTag') : t('counterTag')}: {money(currency, msg.price)}
                    </span>
                  )}
                </div>
              )
            })}
            {showThinking && (
              <div
                className="cgf-msg rounded-lg px-3 py-2.5 bg-gray-100 mr-8 inline-flex items-center gap-1.5"
                role="status"
                aria-label={t('assistantThinking')}
              >
                <span className="sr-only">{t('assistantThinking')}</span>
                <span className="cgf-dot" />
                <span className="cgf-dot" style={{ animationDelay: '0.15s' }} />
                <span className="cgf-dot" style={{ animationDelay: '0.3s' }} />
              </div>
            )}
          </div>

          {shippingInfo && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
              <div className="flex items-center justify-between">
                <span>{t('shippingCost')}: {shippingInfo.freeShipping ? t('freeShort') : money(currency, shippingInfo.shippingCost)}</span>
                <span>{t('orderTotal')}: <strong className="text-gray-900">{money(currency, shippingInfo.total)}</strong></span>
              </div>
              {shippingInfo.upsell && <p className="mt-1 text-indigo-600 font-medium">{shippingInfo.upsell}</p>}
            </div>
          )}

          {conversationUnread > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => { jumpToLatestMessage() }}
                style={{
                  background: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: 999,
                  padding: '6px 14px', minHeight: 40, fontSize: 11.5, fontWeight: 700,
                }}
              >
                {t('jumpToLatest', { n: conversationUnread })}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={composerInputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (e.target.value.trim() && !customerTypingRef.current) {
                  customerTypingRef.current = true
                  reactAvatar('customer_typing')
                }
              }}
              onBlur={() => { customerTypingRef.current = false }}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t('offerPlaceholder', { symbol: currencySymbolFor(currency) })}
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500"
              aria-label={t('yourOfferOrMessage')}
            />
            <button
              type="button"
              className={buttonCls}
              onClick={handleSend}
              disabled={!input.trim() || loading}
              aria-label={loading ? t('sendingDots') : t('sendOffer')}
            >
              {t('send')}
            </button>
          </div>
        </div>
      )}

      {step === 'deal' && finalPrice != null && (
        <div className="p-4 space-y-3 text-center">
          <p className="text-emerald-600 font-semibold text-sm">{t('dealAcceptedBanner')}</p>
          <div>
            <p className="text-gray-900 font-bold text-lg">
              {isCart ? t('newOrderTotal') : t('finalPriceLabel')} {money(currency, finalPrice)}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {t('youSavedPercent', {
                x: money(currency, Math.max(0, originalPrice - finalPrice)),
                n: Math.round((1 - finalPrice / originalPrice) * 100),
              })}
            </p>
          </div>

          <div className="bg-gray-100 rounded-lg p-3 space-y-2">
            {codeSaved && discountCode ? (
              <>
                <p className="text-xs text-gray-500">{t('useCodeAtCheckout')}</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-indigo-600 font-mono font-bold text-sm tracking-wider bg-indigo-100 rounded-lg px-3 py-1">
                    {discountCode}
                  </code>
                  <button
                    type="button"
                    className={`${ghostCls} text-xs`}
                    onClick={copyCode}
                    aria-label={copied ? t('copiedToClipboard') : t('copyDiscountCode')}
                  >
                    {copied ? t('copiedCheckMark') : t('copy')}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">{t('priceLockedHint')}</p>
            )}
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{error}</p>}

          {codeSaved ? (
            <p className="text-xs text-emerald-600">{t('codeReady')}</p>
          ) : (
            <button type="button" className={buttonCls + ' w-full'} onClick={saveDeal} disabled={loading}>
              {loading ? t('creatingCode') : t('createDiscountCode')}
            </button>
          )}

          <div className="flex justify-center gap-2 pt-1">
            {codeSaved && discountCode ? (
              <a href={checkoutUrl} onClick={() => reactAvatar('checkout_started', { checkoutStarted: true })} className={buttonCls + ' no-underline'}>
                {t('goToCheckout')}
              </a>
            ) : (
              <button type="button" className={buttonCls} disabled>
                {t('goToCheckout')}
              </button>
            )}
            <button type="button" className={ghostCls} onClick={openBargain}>
              {t('bargainAgain')}
            </button>
          </div>
        </div>
      )}

      {step === 'rejected' && (
        <div className="p-4 space-y-3 text-center">
          <p className="text-red-500 font-semibold text-sm">{t('negotiationEndedTitle')}</p>
          <p className="text-xs text-gray-500">{t('noDealThisTime')}</p>
          <div className="flex justify-center gap-2">
            <a href={checkoutUrl} onClick={() => reactAvatar('checkout_started', { checkoutStarted: true })} className={buttonCls + ' no-underline'}>
              {t('continueToCheckout')}
            </a>
            <button type="button" className={ghostCls} onClick={openBargain}>
              {t('tryAgainShort')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
