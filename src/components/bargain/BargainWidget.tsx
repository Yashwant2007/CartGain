'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  X, Minimize2, Send, MessageCircle, CheckCircle2, Clock, Tag, Zap,
  ShieldCheck, ArrowRight, Loader2, AlertCircle, RotateCcw,
} from 'lucide-react'
import { currencySymbolFor, uiText, type UiKey } from '@/lib/bargain/i18n'

// Stable per-device+cart bargain identity. Persists across tabs/refreshes on the
// same browser (localStorage deviceId seeded on first visit) and is blended with
// the cart token, so a returning customer keeps their session + remaining
// attempts instead of starting a fresh one (no attempt resets via new tabs).
// Best-effort: a brand-new browser/incognito falls back to the server-side
// anonymous single-active-session-per-product guard.
const BARGAIN_DEVICE_KEY = 'cg_bargain_device_id'
// FNV-1a (32-bit) — synchronous, deterministic, good enough as an identity
// handle (not a secret). Written out to 16 hex chars; the server requires >= 8.
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
function bargainFingerprint(cartRef: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    let dev = window.localStorage.getItem(BARGAIN_DEVICE_KEY)
    if (!dev) {
      dev = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
      window.localStorage.setItem(BARGAIN_DEVICE_KEY, dev)
    }
    return `${fnv1a(dev)}${fnv1a(`${window.location.host}::${cartRef}`)}`
  } catch {
    return null
  }
}

type Props = {
  storeId: string
  shopifyProductId: string
  variantId?: string | null
  originalPrice: number
  currency?: string
  cartToken?: string
  customerEmail?: string
  customerPhone?: string
  productTitle?: string
  language?: string
  apiBase?: string
  linkout?: string
  // Embedded (inline iframe on the Shopify storefront) mode: renders a light
  // product card + in-frame panel instead of the floating launcher, and keeps
  // the parent iframe sized via the cg_resize postMessage handshake.
  embedded?: boolean
  image?: string
  persona?: string
  mode?: 'item' | 'cart'
}

const PERSONA_CHIP: Record<string, { label: string; emoji: string }> = {
  friendly_shopkeeper: { label: 'Friendly', emoji: '😊' },
  strict_negotiator: { label: 'Strict', emoji: '📊' },
  playful_friend: { label: 'Playful', emoji: '😏' },
}

type Message = {
  id: string
  role: 'customer' | 'ai' | 'system'
  content: string
  offeredPrice?: number | null
  createdAt: string
}

type Session = {
  sessionId: string
  status: string
  finalPrice?: number | null
  discountCode?: string | null
  expiresAt?: string
}

// Sanitized recommendation card, built server-side from the store's real
// Shopify catalog. Never contains merchant financial secrets (floor / margin /
// max discount) — only facts Shopify already exposes on the storefront.
type Recommendation = {
  productId: string
  variantId: string
  title: string
  price: number
  compareAtPrice?: number | null
  currency: string
  imageUrl: string | null
  productUrl: string | null
  available: boolean
  onSale: boolean
  budgetFit: 'under' | 'over' | 'unknown'
  tags: string[]
}

// A rejection the backend reported on accept (machine reason codes). The
// message is server-authored copy — never invented client-side.
type Rejection = {
  code: string
  reason: string
  message: string
}

export default function BargainWidget({
  storeId,
  shopifyProductId,
  variantId,
  originalPrice,
  currency = 'INR',
  cartToken,
  customerEmail,
  customerPhone,
  productTitle,
  language,
  apiBase = '',
  linkout,
  embedded: isEmbed = false,
  image,
  persona,
  mode,
}: Props) {
  const [open, setOpen] = useState(false)
  const [minimised, setMinimised] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [limit, setLimit] = useState<{ code: string; planId?: string; upgradeUrl?: string } | null>(null)
  const [decision, setDecision] = useState<'idle' | 'counter' | 'accept' | 'reject'>('idle')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<'created' | 'pending' | 'failed' | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [returning, setReturning] = useState(false)
  const [endedReason, setEndedReason] = useState<'accepted' | 'rejected' | 'expired' | 'abandoned' | 'optout' | null>(null)
  const [floorReached, setFloorReached] = useState(false)
  const [rejection, setRejection] = useState<Rejection | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat')
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [announcer, setAnnouncer] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // In-flight guard: blocks double clicks / Enter / focus races beyond the
  // disabled-attribute timing window. One negotiation action at a time.
  const busyRef = useRef(false)
  // Remembers the last FAILED action so "Try again" can replay exactly that
  // call — no double-submits, no lost offers.
  const lastFailedRef = useRef<{ kind: 'start' | 'offer' | 'accept'; payload?: string } | null>(null)
  const coarsePointer = useRef(false)

  const currencySymbol = currencySymbolFor(currency)
  const t = (key: UiKey, vars?: Record<string, string | number>) => uiText(language, key, vars)

  const thinking = loading && decision !== 'accept'
  const personaChip = persona ? PERSONA_CHIP[persona] : undefined
  const savings = decision === 'accept' && finalPrice != null ? originalPrice - finalPrice : null

  // The last price the shopkeeper actually put on the table (server-issued
  // counter). Used for the "Accept" bar and quick-offer chips. Never computed,
  // never below a real floor — it comes straight from the API.
  const lastCounter = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const offered = messages[i].offeredPrice
      if (messages[i].role === 'ai' && offered != null) return Number(offered)
    }
    return null
  }, [messages])

  // Quick offer chips generated ONLY from legitimate negotiation state: the
  // server's live counter (if any) plus conservative percentages of the LISTED
  // price (11%/15% off). These always sit comfortably above any merchant floor
  // and never carry a floor-derived value; they only prefill the offer box.
  const quickOffers = useMemo(() => {
    const out: number[] = []
    if (lastCounter != null && !sessionEnded && decision !== 'accept') {
      const v = Math.round(lastCounter)
      if (!out.includes(v)) out.push(v)
    }
    if (originalPrice > 0) {
      for (const pct of [11, 15]) {
        const v = Math.round(originalPrice * (1 - pct / 100))
        if (!out.includes(v)) out.push(v)
      }
    }
    return out.slice(0, 3)
  }, [lastCounter, originalPrice, sessionEnded, decision])

  // First number typed anywhere in the message is the draft offer — it drives
  // the CTA label ("Make offer · ₹X") and the optimistic bubble. Free text
  // without a number is a chat message (product question / small talk) and is
  // sent as-is; the backend extracts and clamps any amount it contains.
  const draftAmount = (() => {
    const cleaned = input.replace(/,/g, '')
    const m = cleaned.match(/\d+(?:\.\d{1,2})?/)
    const n = m != null ? parseFloat(m[0]) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const unavailable = rejection != null && /UNAVAILABLE/i.test(rejection.reason)

  // ── Effects: environment / a11y / timers ──────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return
    coarsePointer.current = window.matchMedia('(pointer: coarse)').matches
  }, [])

  const [prefersReduced, setPrefersReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReduced(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  // Floating panel: close on Escape. Never fires in embedded mode.
  useEffect(() => {
    if (isEmbed || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEmbed, open])

  // Scroll policy: only follow new messages when the customer is at the bottom
  // (reading older history is never yanked down). Their own send always jumps.
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    if (messages.length === 0 || !atBottom) return
    const t = requestAnimationFrame(() => scrollToBottom())
    return () => cancelAnimationFrame(t)
  }, [messages, thinking, atBottom, scrollToBottom])

  // Lock the host page from scrolling while the floating chat is open.
  useEffect(() => {
    if (isEmbed || !open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isEmbed, open])

  // Keyboard flow: after opening, steer focus to the offer input on desktop and
  // on floating (coarse/mobile embedded gets room to breathe without popping
  // the keyboard unexpectedly on a storefront product page).
  useEffect(() => {
    if (!open || minimised) return
    const t = window.setTimeout(() => {
      if (!coarsePointer.current || !isEmbed) inputRef.current?.focus()
    }, 140)
    return () => window.clearTimeout(t)
  }, [open, minimised, isEmbed])

  // Screen-reader status announcements for state transitions.
  useEffect(() => {
    let s = ''
    if (limit) s = 'Limit reached'
    else if (unavailable) s = 'This item is unavailable'
    else if (sessionEnded && decision === 'accept') s = 'Deal accepted'
    else if (sessionEnded && endedReason === 'expired') s = 'Offer session expired'
    else if (sessionEnded) s = 'Negotiation ended'
    else if (thinking) s = 'Checking your offer'
    setAnnouncer(s)
  }, [limit, unavailable, sessionEnded, decision, endedReason, thinking])

  // Transient rate-limit / busy notice auto-clears.
  useEffect(() => {
    if (!notice) return
    const h = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(h)
  }, [notice])

  useEffect(() => {
    if (!expiresAt) return
    const iv = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(ms / 1000)))
    }, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  // Embedded mode: keep the parent Shopify iframe sized to OUR widget (not the
  // whole document) so the frame hugs the panel exactly, never 900px of page.
  const announceHeight = useCallback(() => {
    if (!isEmbed || typeof window === 'undefined' || !rootRef.current) return
    const h = Math.round(rootRef.current.getBoundingClientRect().height)
    try {
      window.parent?.postMessage({ type: 'cg_resize', height: h }, '*')
    } catch {}
  }, [isEmbed])

  useEffect(() => {
    if (!isEmbed) return
    const onMessage = (e: MessageEvent) => {
      if (e.data && (e.data as any).type === 'cg_get_height') announceHeight()
    }
    window.addEventListener('message', onMessage)
    const tt = setTimeout(announceHeight, 60)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(tt)
    }
  }, [isEmbed, announceHeight])

  useEffect(() => {
    if (!isEmbed) return
    const tt = setTimeout(announceHeight, 40)
    return () => clearTimeout(tt)
  }, [isEmbed, announceHeight, open, minimised, messages, decision, discountCode, loading, sessionEnded, copied, floorReached, rejection])

  // ── Session lifecycle (backend remains authoritative) ──────────────────

  async function startSession() {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`${apiBase}/api/bargain/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          shopifyProductId,
          variantId,
          originalPrice,
          currency,
          cartToken,
          customerEmail,
          customerPhone,
          customerFingerprint: bargainFingerprint(cartToken ?? ''),
          language,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402 && data.code) {
          setLimit({ code: data.code, planId: data.planId, upgradeUrl: data.upgradeUrl })
          setSessionEnded(true)
          return
        }
        throw new Error(data.message ?? 'Could not start bargaining')
      }
      setSessionId(data.sessionId)
      setExpiresAt(data.expiresAt ?? null)
      if (data.returning) setReturning(true)
      if (data.existingSession && data.session?.messages?.length) {
        const restored: Message[] = data.session.messages.map((m: any) => ({
          id: m.id,
          role: m.role === 'ai' ? 'ai' : m.role === 'customer' ? 'customer' : 'system',
          content: m.content,
          offeredPrice: m.offeredPrice ?? null,
          createdAt: m.createdAt,
        }))
        setMessages(restored)
        if (data.session.status !== 'active') {
          setSessionEnded(true)
          if (data.session.status === 'expired') setEndedReason('expired')
          if (data.session.status === 'rejected') setDecision('reject')
        }
      } else {
        const aiMsg: Message = {
          id: 'opening',
          role: 'ai',
          content: data.openingMessage ?? 'Welcome! What price were you thinking?',
          createdAt: new Date().toISOString(),
        }
        setMessages([aiMsg])
      }
      lastFailedRef.current = null
    } catch (err: any) {
      lastFailedRef.current = { kind: 'start' }
      setError(errorCopy(err))
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }

  // Caller identity sent with every offer/accept so the server can verify this
  // browser still holds the session (blocks session hijacking + discount-code
  // farming via a leaked/guessed sessionId).
  function buyerIdentity() {
    return {
      customerFingerprint: bargainFingerprint(cartToken ?? ''),
      cartToken: cartToken ?? undefined,
      customerEmail: customerEmail ?? undefined,
    }
  }

  // Network hiccups get a warm, generic copy; server-sent messages (a too-low
  // price, a real expiry, …) are kept verbatim so customers never get a canned
  // reply that contradicts reality.
  function errorCopy(err: any): string {
    const msg = err?.message
    if (!msg || /failed to fetch|networkerror|load failed|typeerror|timeout|abort/i.test(String(msg))) {
      return t('checkOfferError')
    }
    return String(msg)
  }

  async function sendMessage(text?: string) {
    if (!sessionId || busyRef.current) return
    const msg = (text ?? input).trim()
    if (!msg) { setError('Type a message'); return }
    setLoading(true)
    setError(null)
    setNotice(null)
    setMessages(prev => [
      ...prev,
      { id: `c-${Date.now()}`, role: 'customer', content: msg, offeredPrice: draftAmount, createdAt: new Date().toISOString() },
    ])
    setInput('')
    setAtBottom(true)
    try {
      const res = await fetch(`${apiBase}/api/bargain/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: msg, ...buyerIdentity() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 410) {
          // Session expired while the customer was typing — terminal, but
          // calm: no retry, just point them back to the listed price.
          setSessionEnded(true)
          setEndedReason('expired')
          setMessages(prev => [...prev, {
            id: `s-${Date.now()}`, role: 'system' as const, content: t('terminal_expired'),
            offeredPrice: null, createdAt: new Date().toISOString(),
          }])
          lastFailedRef.current = null
          return
        }
        if (data.terminal) {
          setSessionEnded(true)
          if (data.status) setEndedReason(data.status)
          setMessages(prev => [...prev, {
            id: `s-${Date.now()}`, role: 'system', content: data.message ?? 'Session ended.',
            offeredPrice: null, createdAt: new Date().toISOString(),
          }])
          if (data.status === 'rejected') setDecision('reject')
          lastFailedRef.current = null
          return
        }
        if (res.status === 429) {
          // Another attempt landed first — the session is fine, just slow down.
          setNotice(data.message ?? t('tryAgain'))
          lastFailedRef.current = null
          return
        }
        if (res.status === 404) {
          // Session no longer exists server-side. Surface a calm restart path.
          lastFailedRef.current = { kind: 'start' }
          setError(`${t('expiredSession')} ${t('startNew')}?`)
          return
        }
        throw new Error(data.message ?? 'Bargain failed')
      }
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`, role: 'ai', content: data.reply,
          offeredPrice: data.counterOffer ?? null, createdAt: new Date().toISOString(),
        },
      ])
      if (data.decision === 'accept' || data.decision === 'reject') {
        setDecision(data.decision)
      }
      if (data.floorReached === true) setFloorReached(true)
      if (data.finalPrice != null) setFinalPrice(data.finalPrice)
      if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
        setRecommendations(data.recommendations)
      }
      lastFailedRef.current = null
    } catch (err: any) {
      lastFailedRef.current = { kind: 'offer', payload: msg }
      setError(errorCopy(err))
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }

  // Shopper interacted with a recommendation card — record it server-side. This
  // is write-only analytics; the server never returns card data from it.
  async function fireRecoEvent(action: 'clicked' | 'added', card: Recommendation) {
    if (!sessionId) return
    try {
      await fetch(`${apiBase}/api/bargain/recommend/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          action,
          productId: card.productId,
          variantId: card.variantId,
          ...buyerIdentity(),
        }),
      })
    } catch {
      // analytics are best-effort — never interrupt the shopper flow
    }
  }

  // Add a recommended product to the storefront cart (only works when the
  // widget runs on the Shopify storefront origin). Falls back to the product
  // page so the flow never dead-ends.
  async function addRecoToCart(card: Recommendation) {
    if (!card.available) return
    fireRecoEvent('added', card)
    if (typeof window === 'undefined' || !card.variantId) {
      if (card.productUrl) window.open(card.productUrl, '_blank', 'noopener')
      return
    }
    try {
      const res = await fetch(`${window.location.origin}/cart/add.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ id: card.variantId, quantity: 1 }),
      })
      if (res.ok) {
        window.location.assign(`${window.location.origin}/cart`)
        return
      }
    } catch {
      // fall through to the product page
    }
    if (card.productUrl) window.location.assign(card.productUrl)
  }

  async function optOutOfAI() {
    try {
      setLoading(true)
      if (sessionId) {
        await fetch(`${apiBase}/api/bargain/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: 'opt-out', ...buyerIdentity() }),
        })
      }
      setSessionEnded(true)
      setEndedReason('optout')
      setMessages(prev => [
        ...prev,
        {
          id: `s-${Date.now()}`, role: 'system',
          content: t('optOutMsg'),
          offeredPrice: null, createdAt: new Date().toISOString(),
        },
      ])
      if (linkout) {
        window.location.href = linkout
      }
    } catch {
      if (linkout) window.location.href = linkout
    } finally {
      setLoading(false)
    }
  }

  async function acceptDeal() {
    if (!sessionId || busyRef.current) return
    busyRef.current = true
    setLoading(true)
    setError(null)
    setNotice(null)
    setRejection(null)
    try {
      const res = await fetch(`${apiBase}/api/bargain/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...buyerIdentity() }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402 && data.code) {
          setLimit({ code: data.code, planId: data.planId, upgradeUrl: data.upgradeUrl })
          setDecision('idle')
          setSessionEnded(true)
          return
        }
        if (res.status === 409 && typeof data.code === 'string' && data.code.startsWith('OFFER_REJECTED_')) {
          // Machine-readable backend rejection (unavailable / campaign expired /
          // coupon stacking / price moved). Show the server's own copy in a
          // calm state card instead of an error box.
          setRejection({ code: data.code, reason: data.reason ?? data.code, message: data.message ?? t('tryAgain') })
          setMessages(prev => [
            ...prev,
            {
              id: `s-${Date.now()}`,
              role: 'system' as const,
              content: data.message ?? t('tryAgain'),
              offeredPrice: null,
              createdAt: new Date().toISOString(),
            },
          ])
          if (/UNAVAILABLE/i.test(data.reason ?? '')) {
            // The product itself is gone — that is terminal for this session.
            setSessionEnded(true)
          }
          lastFailedRef.current = null
          return
        }
        throw new Error(data.message ?? 'Could not accept')
      }
      setFinalPrice(data.finalPrice)
      setDiscountCode(data.discountCode)
      setShopifyStatus(data.shopifyStatus)
      setMessages(prev => [
        ...prev,
        {
          id: `s-${Date.now()}`,
          role: 'system',
          content: `🎉 ${t('greatDeal')} ${currencySymbol}${(data.finalPrice ?? originalPrice).toFixed(2)} — ${t('copy')} ${data.discountCode ?? ''} ${t('codeApply')}`,
          createdAt: new Date().toISOString(),
        },
      ])
      setDecision('accept')
      setSessionEnded(true)
      lastFailedRef.current = null
    } catch (err: any) {
      lastFailedRef.current = { kind: 'accept' }
      setError(errorCopy(err))
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }

  // "Start a new negotiation" — a fully fresh session (the backend only reuses
  // ACTIVE sessions, so a terminal one always starts anew).
  function restartNegotiation() {
    setSessionId(null)
    setMessages([])
    setInput('')
    setError(null)
    setNotice(null)
    setSessionEnded(false)
    setDecision('idle')
    setFinalPrice(null)
    setDiscountCode(null)
    setEndedReason(null)
    setLimit(null)
    setRecommendations(null)
    setFloorReached(false)
    setRejection(null)
    setActiveTab('chat')
    void startSession()
  }

  // Replay the exact last failed action (start / offer / accept).
  async function retryLast() {
    const last = lastFailedRef.current
    if (!last) return
    if (last.kind === 'start') await startSession()
    else if (last.kind === 'offer' && last.payload) await sendMessage(last.payload)
    else if (last.kind === 'accept') await acceptDeal()
  }

  function fillOffer(v: number) {
    if (sessionEnded || thinking || busyRef.current) return
    setInput(String(v))
    setError(null)
    inputRef.current?.focus()
  }

  function openPanel() {
    setOpen(true)
    setMinimised(false)
    if (!sessionId) {
      void startSession()
    }
  }

  function closePanel() {
    setOpen(false)
    setMinimised(false)
    // Keyboard users: hand focus back to the launcher when the panel closes so
    // the next tab-stop lands somewhere predictable in the theme.
    window.setTimeout(() => launcherRef.current?.focus(), 0)
  }

  function copyCode() {
    if (!discountCode) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(discountCode).catch(() => {})
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div
      ref={rootRef}
      className={prefersReduced ? 'cartgain-bargain bargain-widget-root cg-reduced-motion' : 'cartgain-bargain bargain-widget-root'}
      style={{
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        ...(isEmbed
          ? {
              position: 'relative',
              width: '100%',
              background: '#ffffff',
              borderRadius: 18,
              border: '1px solid #e0e7ff',
              boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 12px 32px rgba(79,70,229,0.10)',
              overflow: 'hidden',
              // A proper chat window that never overflows the device — the
              // parent iframe (bargain-embed.js) clamps to 60–2400px.
              height: open && !minimised ? 'min(640px, calc(100dvh - 24px))' : 'auto',
            }
          : {}),
      }}
    >
      {/* Visually-hidden live region for screen readers */}
      <div className="cg-sr-only" role="status" aria-live="polite">{announcer}</div>

      {!open && (
        isEmbed ? (
          <button
            onClick={openPanel}
            type="button"
            ref={launcherRef}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('makeOfferSub')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: 'linear-gradient(135deg, #ffffff 0%, #fafbff 100%)',
              border: '1px solid #e0e7ff',
              cursor: 'pointer',
              textAlign: 'left',
              borderRadius: 14,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <span className="cg-attn" style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              borderRadius: 14,
              boxShadow: '0 0 0 0 rgba(99,102,241,0.35)',
              animation: 'cgAttnPulse 2.4s infinite',
            }} />
            <div style={{
              alignSelf: 'stretch',
              width: 3,
              borderRadius: 3,
              background: 'linear-gradient(180deg, #818cf8, #4f46e5)',
              flexShrink: 0,
            }} />
            <ProductThumb image={image} title={productTitle} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0 }}>
                {productTitle ? productTitle : 'This item'}
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>{currencySymbol}{originalPrice.toFixed(2)}</span>
                <span style={{ color: '#cbd5e1', fontSize: 10 }}>·</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Zap size={11} style={{ color: '#4f46e5', flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: '#4338ca', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isEmbed && mode === 'cart' ? t('discountHint') : t('triggerSub')}
                  </span>
                </span>
              </div>
            </div>
            <span
              style={{
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 13,
                padding: '10px 14px',
                borderRadius: 999,
                border: 'none',
                boxShadow: '0 4px 14px rgba(79,70,229,0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <MessageCircle size={14} />
              {t('makeOffer')}
              <ArrowRight size={14} />
            </span>
          </button>
        ) : (
          <button
            onClick={openPanel}
            ref={launcherRef}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('makeOfferSub')}
            className="cg-fab"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#ffffff',
              padding: '15px 22px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.25)',
              fontWeight: 800,
              fontSize: 15,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              minHeight: 56,
              boxShadow: '0 10px 30px rgba(79,70,229,0.45), 0 2px 6px rgba(0,0,0,0.12)',
              transition: 'all 0.2s ease',
              animation: 'cgAttnFloat 3s ease-in-out infinite',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)'
              e.currentTarget.style.boxShadow = '0 12px 36px rgba(79,70,229,0.55), 0 2px 6px rgba(0,0,0,0.14)'
              e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)'
              e.currentTarget.style.boxShadow = '0 10px 30px rgba(79,70,229,0.45), 0 2px 6px rgba(0,0,0,0.12)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageCircle size={19} />
              <span style={{
                position: 'absolute', top: -4, right: -7, width: 9, height: 9,
                background: '#34d399', border: '2px solid #4f46e5', borderRadius: '50%',
              }} />
            </span>
            <span>{t('makeOffer')}</span>
            <span style={{
              background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
              padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
            }}>
              {t('saveNow')}
            </span>
          </button>
        )
      )}

      {open && !minimised && (
        <div
          role="dialog"
          aria-modal={!isEmbed}
          aria-label={t('makeOfferSub')}
          className={isEmbed ? undefined : 'cg-panel-fixed'}
          style={{
            background: '#ffffff',
            color: '#1e293b',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'cgPanelIn 0.22s ease-out',
            ...(isEmbed
              ? {
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  left: 0,
                  bottom: 0,
                  width: '100%',
                  maxWidth: 'none' as const,
                  boxShadow: 'none',
                  borderRadius: 0,
                  zIndex: 99999,
                }
              : {}),
          }}
        >
          {/* ── Header: product identity + close/minimise ── */}
          <div style={{
            padding: '14px 14px 0',
            borderBottom: '1px solid #eef2f7',
            background: 'linear-gradient(180deg, #ffffff, #fafbff)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <ProductThumb image={image} title={productTitle} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{t('bargainTitle')}</span>
                  {personaChip && (
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#4f46e5',
                      background: '#eef2ff',
                      border: '1px solid #e0e7ff',
                      borderRadius: 999,
                      padding: '2px 9px',
                      whiteSpace: 'nowrap',
                    }}>
                      {personaChip.emoji} {personaChip.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t('makeOfferSub')}
                </div>
              </div>
              {!isEmbed && (
                <button
                  onClick={() => setMinimised(true)}
                  aria-label={t('minimise')}
                  className="cg-icon-btn"
                  style={{ width: 44, height: 44, borderRadius: 11 }}
                >
                  <Minimize2 size={17} />
                </button>
              )}
              <button
                onClick={closePanel}
                aria-label="Close"
                className="cg-icon-btn"
                style={{ width: 44, height: 44, borderRadius: 11 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Product price line inside header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px 0', minWidth: 0 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff',
                borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              }}>
                <Zap size={11} />
                {currencySymbol}{originalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {productTitle ? productTitle : 'This item'}
              </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
              {([
                { key: 'chat', label: t('tabChat'), icon: <MessageCircle size={13} /> },
                { key: 'info', label: t('tabDeal'), icon: <Tag size={13} /> },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={activeTab === tab.key}
                  className="cg-tab"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '9px 14px',
                    background: activeTab === tab.key ? '#eef2ff' : 'transparent',
                    color: activeTab === tab.key ? '#4f46e5' : '#64748b',
                    border: 'none',
                    borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
                    borderRadius: '7px 7px 0 0',
                    fontSize: 13,
                    fontWeight: activeTab === tab.key ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                    flexShrink: 0,
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trust strip + opt-out */}
          <div style={{
            padding: '7px 15px',
            fontSize: 11,
            color: '#64748b',
            background: '#fafbfc',
            borderBottom: '1px solid #eef2f7',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <ShieldCheck size={12} style={{ color: '#94a3b8' }} />
              {t('privateNote')}
            </span>
            <a
              href={linkout ? `${linkout}?ai_opt_out=1` : undefined}
              onClick={linkout ? undefined : (e) => { e.preventDefault(); void optOutOfAI() }}
              className="cg-link"
              style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, cursor: 'pointer', outline: 'none', fontSize: 11.5 }}
            >
              {t('skip')}
            </a>
          </div>

          {/* Timer */}
          {timeLeft != null && !sessionEnded && (
            <div style={{
              padding: '5px 16px',
              fontSize: 11,
              color: '#64748b',
              background: '#ffffff',
              borderBottom: '1px solid #eef2f7',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <Clock size={11} style={{ color: '#94a3b8' }} />
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>
                {t('expiresIn', { n: Math.floor(timeLeft / 60) + ':' + String(timeLeft % 60).padStart(2, '0') })}
              </span>
            </div>
          )}

          {/* ── Conversation ── */}
          <div
            ref={scrollRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={t('tabChat')}
            onScroll={(e) => {
              const el = e.currentTarget
              const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
              setAtBottom(nearBottom)
            }}
            style={{
              flex: 1,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              padding: '16px 16px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: 'linear-gradient(180deg, #f8faff, #ffffff)',
              minHeight: 0,
            }}
          >
            {activeTab !== 'chat' ? (
              <DealInfoPanel
                t={t}
                currencySymbol={currencySymbol}
                originalPrice={originalPrice}
                finalPrice={finalPrice}
                decision={decision}
                discountCode={discountCode}
                productTitle={productTitle}
                sessEnded={sessionEnded}
              />
            ) : (
              <>
                {/* Product context — what we're negotiating, shown once at top */}
                {messages.length > 0 && (
                  <ProductContextCard
                    image={image}
                    title={productTitle}
                    currencySymbol={currencySymbol}
                    price={originalPrice}
                    mode={mode}
                  />
                )}

                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13.5, padding: '44px 0' }}>
                    <Loader2 size={22} className="spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    {t('connecting')}
                  </div>
                )}

                {messages.map((m, idx) => (
                  <MessageBubble
                    key={m.id}
                    m={m}
                    t={t}
                    currencySymbol={currencySymbol}
                    isFinal={floorReached && idx === messages.length - 1 && m.offeredPrice != null}
                  />
                ))}

                {/* Product recommendation cards (server-verified alternatives) */}
                {recommendations && recommendations.length > 0 && (
                  <div style={{ alignSelf: 'flex-start', width: '100%', animation: 'cgMsgIn 0.2s ease-out' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6366f1', margin: '10px 6px 8px' }}>
                      ✨ {t('alternativesTitle')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {recommendations.map(card => (
                        <RecoCard
                          key={card.productId}
                          card={card}
                          currencySymbol={currencySymbolFor(card.currency)}
                          t={t}
                          onView={(c) => fireRecoEvent('clicked', c)}
                          onAdd={addRecoToCart}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* AI thinking indicator */}
                {thinking && (
                  <div style={{ alignSelf: 'flex-start', animation: 'cgMsgIn 0.18s ease-out' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#8b5cf6', marginBottom: 5, paddingLeft: 6 }}>
                      {t('aiPowered')}
                    </div>
                    <div style={{
                      background: '#ffffff',
                      border: '1px solid #e9e4f9',
                      padding: '12px 16px',
                      borderRadius: '16px 16px 16px 4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
                    }}>
                      <span className="cg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
                      <span className="cg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animationDelay: '0.15s' }} />
                      <span className="cg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animationDelay: '0.3s' }} />
                      <span style={{ fontSize: 13, color: '#64748b', marginLeft: 4 }}>{t('checking')}</span>
                    </div>
                  </div>
                )}

                {/* ── Accepted deal card — conversion hero ── */}
                {decision === 'accept' && finalPrice != null && (
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff, #f6fefa)',
                    border: '1px solid #bbf7d0',
                    padding: '20px 18px',
                    borderRadius: 18,
                    textAlign: 'center',
                    margin: '4px 0 2px',
                    animation: 'cgMsgIn 0.25s ease-out',
                    boxShadow: '0 6px 24px rgba(22,163,74,0.14)',
                  }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, #dcfce7, #bbf7d0)',
                      border: '1px solid #86efac',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      boxShadow: '0 4px 12px rgba(22,163,74,0.25)',
                    }}>
                      <CheckCircle2 size={32} style={{ color: '#16a34a' }} />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 19, color: '#0f172a', marginBottom: 2 }}>
                      {t('greatDeal')} 🎉
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 8 }}>
                      {t('yourFinalPrice')}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10,
                    }}>
                      <span style={{ textDecoration: 'line-through', color: '#cbd5e1', fontWeight: 600, fontSize: 16 }}>{currencySymbol}{originalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      <ArrowRight size={16} style={{ color: '#94a3b8' }} />
                      <span style={{ fontWeight: 900, color: '#15803d', fontSize: 32, fontVariantNumeric: 'tabular-nums' }}>{currencySymbol}{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    {savings != null && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', color: '#15803d',
                        border: '1px solid #bbf7d0', padding: '5px 14px', borderRadius: 999,
                        fontSize: 13.5, fontWeight: 800, marginBottom: 12,
                      }}>
                        {t('youSaved', { x: `${currencySymbol}${savings.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` })}
                      </div>
                    )}
                    {discountCode && (
                      <div style={{
                        background: '#ffffff',
                        border: '1px dashed #4f46e5',
                        padding: '11px 14px',
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}>
                        <Tag size={15} style={{ color: '#6366f1' }} />
                        <code style={{ fontWeight: 800, fontSize: 16, color: '#4f46e5', letterSpacing: 0.8 }}>{discountCode}</code>
                        <button
                          onClick={copyCode}
                          className="cg-icon-btn"
                          style={{
                            background: copied ? '#16a34a' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                            color: '#ffffff',
                            borderRadius: 10,
                            padding: '9px 18px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            minHeight: 40,
                            border: 'none',
                          }}
                        >
                          {copied ? '✓ Copied' : t('copy')}
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 12, marginTop: 10, color: '#94a3b8' }}>
                      {t('codeApply')}
                    </div>
                  </div>
                )}

                {/* ── Terminal state cards ── */}
                {!limit && sessionEnded && decision === 'reject' && !unavailable && (
                  <StateCard
                    icon={<Tag size={18} />}
                    tone="amber"
                    title={t('negotiationEnded')}
                    body={t('dealRejected')}
                  >
                    <div className="cg-card-cta">
                      <button type="button" className="cg-btn cg-btn-primary" onClick={restartNegotiation}>
                        <RotateCcw size={14} /> {t('startNew')}
                      </button>
                      {linkout && (
                        <a href={linkout} className="cg-btn cg-btn-ghost">{t('skip')}</a>
                      )}
                    </div>
                  </StateCard>
                )}

                {!limit && sessionEnded && endedReason === 'expired' && !unavailable && (
                  <StateCard
                    icon={<Clock size={18} />}
                    tone="slate"
                    title={t('expiredSession')}
                    body={t('terminal_expired')}
                  >
                    <div className="cg-card-cta">
                      <button type="button" className="cg-btn cg-btn-primary" onClick={restartNegotiation}>
                        <RotateCcw size={14} /> {t('startNew')}
                      </button>
                      {linkout && (
                        <a href={linkout} className="cg-btn cg-btn-ghost">{t('skip')}</a>
                      )}
                    </div>
                  </StateCard>
                )}

                {!limit && sessionEnded && endedReason !== 'expired' && decision === 'idle' && !unavailable && (
                  <StateCard
                    icon={<RotateCcw size={18} />}
                    tone="slate"
                    title={t('negotiationEnded')}
                    body={t('terminal_abandoned')}
                  >
                    <div className="cg-card-cta">
                      <button type="button" className="cg-btn cg-btn-primary" onClick={restartNegotiation}>
                        <RotateCcw size={14} /> {t('startNew')}
                      </button>
                      {linkout && (
                        <a href={linkout} className="cg-btn cg-btn-ghost">{t('skip')}</a>
                      )}
                    </div>
                  </StateCard>
                )}

                {/* Product unavailable */}
                {!limit && unavailable && rejection && (
                  <StateCard
                    icon={<AlertCircle size={18} />}
                    tone="rose"
                    title="This item is unavailable"
                    body={rejection.message}
                  >
                    <div className="cg-card-cta">
                      <button type="button" className="cg-btn cg-btn-primary" onClick={restartNegotiation}>
                        <RotateCcw size={14} /> {t('startNew')}
                      </button>
                      {linkout && (
                        <a href={linkout} className="cg-btn cg-btn-ghost">{t('skip')}</a>
                      )}
                    </div>
                  </StateCard>
                )}

                {/* Other backend rejections (coupon stacking / campaign / price moved) */}
                {!limit && sessionEnded === false && rejection && !unavailable && (
                  <StateCard
                    icon={<ShieldCheck size={18} />}
                    tone="indigo"
                    title={t('negotiationEnded')}
                    body={rejection.message}
                  >
                    <div className="cg-card-cta">
                      {linkout && (
                        <a href={linkout} className="cg-btn cg-btn-primary">{t('skip')}</a>
                      )}
                    </div>
                  </StateCard>
                )}

                {/* Plan limit reached */}
                {limit && (
                  <div role="alert" className="cg-limit" style={{
                    margin: '0 4px',
                    padding: '18px 16px',
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: '#1e293b',
                    background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)',
                    borderRadius: 14,
                    border: '1px solid #c7d2fe',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                    <div style={{ fontWeight: 800, color: '#4338ca', marginBottom: 5, fontSize: 14 }}>
                      {limit.code === 'bargain_sessions_exhausted'
                        ? 'This month\u2019s bargain sessions are used up'
                        : 'This month\u2019s slate of deals has been filled'}
                    </div>
                    <div style={{ color: '#475569', marginBottom: 12 }}>
                      {limit.code === 'bargain_sessions_exhausted'
                        ? 'New bargain sessions reopen when the plan resets each month. The limit depends on the store\u2019s plan.'
                        : 'Bargaining is active but the plan\u2019s monthly deal limit is full for now. It resets with the next billing period.'}
                    </div>
                    <a
                      href={limit.upgradeUrl ?? 'https://cart-gain.com/pricing'}
                      target="_blank"
                      rel="noreferrer"
                      className="cg-btn cg-btn-primary"
                    >
                      View plans &amp; limits
                    </a>
                  </div>
                )}

                {/* Network / generic error */}
                {!limit && error && (
                  <StateCard
                    icon={<AlertCircle size={18} />}
                    tone="rose"
                    title={t('checkOfferError')}
                    body={error === t('checkOfferError') ? t('tryAgain') : error}
                  >
                    <div className="cg-card-cta">
                      {!sessionEnded && lastFailedRef.current && (
                        <button type="button" className="cg-btn cg-btn-primary" onClick={() => void retryLast()} disabled={loading}>
                          <RotateCcw size={14} /> {t('tryAgain')}
                        </button>
                      )}
                      {!sessionEnded && !lastFailedRef.current && (
                        <button type="button" className="cg-btn cg-btn-ghost" onClick={() => setError(null)}>Dismiss</button>
                      )}
                    </div>
                  </StateCard>
                )}
              </>
            )}
          </div>

          {/* ── Counter-offer accept bar ── */}
          {!sessionEnded && decision !== 'accept' && lastCounter != null && !unavailable && (
            <div style={{ padding: '8px 14px 0', background: '#ffffff', borderTop: '1px solid #eef2f7' }}>
              <button
                onClick={acceptDeal}
                disabled={loading}
                className="cg-btn cg-btn-accept"
                style={{ width: '100%', minHeight: 52 }}
              >
                {loading ? <Loader2 size={17} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={17} />}
                {t('acceptOffer')} · {currencySymbol}{lastCounter.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </button>
              {floorReached && (
                <div style={{ textAlign: 'center', fontSize: 11.5, color: '#b45309', padding: '5px 0 1px', fontWeight: 600 }}>
                  {t('finalOffer')}
                </div>
              )}
            </div>
          )}

          {/* ── Offer composer ── */}
          {!limit && !unavailable && startedComposer(sessionEnded, decision) && (
            <>
              {!sessionEnded && quickOffers.length > 0 && (
                <div style={{
                  padding: '10px 14px 0',
                  background: '#ffffff',
                  display: 'flex',
                  gap: 6,
                  borderTop: !sessionEnded && decision !== 'accept' && lastCounter != null ? 'none' : '1px solid #eef2f7',
                  flexWrap: 'wrap',
                }}>
                  {quickOffers.map((v) => (
                    <QuickChip key={v} label={`${currencySymbol}${v.toLocaleString('en-IN')}`} disabled={thinking || !!busyRef.current} onClick={() => fillOffer(v)} />
                  ))}
                </div>
              )}

              {/* Rate-limit / busy notice */}
              {notice && (
                <div style={{
                  padding: '8px 16px',
                  fontSize: 12.5,
                  color: '#92400e',
                  background: '#fffbeb',
                  borderTop: '1px solid #fde68a',
                  textAlign: 'center',
                }}>
                  {notice}
                </div>
              )}

              <div style={{
                padding: '10px 14px 14px',
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {/* Message / offer composer — free text is a real chat message;
                    a number anywhere in it is treated as the negotiation offer. */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 13,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  padding: '0 6px 0 14px',
                  transition: 'border-color 0.15s ease',
                  opacity: sessionEnded ? 0.55 : 1,
                }}>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={500}
                    aria-label={t('typeMessage')}
                    placeholder={t('typeMessage')}
                    value={input}
                    onChange={e => {
                      setInput(e.target.value)
                      setError(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !sessionEnded && !e.shiftKey) {
                        e.preventDefault()
                        void sendMessage()
                      }
                    }}
                    disabled={loading || sessionEnded || !!busyRef.current}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      width: 0,
                      padding: '13px 8px 13px 0',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: 15.5,
                      outline: 'none',
                      minHeight: 52,
                    }}
                  />
                </div>

                {/* Primary CTA */}
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim() || sessionEnded || !!busyRef.current}
                  aria-label={draftAmount != null ? t('makeOffer') : t('send')}
                  className="cg-btn cg-btn-send"
                >
                  {loading
                    ? <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    : <Send size={17} />}
                  {draftAmount != null
                    ? `${t('makeOffer')} · ${currencySymbol}${draftAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                    : t('send')}
                </button>
              </div>
            </>
          )}

          {/* ── Accepted conversion footer ── */}
          {!limit && decision === 'accept' && discountCode != null && (
            <div style={{
              padding: '10px 14px 14px',
              background: '#ffffff',
              borderTop: '1px solid #bbf7d0',
            }}>
              {linkout ? (
                <a
                  href={linkout}
                  className="cg-btn cg-btn-accept"
                  style={{ width: '100%', minHeight: 54, textDecoration: 'none', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {t('addToCart')} <ArrowRight size={17} />
                </a>
              ) : (
                <div style={{ textAlign: 'center', fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <CheckCircle2 size={16} />
                  <span>{t('dealComplete')}</span>
                  <code style={{ fontWeight: 800, color: '#4f46e5' }}>{discountCode}</code>
                  <button type="button" className="cg-icon-btn" onClick={copyCode} aria-label="Copy">
                    {copied ? '✓' : t('copy')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {open && minimised && (
        <div role="dialog" aria-label={t('makeOfferSub')} className={isEmbed ? 'cg-embed-mini' : 'cg-panel-mini'}>
          <div className="cg-mini-inner">
            <ProductThumb image={image} title={productTitle} size={32} />
            <div className="cg-mini-copy">
              <div>{t('bargainTitle')}</div>
              <div>{productTitle ? productTitle : 'This item'}</div>
            </div>
            <button type="button" onClick={() => setMinimised(false)} aria-label={t('makeOffer')} className="cg-icon-btn" style={{ width: 44, height: 44 }}>
              <MessageCircle size={18} />
            </button>
            <button type="button" onClick={closePanel} aria-label="Close" className="cg-icon-btn" style={{ width: 44, height: 44 }}>
              <X size={17} />
            </button>
          </div>
          {isEmbed && (
            <style>{`
              .cg-embed-mini { position: absolute; inset: 0; z-index: 99999; background: #ffffff; display: flex; }
              .cg-embed-mini .cg-mini-inner { display: flex; align-items: center; gap: 10; padding: 10px 12px; width: 100%; border-radius: 14px; border: 1px solid #e0e7ff; background: #fafbff; }
            `}</style>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes cgPanelIn { from { opacity: 0; transform: translateY(10px) scale(0.985) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes cgMsgIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cgDotPulse { 0%, 60%, 100% { opacity: 0.35; transform: scale(0.9) } 30% { opacity: 1; transform: scale(1) } }
        @keyframes cgAttnPulse { 0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4) } 70% { box-shadow: 0 0 0 12px rgba(99,102,241,0) } 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0) } }
        @keyframes cgAttnFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }

        /* ── Scope: everything lives under the cartgain-bargain namespace so no
           Shopify theme CSS is touched. Deliberate z-index scale: FAB 9998,
           panel 9999, embed-in-frame 99999. Never bumped blindly above theme. ── */
        .cartgain-bargain * { box-sizing: border-box }
        .cartgain-bargain ::-webkit-scrollbar { width: 6px }
        .cartgain-bargain ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px }
        .cartgain-bargain button:focus-visible,
        .cartgain-bargain a:focus-visible,
        .cartgain-bargain input:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px }

        .cg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0 }

        .cartgain-bargain .cg-fab { position: fixed; right: 24px; bottom: 24px; z-index: 9998 }
        .cartgain-bargain .cg-panel-fixed {
          position: fixed; z-index: 9999;
          right: 16px; bottom: 16px;
          width: clamp(360px, 36vw, 430px);
          max-width: calc(100vw - 32px);
          height: min(680px, calc(100vh - 32px));
          max-height: calc(100vh - 32px);
          min-height: 0;
          border-radius: 20px;
          border: 1px solid rgba(226,232,240,0.95);
          box-shadow: -14px 26px 64px rgba(15,23,42,0.22), 0 3px 12px rgba(15,23,42,0.08);
        }
        .cartgain-bargain .cg-panel-mini {
          position: fixed; z-index: 9999;
          right: 16px; bottom: 16px;
          width: min(430px, calc(100vw - 32px));
          height: 68px; min-height: 68px;
          border-radius: 16px;
          border: 1px solid rgba(226,232,240,0.95);
          box-shadow: -10px 18px 48px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08);
          background: #ffffff;
        }
        .cg-mini-inner { display: flex; align-items: center; gap: 10; padding: 10px 12px; width: 100%; height: 100%; }
        .cg-mini-copy { flex: 1; min-width: 0; }
        .cg-mini-copy > div:first-child { font-weight: 800; font-size: 13.5; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cg-mini-copy > div:last-child { font-size: 11.5; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .cartgain-bargain .cg-icon-btn {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10;
          color: #64748b; cursor: pointer; width: 40px; height: 40px;
          display: inline-flex; align-items: center; justify-content: center;
          transition: all 0.15s ease; outline: none; flex-shrink: 0;
        }
        .cg-tab { touch-action: manipulation }
        .cg-link { touch-action: manipulation }

        .cg-btn {
          border: none; border-radius: 12; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 7;
          font-weight: 800; font-size: 15; outline: none; touch-action: manipulation;
          transition: all 0.18s ease; padding: 12px 16px; min-height: 48px;
        }
        .cg-btn:disabled { opacity: 0.55; cursor: default }
        .cg-btn-primary {
          background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff;
          box-shadow: 0 3px 12px rgba(79,70,229,0.35); text-decoration: none;
        }
        .cg-btn-primary:not(:disabled):hover { background: linear-gradient(135deg, #4f46e5, #4338ca) }
        .cg-btn-accept {
          background: linear-gradient(135deg, #22c55e, #16a34a); color: #ffffff;
          box-shadow: 0 3px 14px rgba(22,163,74,0.4);
        }
        .cg-btn-accept:not(:disabled):hover { background: linear-gradient(135deg, #16a34a, #15803d) }
        .cg-btn-send {
          width: 100%; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff;
          box-shadow: 0 3px 12px rgba(79,70,229,0.35); min-height: 52px;
        }
        .cg-btn-send:not(:disabled):hover { background: linear-gradient(135deg, #4f46e5, #4338ca) }
        .cg-btn-ghost {
          background: #ffffff; color: #475569; border: 1px solid #e2e8f0; text-decoration: none;
        }
        .cg-btn-ghost:hover { background: #f8fafc }

        .cg-card-cta { display: flex; gap: 8; justify-content: center; flex-wrap: wrap; margin-top: 14px }

        .spin { animation: spin 1s linear infinite }
        .cg-dot { animation: cgDotPulse 1.2s infinite ease-in-out }

        /* Reduced motion: kill every animation + transition */
        .cg-reduced-motion *, .cg-reduced-motion [style*="animation"], .cg-reduced-motion .cg-fab { animation: none !important; transition: none !important }
        .cg-reduced-motion .cg-attn { box-shadow: none !important; transform: none !important }

        /* Keyboard-up resilience on coarse pointers: keep composer reachable */
        @media (max-width: 680px), (pointer: coarse) {
          .cartgain-bargain .cg-fab { left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); width: auto; justify-content: center }
          .cartgain-bargain .cg-panel-fixed {
            left: 0; right: 0; bottom: 0; top: auto;
            width: 100%; max-width: none; max-height: none;
            border-radius: 20px 20px 0 0; border-bottom: none;
            height: 88svh; height: 88lvh; height: 88dvh;
            max-height: 100lvh;
          }
          .cartgain-bargain .cg-panel-mini { left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); width: auto }
        }
        @media (max-width: 680px) {
          /* dvh already shrinks with the keyboard on modern mobile; the panel
             keeps its constant height (never collapses below the chat while
             typing) and the composer stays reachable above the keyboard. */
          .cartgain-bargain .cg-panel-fixed { height: 88dvh; max-height: 100dvh }
        }
        @supports (padding: max(0px)) {
          .cartgain-bargain .cg-panel-fixed, .cartgain-bargain .cg-panel-mini { padding-bottom: env(safe-area-inset-bottom) }
        }
      `}</style>
    </div>
  )
}

function startedComposer(sessionEnded: boolean, decision: 'idle' | 'counter' | 'accept' | 'reject'): boolean {
  // Hide the composer once a deal is concluded (accepted / rejected / expired /
  // opted-out) — terminal states get their own calm action (Add to Cart or
  // buy-at-full-price) instead of a dead input.
  if (decision === 'accept') return false
  if (sessionEnded) return false
  return true
}

function ProductThumb({ image, title, size }: { image?: string; title?: string; size: number }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: size / 4, objectFit: 'cover', border: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4,
      background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      color: '#6366f1',
    }}>
      <Tag size={Math.round(size * 0.44)} />
    </div>
  )
}

// Compact product context at the top of the conversation — what the customer is
// negotiating. Only facts the storefront already shows (image, name, listed
// price). Never internal merchant data.
function ProductContextCard({ image, title, currencySymbol, price, mode }: {
  image?: string
  title?: string
  currencySymbol: string
  price: number
  mode?: 'item' | 'cart'
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: '#ffffff',
      border: '1px solid #eef2f7',
      borderRadius: 14,
      padding: '10px 12px',
      boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      animation: 'cgMsgIn 0.2s ease-out',
    }}>
      <ProductThumb image={image} title={title} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title ? title : 'This item'}
        </div>
        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
          <span style={{ fontWeight: 700, color: '#475569' }}>Listed price ·</span>{' '}
          <span style={{ fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{currencySymbol}{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      {mode === 'cart' && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
          background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff',
          borderRadius: 999, padding: '3px 10px', fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          <Zap size={11} />
          Whole cart
        </span>
      )}
    </div>
  )
}

// One chat bubble. Offers within a message are visually emphasized and labeled
// (YOU OFFERED / COUNTER OFFER / FINAL OFFER) so the negotiation scans at a
// glance.
function MessageBubble({ m, t, currencySymbol, isFinal }: {
  m: Message
  t: (key: UiKey, vars?: Record<string, string | number>) => string
  currencySymbol: string
  isFinal: boolean
}) {
  const isCustomer = m.role === 'customer'
  const label = isCustomer
    ? m.offeredPrice != null ? t('youOffered') : ''
    : isFinal
    ? t('finalOffer')
    : m.offeredPrice != null
    ? t('counterOffer')
    : ''

  return (
    <div
      style={{
        alignSelf: isCustomer ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        animation: 'cgMsgIn 0.18s ease-out',
      }}
    >
      {!isCustomer && (
        <div style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: m.role === 'ai' ? '#8b5cf6' : '#94a3b8',
          marginBottom: 5,
          paddingLeft: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <span>💬 {m.role === 'ai' ? (t('assistant')) : t('notice')}</span>
        </div>
      )}
      <div
        style={{
          background:
            isCustomer
              ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
              : m.role === 'system'
              ? '#eef2ff'
              : '#ffffff',
          color: isCustomer ? '#ffffff' : m.role === 'system' ? '#4338ca' : '#334155',
          padding: '11px 15px',
          borderRadius: isCustomer ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          fontSize: 14.5,
          lineHeight: 1.55,
          border: m.role !== 'customer' ? '1px solid #e2e8f0' : 'none',
          boxShadow: m.role !== 'customer' ? '0 1px 3px rgba(15,23,42,0.05)' : '0 2px 8px rgba(79,70,229,0.18)',
          wordBreak: 'break-word',
        }}
      >
        {m.content}
        {m.offeredPrice != null && (
          <div style={{
            marginTop: 8,
            padding: '6px 12px',
            background: isCustomer ? 'rgba(255,255,255,0.16)' : isFinal ? '#fffbeb' : '#f0fdf4',
            borderRadius: 9,
            border: isCustomer ? 'none' : isFinal ? '1px solid #fde68a' : '1px solid #bbf7d0',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}>
            {isFinal ? <Tag size={13} style={{ color: '#b45309', flexShrink: 0 }} /> : <Tag size={13} style={{ color: isCustomer ? '#ffffff' : '#15803d', flexShrink: 0 }} />}
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: isCustomer ? 'rgba(255,255,255,0.85)' : isFinal ? '#b45309' : '#15803d', opacity: 0.9 }}>
              {label}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: isCustomer ? '#ffffff' : isFinal ? '#b45309' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>
              {currencySymbol}{m.offeredPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Calm, non-error terminal / notice card. Copy never leaks merchant internals.
function StateCard({ icon, tone, title, body, children }: {
  icon: ReactNode
  tone: 'slate' | 'amber' | 'rose' | 'indigo' | 'green'
  title: string
  body?: string
  children?: ReactNode
}) {
  const toneStyles: Record<string, { bg: string; border: string; fg: string; iconBg: string }> = {
    slate: { bg: 'linear-gradient(180deg, #f8fafc, #f1f5f9)', border: '#e2e8f0', fg: '#334155', iconBg: '#e2e8f0' },
    amber: { bg: 'linear-gradient(180deg, #fffbeb, #fef9ed)', border: '#fde68a', fg: '#92400e', iconBg: '#fef3c7' },
    rose: { bg: 'linear-gradient(180deg, #fff7f7, #fef2f2)', border: '#fecaca', fg: '#b91c1c', iconBg: '#fee2e2' },
    indigo: { bg: 'linear-gradient(180deg, #eef2ff, #f8faff)', border: '#e0e7ff', fg: '#4338ca', iconBg: '#e0e7ff' },
    green: { bg: 'linear-gradient(180deg, #f0fdf4, #ecfdf5)', border: '#bbf7d0', fg: '#15803d', iconBg: '#dcfce7' },
  }
  const s = toneStyles[tone]
  return (
    <div style={{
      padding: '16px 18px',
      fontSize: 13.5,
      color: s.fg,
      background: s.bg,
      borderRadius: 14,
      border: `1px solid ${s.border}`,
      textAlign: 'center',
      lineHeight: 1.55,
      animation: 'cgMsgIn 0.25s ease-out',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: '50%', background: s.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 10px', color: s.fg,
      }}>
        {icon}
      </div>
      <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>{title}</div>
      {body && <div style={{ opacity: 0.92 }}>{body}</div>}
      {children}
    </div>
  )
}

// Deal details tab — a professional, at-a-glance summary of the negotiation in a
// single frame. Mirrors the merchant's own pricing levers without ever revealing
// the hidden floor.
function DealInfoPanel({ t, currencySymbol, originalPrice, finalPrice, decision, discountCode, productTitle, sessEnded }: {
  t: (key: UiKey, vars?: Record<string, string | number>) => string
  currencySymbol: string
  originalPrice: number
  finalPrice: number | null
  decision: 'idle' | 'counter' | 'accept' | 'reject'
  discountCode: string | null
  productTitle?: string
  sessEnded: boolean
}) {
  const savings = decision === 'accept' && finalPrice != null ? originalPrice - finalPrice : null
  const discountPct = finalPrice != null && finalPrice > 0 ? Math.round((1 - finalPrice / originalPrice) * 100) : null
  const rows: { label: string; value: ReactNode; tint?: 'green' | 'indigo' | 'neutral' }[] = [
    {
      label: 'Listed price',
      value: <span style={{ fontWeight: 800 }}>{currencySymbol}{originalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>,
    },
    decision === 'accept' && finalPrice != null
      ? {
          label: 'Deal price',
          value: <span style={{ fontWeight: 800, color: '#15803d' }}>{currencySymbol}{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}{discountPct != null ? ` (−${discountPct}%)` : ''}</span>,
          tint: 'green' as const,
        }
      : {
          label: 'Try your luck',
          value: <span style={{ fontWeight: 700, color: '#4f46e5' }}>name a price that feels fair and I\u2019ll consider it</span>,
          tint: 'indigo' as const,
        },
    {
      label: 'How it works',
      value: 'Chat with the shopkeeper, agree on a price, then get a personal discount code you apply at checkout.',
      tint: 'neutral',
    },
    decision === 'accept' && discountCode
      ? {
          label: 'Your code',
          value: <span style={{ fontWeight: 800, letterSpacing: 0.5, color: '#4f46e5' }}>{discountCode}</span>,
          tint: 'indigo' as const,
        }
      : ({
          label: 'Good to know',
          value: 'No rush — the offer window stays open all session. Agree on a price and your personal code is issued.',
          tint: 'neutral',
        } as { label: string; value: ReactNode; tint?: 'green' | 'indigo' | 'neutral' }),
  ].filter(Boolean) as { label: string; value: ReactNode; tint?: 'green' | 'indigo' | 'neutral' }[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 3 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Tag size={18} style={{ color: '#4f46e5' }} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>Deal details</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{productTitle ? productTitle : 'This item'}</div>
        </div>
      </div>

      {rows.map((r, i) => (
        <div key={i} style={{
          background: r.tint === 'green' ? 'linear-gradient(135deg,#f0fdf4,#ecfdf5)' : r.tint === 'indigo' ? '#f8faff' : '#fafbfc',
          border: r.tint === 'green' ? '1px solid #bbf7d0' : r.tint === 'indigo' ? '1px solid #e0e7ff' : '1px solid #eef2f7',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#94a3b8', marginBottom: 2 }}>
            {r.label}
          </div>
          <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>{r.value}</div>
        </div>
      ))}

      {!sessEnded && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontSize: 12, color: '#64748b', padding: '3px 1px',
        }}>
          <ShieldCheck size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
          Price is guaranteed while you negotiate — it resets if you leave and come back.
        </div>
      )}
    </div>
  )
}

function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        color: '#475569',
        borderRadius: 999,
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        outline: 'none',
        minHeight: 44,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.color = '#4338ca' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569' }}
    >
      {label}
    </button>
  )
}

function RecoBadge({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span style={{
      background: bg,
      color: fg,
      fontSize: 10.5,
      fontWeight: 700,
      borderRadius: 999,
      padding: '2px 8px',
    }}>
      {children}
    </span>
  )
}

function RecoCard({
  card,
  currencySymbol: sym,
  t,
  onView,
  onAdd,
}: {
  card: Recommendation
  currencySymbol: string
  t: (key: UiKey, vars?: Record<string, string | number>) => string
  onView: (card: Recommendation) => void
  onAdd: (card: Recommendation) => void
}) {
  const fmt = (n: number) => `${sym}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: 10,
      background: '#fafbff',
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      alignItems: 'flex-start',
    }}>
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imageUrl}
          alt={card.title}
          loading="lazy"
          style={{ width: 62, height: 62, borderRadius: 10, objectFit: 'cover', background: '#eef2ff', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: 62, height: 62, borderRadius: 10, background: '#eef2ff', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>
          🛍️
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: 13.5, color: '#1e293b', lineHeight: 1.35,
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
        }}>
          {card.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#15803d' }}>{fmt(card.price)}</span>
          {card.compareAtPrice != null && card.compareAtPrice > card.price && (
            <span style={{ fontSize: 12.5, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt(card.compareAtPrice)}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
          {card.onSale && <RecoBadge bg="#dcfce7" fg="#166534">{t('onSale')}</RecoBadge>}
          {card.budgetFit === 'over' && <RecoBadge bg="#fef3c7" fg="#b45309">{t('overBudget')}</RecoBadge>}
          {!card.available && <RecoBadge bg="#fff1f2" fg="#be123c">{t('notice')}</RecoBadge>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <a
            href={card.productUrl ?? '#'}
            target="_blank"
            rel="noreferrer"
            onClick={() => onView(card)}
            style={{
              background: '#ffffff',
              border: '1px solid #c7d2fe',
              color: '#4338ca',
              borderRadius: 9,
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 700,
              textDecoration: 'none',
              outline: 'none',
            }}
          >
            {t('viewProduct')}
          </a>
          <button
            type="button"
            onClick={() => onAdd(card)}
            disabled={!card.available}
            style={{
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              border: 'none',
              color: '#ffffff',
              borderRadius: 9,
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: card.available ? 'pointer' : 'default',
              opacity: card.available ? 1 : 0.5,
              outline: 'none',
            }}
          >
            {t('addToCart')}
          </button>
        </div>
      </div>
    </div>
  )
}