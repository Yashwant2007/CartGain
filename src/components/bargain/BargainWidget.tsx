'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  X, Minimize2, Send, MessageCircle, CheckCircle2, Clock, Tag, Zap,
  ShieldCheck, ArrowRight, Loader2, AlertCircle, RotateCcw,
} from 'lucide-react'
import { currencySymbolFor, uiText, type UiKey } from '@/lib/bargain/i18n'
import { parseDraftOffer } from '@/lib/bargain/offers'
import { cleanCustomerName } from '@/lib/names'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import ShopkeeperAvatar from '@/components/bargain/ShopkeeperAvatar'
import V2ShopkeeperAvatar from '@/components/bargain/V2ShopkeeperAvatar'
import StorefrontInvitation from '@/components/bargain/StorefrontInvitation'
import {
  resolveShopkeeperAnimation,
  type FireAvatarContext,
  type ShopkeeperAnimation,
} from '@/lib/bargain/experience/living'
import { avatarEndedFromSessionStatus, type AvatarState, type LivingEvent } from '@/lib/bargain/experience/avatar-state'
import { resolveShopkeeperPersonality } from '@/lib/bargain/experience/personality'
import type { GestureName } from '@/lib/bargain/experience/character'
import type { ExpressionState } from '@/lib/bargain/experience/expressions'
import type { CharacterStyle, ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import { isV2AvatarVariant } from '@/lib/bargain/experience/v2-shopkeepers'
import { isVrmAvatarVariant } from '@/lib/bargain/experience/vrm-shopkeepers'
import { trackExperienceEvent } from '@/lib/bargain/experience/analytics'
import { PERSONALITY_META, type BargainExperienceConfig } from '@/lib/bargain/experience/types'
import type {
  BargainAcceptSuccess,
  BargainGoalView,
  BargainMessage,
  BargainOfferSuccess,
  BargainPaymentView,
  BargainShippingView,
  BargainRecommendation,
  BargainRejection,
  BargainStartSuccess,
  CgEmbedMessage,
  CgParentMessage,
  PublicBargainSession,
  RecommendationHistory,
} from '@/lib/bargain/api-types'
import {
  ChatSkeleton,
  GoalStrip,
  MessageBubble,
  PriceBreakdown,
  PriceRail,
  ProductContextCard,
  ProductThumb,
  RoundMeter,
  StateCard,
  TypingIndicator,
} from '@/components/bargain/BargainPrimitives'
import BargainOfferSummary from '@/components/bargain/BargainOfferSummary'
import BargainRecommendationPanel, { type RecommendationEventAction } from '@/components/bargain/BargainRecommendationPanel'
import {
  createConversationId,
  minThinkingMs,
  REQUEST_TIMEOUT_MS,
  THINKING_DELAY_MS,
  TICK_MS,
  useConversationAutoScroll,
  wait,
} from '@/components/bargain/conversation-utils'

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

type LastBoughtView = {
  productTitle: string
  priceLabel: string | null
  purchasedAt: string
  orderId: string
}

type Props = {
  storeId: string
  platform?: 'shopify' | 'woocommerce'
  shopifyProductId: string
  variantId?: string | null
  originalPrice: number
  currency?: string
  cartToken?: string
  customerEmail?: string
  customerPhone?: string
  customerName?: string
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
  experience?: BargainExperienceConfig
  /** Show the published invitation before the first chat turn. */
  invitationFirst?: boolean
  mode?: 'item' | 'cart'
  /**
   * How many offers the merchant allows in one session. Drives the round meter
   * only — it is a count, never a price. Omit and the meter simply does not
   * render, so an unknown budget never shows a wrong number.
   */
  maxAttempts?: number | null
  /**
   * Drawer mode: the widget fills 100% of its host (a fixed right-side drawer /
   * full-screen mobile sheet created by the theme controller). The controller
   * owns open/close; the in-frame close button asks the parent to close via
   * cg_close, and the parent can push a live variant/price update via
   * cg_product_update. Session state persists across opens because the widget
   * never unmounts — the controller keeps the same iframe alive.
   */
  view?: 'inline' | 'drawer'
  /** Exact origin of the storefront parent, supplied by the WooCommerce plugin. */
  parentOrigin?: string
  /**
   * Open the negotiation panel on mount. Used by recovery links
   * (`/cart/<id>?focus=bargain`) so "name your price" lands on the offer, not
   * on a collapsed launcher.
   */
  defaultOpen?: boolean
}

const HEADER_AVATAR_CSS = `
.cg-header-avatar { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; border: 1px solid #e0e7ff; border-radius: 12px; background: radial-gradient(circle at 50% 35%, #ffffff 0%, #eef2ff 70%, #e0e7ff 100%); }
.cg-header-avatar .cg-v2 { position: absolute; left: 50%; top: 50%; width: var(--cg-header-size) !important; height: var(--cg-header-size) !important; transform: translate(-50%, -50%) !important; }
.cg-header-avatar .cg-v2-art { left: 0 !important; top: 0 !important; width: var(--cg-header-size) !important; height: var(--cg-header-size) !important; border-radius: 50% !important; }
.cg-header-avatar .cg-v2-glow, .cg-header-avatar .cg-v2-shadow { display: none !important; }
.cg-header-avatar .cg-vrm { position: absolute; inset: 0; width: var(--cg-header-size) !important; height: var(--cg-header-size) !important; }
.cg-header-avatar .cg-vrm-glow { display: none !important; }
.cg-header-avatar .cg-vrm-fallback { border-radius: 10px; font-size: calc(var(--cg-header-size) * .45); }
.cg-header-avatar-inner { display: inline-flex; align-items: center; justify-content: center; transform-origin: center; }
@media (max-width: 480px) { .cg-header-avatar .cg-v2, .cg-header-avatar .cg-v2-art, .cg-header-avatar .cg-vrm { width: var(--cg-header-size) !important; height: var(--cg-header-size) !important; } }
`

type HeaderAvatarProps = {
  animation: ShopkeeperAnimation
  avatarVariant: string
  personality: ShopkeeperPersonality
  characterStyle: CharacterStyle
  expression: ExpressionState
  state: AvatarState
  gesture: GestureName
  motionEnabled: boolean
  essentialMotionOnly: boolean
  size?: number
}

function ShopkeeperHeaderAvatar({
  animation,
  avatarVariant,

  personality,
  characterStyle,
  expression,
  state,
  gesture,
  motionEnabled,
  essentialMotionOnly,
  size = 40,
}: HeaderAvatarProps) {
  const v2 = isV2AvatarVariant(avatarVariant) || isVrmAvatarVariant(avatarVariant)
  return (
    <span
      className="cg-header-avatar"
      data-cg-header-avatar=""
      data-avatar-variant={avatarVariant}
      data-avatar-expression={expression}
      style={{ width: size, height: size, ['--cg-header-size' as string]: `${size}px` } as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: HEADER_AVATAR_CSS }} />
      {v2 ? (
        <V2ShopkeeperAvatar
          variant={avatarVariant}
          expression={expression}
          state={state}
          reaction={animation.reaction}
          eventSequence={animation.eventSequence}
          motionEnabled={motionEnabled}
          essentialMotionOnly={essentialMotionOnly}
        />
      ) : (
        <span className="cg-header-avatar-inner" style={{ transform: `scale(${size / 40})` }}>
          <ShopkeeperAvatar
            personality={personality}
            expression={expression}
            state={state}
            reaction={animation.reaction}
            gesture={gesture}
            characterStyle={characterStyle}
            size="sm"
            motionEnabled={motionEnabled}
            essentialMotionOnly={essentialMotionOnly}
          />
        </span>
      )}
    </span>
  )
}

const PERSONA_CHIP: Record<string, { label: string; emoji: string }> = {
  friendly_shopkeeper: { label: 'Friendly', emoji: '' },
  strict_negotiator: { label: 'Strict', emoji: '' },
  playful_friend: { label: 'Playful', emoji: '' },
  strict_shopkeeper: { label: 'Strict', emoji: '' },
  playful_shopkeeper: { label: 'Playful', emoji: '' },
}

export default function BargainWidget({
  storeId,
  platform = 'shopify',
  shopifyProductId,
  variantId,
  originalPrice,
  currency = 'INR',
  cartToken,
  customerEmail,
  customerPhone,
  customerName,
  productTitle,
  language,
  apiBase = '',
  linkout,
  embedded: isEmbed = false,
  image,
  persona,
  experience,
  invitationFirst = false,
  mode,
  maxAttempts,
  view = 'inline',
  defaultOpen,
  parentOrigin,
}: Props) {
  const [open, setOpen] = useState<boolean>(defaultOpen === true ? true : (isEmbed && !invitationFirst))
  // The living shopkeeper: ONE state object holds the body state, the face, the
  // body language and the position. It is only ever written by `fireAvatar`,
  // which resolves a real conversation event, so the character can never
  // disagree with what actually happened in the conversation.
  const [character, setCharacter] = useState<ShopkeeperAnimation>({
    state: 'idle',
    expression: 'idle',
    gesture: 'rest',
    position: 'conversation',
  })
  const chatOpenTracked = useRef(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const customerTypingRef = useRef(false)
  const personality = resolveShopkeeperPersonality(experience?.personality, persona)
  const avatarEnabled = experience?.avatarEnabled !== false
  const avatarVariant = experience?.avatarVariant ?? 'morgan'
  const characterStyle = experience?.characterStyle ?? 'signature'
  const essentialMotionOnly = experience?.essentialMotionOnly === true
  const fireAvatar = useCallback((event: LivingEvent, ctx: FireAvatarContext = {}) => {
    setCharacter((prev) => resolveShopkeeperAnimation(personality, event, { ...prev, ...ctx }))
  }, [personality])
  // The entrance plays first, then the character greets. One timer, cleared on
  // every new greeting so a fast open/close can never stack animations.
  const greetTimerRef = useRef<number | null>(null)
  const checkoutTimerRef = useRef<number | null>(null)
  const greetShopkeeper = useCallback(() => {
    if (typeof window === 'undefined') return
    if (greetTimerRef.current) window.clearTimeout(greetTimerRef.current)
    greetTimerRef.current = window.setTimeout(() => {
      greetTimerRef.current = null
      // The greeting only plays if the character is still entering. Any real
      // conversation event interrupts it, so the shopkeeper never greets over a
      // reply it has already sent.
      setCharacter((prev) => {
        if (prev.state !== 'entering') return prev
        return resolveShopkeeperAnimation(personality, 'greeting', { ...prev })
      })
    }, 620)
  }, [personality])
  useEffect(() => {
    if (!open || !avatarEnabled) return
    fireAvatar('widget_opened', { opening: true })
    greetShopkeeper()
  }, [avatarEnabled, fireAvatar, greetShopkeeper, open])
  useEffect(() => () => {
    if (greetTimerRef.current) window.clearTimeout(greetTimerRef.current)
    if (checkoutTimerRef.current) window.clearTimeout(checkoutTimerRef.current)
  }, [])
  const [minimised, setMinimised] = useState(false)
  // Live gaze: while the shopper is composing, the shopkeeper looks down at the
  // composer. Cheap, deterministic and never triggers per-pointer re-renders.
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [messages, setMessages] = useState<BargainMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  // The "thinking" dots are held back until the delivered tick has landed, so
  // the sequence reads naturally: message → delivered tick → thinking → reply.
  const [showThinking, setShowThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [limit, setLimit] = useState<{ code: string; planId?: string; upgradeUrl?: string } | null>(null)
  const [decision, setDecision] = useState<'idle' | 'counter' | 'accept' | 'reject'>('idle')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [purchaseUrl, setPurchaseUrl] = useState<string | null>(null)
  const [checkoutLocked, setCheckoutLocked] = useState(false)
  const [lastBought, setLastBought] = useState<LastBoughtView | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<'created' | 'pending' | 'failed' | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [returning, setReturning] = useState(false)
  const [endedReason, setEndedReason] = useState<'accepted' | 'rejected' | 'expired' | 'abandoned' | 'optout' | 'human_support' | null>(null)
  const [floorReached, setFloorReached] = useState(false)
  const [shippingInfo, setShippingInfo] = useState<BargainShippingView | null>(null)
  const [paymentInfo, setPaymentInfo] = useState<BargainPaymentView | null>(null)
  // Server-authoritative round count. The offer route increments attemptsUsed
  // atomically and (importantly) DECREMENTS it again when a turn is rejected as
  // abuse, so counting our own bubbles would drift. The API reports the truth;
  // `roundsFallback` covers the window before the first offer response lands.
  const [attemptsUsed, setAttemptsUsed] = useState<number | null>(null)
  const [rejection, setRejection] = useState<BargainRejection | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'info'>('chat')
  const [recommendations, setRecommendations] = useState<BargainRecommendation[] | null>(null)
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null)
  const [recommendationHistory, setRecommendationHistory] = useState<RecommendationHistory | null>(null)
  const [postAcceptAddOns, setPostAcceptAddOns] = useState<BargainRecommendation[] | null>(null)
  const [showAddOns, setShowAddOns] = useState(false)
  // Daily-goal strip (public view): real server progress + close time only.
  // Seeded from /start, refreshed on every offer turn.
  const [goal, setGoal] = useState<BargainGoalView | null>(null)
  const [announcer, setAnnouncer] = useState('')
  // Embed mode: a FIXED panel height. Never calc(100dvh — the iframe has no
  // viewport height of its own (theme blocks start it at 180–220px), and our
  // height is what the parent uses to size the iframe, so dvh is circular and
  // collapses the window to ~180px. A fixed height is announced via cg_resize
  // and the parent grows the iframe to match; width-based breakpoints are safe
  // (width is set by the parent column, not by us).
  const [panelHeight, setPanelHeight] = useState(isEmbed ? 680 : 0)

  // Drawer mode: the widget fills 100% of its host and the THEME controller —
  // not this component — decides visibility (open/close keep the same iframe
  // alive so the session survives close→reopen). The controller can also push
  // a live variant/price update via cg_product_update; the widget applies it to
  // the product context and (if no session is running yet) negotiates from it.
  const isDrawer = isEmbed && view === 'drawer'
  const [productCtx, setProductCtx] = useState({
    price: originalPrice,
    image: image ?? null,
    variantId: variantId ?? null,
    title: productTitle ?? null,
  })
  // In drawer mode the session start is deferred ~500ms (or until the first
  // cg_product_update arrives) so a variant picked before opening is bound into
  // the START call instead of the default variant.
  const [productPending, setProductPending] = useState(isDrawer)
  const [identityName, setIdentityName] = useState<string | null>(customerName ?? null)

  const livePrice = productCtx.price

  useEffect(() => {
    if (!isDrawer || typeof window === 'undefined') return
    const onMessage = (e: MessageEvent) => {
      if (parentOrigin && e.origin !== parentOrigin) return
      if (e.source && e.source !== window.parent) return
      const d = (e.data ?? null) as CgParentMessage | null
      if (!d || d.type !== 'cg_product_update') return
      setProductCtx((c) => ({
        price: typeof d.price === 'number' && Number.isFinite(d.price) && d.price > 0 ? d.price : c.price,
        image: d.image != null ? (d.image || c.image) : c.image,
        variantId: d.variantId != null ? d.variantId : c.variantId,
        title: typeof d.title === 'string' && d.title ? d.title : c.title,
      }))
      setProductPending(false)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isDrawer, parentOrigin])

  useEffect(() => {
    if (!isEmbed || typeof window === 'undefined') return
    const onMessage = (e: MessageEvent) => {
      if (parentOrigin && e.origin !== parentOrigin) return
      if (e.source && e.source !== window.parent) return
      const d = (e.data ?? null) as CgParentMessage | null
      if (d?.type !== 'cg_customer_identity') return
      const cleaned = cleanCustomerName(d.name, customerEmail ?? null)
      if (cleaned) setIdentityName(cleaned)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isEmbed, parentOrigin, customerEmail])

  useEffect(() => {
    if (!isDrawer || !productPending) return
    const t = window.setTimeout(() => setProductPending(false), 500)
    return () => window.clearTimeout(t)
  }, [isDrawer, productPending])

  useEffect(() => {
    if (!isEmbed) return
    const compute = (width?: number) => {
      const measured = width ?? rootRef.current?.getBoundingClientRect().width ?? window.innerWidth
      setPanelHeight(measured <= 360 ? 600 : measured <= 480 ? 640 : 680)
    }
    compute()
    const onResize = () => compute()
    window.addEventListener('resize', onResize)
    const observer = typeof ResizeObserver !== 'undefined' && rootRef.current
      ? new ResizeObserver((entries) => compute(entries[0]?.contentRect.width))
      : null
    if (rootRef.current) observer?.observe(rootRef.current)
    return () => {
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
  }, [isEmbed])

  const scrollRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // In-flight guard: blocks double clicks / Enter / focus races beyond the
  // disabled-attribute timing window. One negotiation action at a time.
  const busyRef = useRef(false)
  // Drives the message → tick → thinking → reply sequence without ever slowing
  // the actual network round-trip.
  const thinkingTimerRef = useRef<number | null>(null)
  const thinkingShownAtRef = useRef(0)
  const requestAbortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const lastFailedRef = useRef<{ kind: 'start' | 'offer' | 'accept'; payload?: string; turnId?: string } | null>(null)
  const coarsePointer = useRef(false)

  useEffect(() => () => requestAbortRef.current?.abort(), [])

  const currencySymbol = currencySymbolFor(currency)
  const t = useCallback(
    (key: UiKey, vars?: Record<string, string | number>) => uiText(language, key, vars),
    [language],
  )

  const thinking = loading && decision !== 'accept'
  const thinkingVisible = thinking && showThinking
  const {
    unread: conversationUnread,
    handleScroll: handleConversationScroll,
    noteSent: noteConversationSent,
    jumpToLatest: jumpToLatestMessage,
  } = useConversationAutoScroll({
    scrollRef,
    messageCount: messages.length,
    activityKey: thinkingVisible,
  })

  const personaChip = persona ? PERSONA_CHIP[persona] : undefined
  const shopkeeperName = PERSONALITY_META.find((p) => p.id === personality)?.name ?? t('shopkeeperOnline')
  const renderHeaderAvatar = (size: number) => avatarEnabled
    ? (
      <ShopkeeperHeaderAvatar
        animation={character}
        avatarVariant={avatarVariant}
        personality={personality}
        characterStyle={characterStyle}
        expression={character.expression}
        state={character.state}
        gesture={character.gesture}
        motionEnabled={experience?.motionEnabled !== false}
        essentialMotionOnly={essentialMotionOnly}
        size={size}
      />
    )
    : <ProductThumb image={productCtx.image} title={productCtx.title} size={size} />
  const stageLine = thinkingVisible
    ? t('checking')
    : error
      ? t('checkOfferError')
      : t('makeOfferSub')
  const savings = decision === 'accept' && finalPrice != null ? livePrice - finalPrice : null
  const lastBoughtDate = (() => {
    if (!lastBought) return ''
    const date = new Date(lastBought.purchasedAt)
    if (Number.isNaN(date.getTime())) return ''
    try {
      return date.toLocaleDateString(language && language !== 'auto' ? language : undefined)
    } catch {
      return date.toLocaleDateString('en-US')
    }
  })()

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


  // Rounds spent. Prefers the server's own `attemptsUsed` (authoritative, and
  // correct when a turn was rolled back as abuse); falls back to counting the
  // customer's turns in the transcript for the brief window before the first
  // offer response arrives. Never invents a number.
  const roundsFallback = useMemo(
    () => messages.filter((m) => m.role === 'customer').length,
    [messages],
  )
  const roundsUsed = attemptsUsed ?? roundsFallback

  // Lowest price each side has actually named. The AI side is read straight off
  // the server's counter offers; the customer side off the amounts the shopper
  // typed. Used only to draw the progress rail — never to quote a price back.
  const bestCustomerOffer = useMemo(() => {
    let best: number | null = null
    for (const m of messages) {
      if (m.role !== 'customer') continue
      if (typeof m.offeredPrice !== 'number' || !Number.isFinite(m.offeredPrice) || m.offeredPrice <= 0) continue
      best = best == null ? m.offeredPrice : Math.min(best, m.offeredPrice)
    }
    return best
  }, [messages])

  const showRoundMeter = !sessionEnded && decision !== 'accept' && maxAttempts != null && maxAttempts > 0
  const showPriceRail = !sessionEnded && decision !== 'accept' && lastCounter != null

  // The shopper's offer, parsed with the SAME complaint-aware logic the server
  // uses. A complaint ("729 is too much") is not an offer, so it must not read
  // as "You offered ₹729" or light up the "Make offer · ₹X" CTA. Free text
  // without a number (a question / small talk) stays a plain message; the
  // backend still extracts and clamps any amount a genuine bid contains.
  const draftAmount = parseDraftOffer(input)

  const unavailable = rejection != null && /UNAVAILABLE/i.test(rejection.reason)

  async function openCheckout(url: string) {
    if (!url) return
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      window.location.href = url
    }
    fireAvatar('checkout_started', { checkoutStarted: true })
    let lockConfirmed = false
    if (sessionId) {
      try {
        const res = await fetch(`${apiBase}/api/bargain/checkout-open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, ...buyerIdentity(), sessionToken }),
          keepalive: true,
        })
        lockConfirmed = res.ok
      } catch {}
    }
    setCheckoutLocked(lockConfirmed)
    // The character walks the shopper to the checkout action, then the panel
    // steps aside. The checkout itself already opened in a new tab, so the
    // short beat costs nothing and makes the handoff legible.
    if (checkoutTimerRef.current) window.clearTimeout(checkoutTimerRef.current)
    checkoutTimerRef.current = window.setTimeout(() => {
      checkoutTimerRef.current = null
      closePanel(true)
    }, 420)
  }

  // A deal that ended without an explicit accept still leaves the shopper with
  // the last price we offered — a one-use code plus a link that applies it, so
  // the visit still ends in a purchase window rather than a dead end.
  const retentionOffer = discountCode ? (
    <div style={{
      margin: '2px 0 12px', padding: '10px 12px', borderRadius: 12,
      background: '#fffbeb', border: '1px dashed #fcd34d', textAlign: 'center',
    }}>
      <div style={{ fontSize: 12, color: '#92400e', fontWeight: 700, marginBottom: 6 }}>
        {t('retentionSavedTitle')}
      </div>
      <code style={{ fontWeight: 800, color: '#b45309', letterSpacing: 0.6 }}>{discountCode}</code>
      {purchaseUrl && (
        <div style={{ marginTop: 10 }}>
          <a href={purchaseUrl} target="_top" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openCheckout(purchaseUrl) }} className="cg-btn cg-btn-primary" style={{ display: 'inline-flex' }}>
            {t('checkoutAtPrice')}
          </a>
        </div>
      )}
    </div>
  ) : null

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
    if (limit) s = t('negotiationEnded')
    else if (unavailable) s = t('itemUnavailable')
    else if (sessionEnded && decision === 'accept') s = t('dealAccepted')
    else if (sessionEnded && endedReason === 'expired') s = t('offerSessionExpired')
    else if (sessionEnded) s = t('negotiationEnded')
    else if (thinking) s = t('checkingOffer')
    setAnnouncer(s)
  }, [limit, unavailable, sessionEnded, decision, endedReason, thinking, t])

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
  // Skipped in drawer mode: the controller fixes the frame to the drawer and
  // ignores cg_resize. Emitting it anyway is pure noise, and a STALE cached
  // controller that still honours it would shrink the live drawer to our panel
  // height — the exact "right size, wrong content" class of bug we just fixed.
  const announceHeight = useCallback(() => {
    if (!isEmbed || isDrawer || typeof window === 'undefined' || !rootRef.current) return
    const h = Math.round(rootRef.current.getBoundingClientRect().height)
    try {
      window.parent?.postMessage({ type: 'cg_resize', height: h }, '*')
    } catch {}
  }, [isEmbed, isDrawer])

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
  }, [isEmbed, announceHeight, open, minimised, panelHeight, messages, decision, discountCode, loading, sessionEnded, copied, floorReached, rejection])

  // Drawer mode: tell the theme controller we are alive so it can swap its boot
  // skeleton for the real chat. Fired on an idle tick (post-hydration) because
  // the controller is a separate document that may not be listening yet.
  const helloSent = useRef(false)
  useEffect(() => {
    if (!isDrawer || helloSent.current) return
    const id = window.setTimeout(() => {
      helloSent.current = true
      try {
        window.parent?.postMessage({ type: 'cg_hello' } as CgEmbedMessage, '*')
      } catch {}
    }, 80)
    return () => window.clearTimeout(id)
  }, [isDrawer])

  // Keep re-announcing while the embed is open. The merchant theme's controller
  // only sizes the iframe from our cg_resize messages — a one-shot announce can
  // be lost if the controller attaches late or the first messages race ahead of
  // it. A steady heartbeat guarantees the frame converges to the real panel
  // height instead of staying stuck at the block's initial 180–220px.
  useEffect(() => {
    if (!isEmbed || !open || minimised) return
    const iv = setInterval(announceHeight, 700)
    announceHeight()
    return () => clearInterval(iv)
  }, [isEmbed, open, minimised, announceHeight])

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
          platform,
          shopifyProductId,
          variantId: productCtx.variantId,
          originalPrice: livePrice,
          currency,
          cartToken,
          customerEmail,
          customerPhone,
          customerName: identityName ?? customerName,
          customerFingerprint: bargainFingerprint(cartToken ?? ''),
          language,
        }),
      })
      const data = (await res.json()) as BargainStartSuccess & {
        message?: string
        code?: string
        planId?: string
        upgradeUrl?: string
        locked?: boolean
        lastBought?: LastBoughtView | null
      }
      if (!res.ok) {
        if (res.status === 409 && data.locked) {
          setCheckoutLocked(true)
          setLastBought(data.lastBought ?? null)
          setSessionEnded(true)
          setMessages([])
          if (data.goal) setGoal(data.goal)
          return
        }
        if (res.status === 402 && data.code) {
          setLimit({ code: data.code, planId: data.planId, upgradeUrl: data.upgradeUrl })
          setSessionEnded(true)
          return
        }
        throw new Error(data.message ?? 'Could not start bargaining')
      }
      setCheckoutLocked(false)
      setDecision('idle')
      setSessionEnded(false)
      setFinalPrice(null)
      setDiscountCode(null)
      setPurchaseUrl(null)
      setEndedReason(null)
      setFloorReached(false)
      setRejection(null)
      setAttemptsUsed(null)
      setShippingInfo(null)
      setPaymentInfo(null)
      const restoredTermination = (data.session as (typeof data.session & {
        termination?: {
          terminationKind?: 'opt_out' | 'human_support' | null
          conversationState?: string | null
          escalation?: 'human_support_required' | null
        }
      }) | null | undefined)?.termination
      if (data.session) {
        const restoredSession = data.session as typeof data.session & {
          termination?: {
            terminationKind?: 'opt_out' | 'human_support' | null
            conversationState?: string | null
            escalation?: 'human_support_required' | null
          }
        }
        if (typeof restoredSession.attemptsUsed === 'number') setAttemptsUsed(restoredSession.attemptsUsed)
        if (typeof restoredSession.finalPrice === 'number') setFinalPrice(restoredSession.finalPrice)
        if (restoredSession.discountCode) setDiscountCode(restoredSession.discountCode)
        if (restoredSession.purchaseUrl) setPurchaseUrl(restoredSession.purchaseUrl)
        setFloorReached(Boolean(restoredSession.discountCode))
        if (restoredSession.status === 'accepted' || restoredSession.status === 'accepting' || restoredSession.status === 'purchased') {
          setDecision('accept')
          setSessionEnded(true)
          setEndedReason('accepted')
        } else if (restoredSession.status === 'rejected') {
          setDecision('reject')
          setSessionEnded(true)
          setEndedReason('rejected')
        } else if (restoredSession.status === 'expired' || restoredSession.status === 'abandoned') {
          setSessionEnded(true)
          if (restoredTermination?.terminationKind === 'human_support' || restoredTermination?.escalation === 'human_support_required') {
            setEndedReason('human_support')
          } else if (restoredTermination?.terminationKind === 'opt_out') {
            setEndedReason('optout')
          } else {
            setEndedReason(restoredSession.status)
          }
        }
      }
      setSessionId(data.sessionId)
      if (data.sessionToken) setSessionToken(data.sessionToken)
      setExpiresAt(data.expiresAt ?? null)
      setLastBought(data.lastBought ?? null)
      if (data.returning) setReturning(true)
      if (data.goal) setGoal(data.goal)
      setShippingInfo(data.shipping ?? null)
      setPaymentInfo(data.payment ?? null)
      if (data.existingSession) fireAvatar('greeting', { opening: true })
      if (data.existingSession && data.session?.messages?.length) {
        const restored: BargainMessage[] = data.session.messages.map((m: BargainMessage) => ({
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
          // A negotiation that ended WITHOUT an accept still hands the shopper
          // the last price we offered — surface it as a ready-to-use deal.
          if (data.session.discountCode) setDiscountCode(data.session.discountCode)
          if (data.session.purchaseUrl) setPurchaseUrl(data.session.purchaseUrl)
          const restoredEnded =
            restoredTermination?.terminationKind === 'human_support' || restoredTermination?.escalation === 'human_support_required'
              ? 'human_support_required'
              : restoredTermination?.terminationKind === 'opt_out'
                ? 'optout'
                : avatarEndedFromSessionStatus(data.session.status)
          if (restoredEnded === 'accepted') {
            fireAvatar('deal_accepted', { ended: 'accepted', originalPrice: livePrice })
          } else if (restoredEnded) {
            fireAvatar('session_ended', { ended: restoredEnded, originalPrice: livePrice })
          }
        }
      } else {
        const aiMsg: BargainMessage = {
          id: 'opening',
          role: 'ai',
          content: data.openingMessage ?? t('openingFallback'),
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
      customerName: identityName ?? customerName ?? undefined,
      sessionToken: sessionToken ?? undefined,
    }
  }

  // Flip the shopper's own bubble from the "sending" clock to a single delivered
  // tick. Pure UI acknowledgement — it never claims more than "the server has
  // the message".
  function markMessageDelivered(id: string) {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, delivery: 'delivered' } : m)))
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

  async function sendMessage(text?: string, retryTurnId?: string) {
    if (!sessionId || busyRef.current) return
    const msg = (text ?? input).trim()
    if (!msg) { setError(t('typeAMessage')); return }
    const seq = ++requestSeqRef.current
    const turnId = retryTurnId ?? createConversationId('turn')
    const localId = retryTurnId ?? createConversationId('c')
    busyRef.current = true
    setLoading(true)
    setError(null)
    setNotice(null)
    requestAbortRef.current?.abort()
    const controller = new AbortController()
    requestAbortRef.current = controller
    const requestTimer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    fireAvatar('customer_message', { customerMessage: msg, originalPrice: livePrice })
    setMessages(prev => prev.some((m) => m.id === localId)
      ? prev
      : [
          ...prev,
          { id: localId, role: 'customer', content: msg, offeredPrice: parseDraftOffer(msg), createdAt: new Date().toISOString(), delivery: 'sending' },
        ])
    setInput('')
    noteConversationSent()
    // Human send rhythm: your bubble paints instantly, a single delivered tick
    // lands almost immediately, the three-dot "thinking" bubble appears a beat
    // later, and the reply is never yanked in faster than a typed pace. None of
    // this slows the actual round-trip — it only sequences the reveal.
    const ackTimer = window.setTimeout(() => markMessageDelivered(localId), TICK_MS)
    setShowThinking(false)
    thinkingShownAtRef.current = 0
    const thinkingReady = new Promise<void>((resolve) => {
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current)
      thinkingTimerRef.current = window.setTimeout(() => {
        thinkingShownAtRef.current = Date.now()
        setShowThinking(true)
        fireAvatar('ai_thinking')
        resolve()
      }, THINKING_DELAY_MS)
    })
    try {
      const res = await fetch(`${apiBase}/api/bargain/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, platform, message: msg, turnId, ...buyerIdentity() }),
        signal: controller.signal,
      })
      const data = (await res.json()) as BargainOfferSuccess & {
        message?: string
        terminal?: boolean
        status?: 'accepted' | 'rejected' | 'expired' | 'abandoned'
        terminationKind?: 'opt_out' | 'human_support'
        escalation?: 'human_support_required'
      }
      const endedForAvatar = avatarEndedFromSessionStatus(data.sessionStatus ?? data.status)
      if (data.sessionStatus && data.sessionStatus !== 'active') {
        setSessionEnded(true)
        if (data.sessionStatus === 'expired') setEndedReason('expired')
        if (data.sessionStatus === 'rejected') setDecision('reject')
      }
      if (data.terminal) {
        setSessionEnded(true)
        if (data.terminationKind === 'human_support' || data.escalation === 'human_support_required') {
          setEndedReason('human_support')
        } else if (data.terminationKind === 'opt_out') {
          setEndedReason('optout')
        } else if (data.status) {
          setEndedReason(data.status)
        }
        if (data.discountCode) setDiscountCode(data.discountCode)
        if (data.purchaseUrl) setPurchaseUrl(data.purchaseUrl)
        if (data.finalPrice != null) setFinalPrice(data.finalPrice)
        setMessages(prev => [...prev, {
          id: createConversationId('s'), role: 'system', content: data.message ?? t('sessionEnded'),
          offeredPrice: null, createdAt: new Date().toISOString(),
        }])
        if (data.status === 'rejected') setDecision('reject')
        fireAvatar('session_ended', {
          customerMessage: msg,
          aiReply: data.message,
          decision: data.status === 'rejected' ? 'reject' : 'chat',
          ended: data.terminationKind === 'human_support' ? 'human_support_required' : data.status ?? 'abandoned',
          originalPrice: livePrice,
        })
        lastFailedRef.current = null
        return
      }
      if (!res.ok) {
        if (res.status === 410) {
          // Session expired while the customer was typing — terminal, but
          // calm: no retry, just point them back to the listed price.
          setSessionEnded(true)
          setEndedReason('expired')
          setMessages(prev => [...prev, {
            id: createConversationId('s'), role: 'system' as const, content: t('terminal_expired'),
            offeredPrice: null, createdAt: new Date().toISOString(),
          }])
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
      // Reveal the reply only after the tick has landed and the thinking bubble
      // has been visible for a natural beat — never slower than the network.
      await thinkingReady
      if (seq !== requestSeqRef.current) return
      const seenFor = Date.now() - thinkingShownAtRef.current
      const hold = minThinkingMs(data.reply) - seenFor
      if (hold > 0) await wait(hold)
      if (seq !== requestSeqRef.current) return
      fireAvatar('ai_typing', { hasRecommendations: Boolean(data.recommendations?.length) })
      const aiId = `${turnId}-a`
      setMessages(prev => prev.some((m) => m.id === aiId)
        ? prev
        : [
            ...prev,
            {
              id: aiId, role: 'ai', content: data.reply,
              offeredPrice: data.counterOffer ?? null, createdAt: new Date().toISOString(),
            },
          ])
      // An "accept" decision is the shopkeeper MEETING the shopper's number and
      // asking them to confirm — the deal is not locked until they tap Accept
      // (which mints the code via POST /api/bargain/accept). Only a terminal
      // "reject" flips the widget into its ended state here; on accept the
      // Accept bar stays visible off lastCounter and closing happens in
      // acceptDeal().
      if (data.decision === 'reject') setDecision('reject')
      const nextRecommendations = Array.isArray(data.recommendations) && data.recommendations.length > 0 ? data.recommendations : null
      fireAvatar(data.decision === 'counter' ? 'counter_offer' : 'ai_reply', {
        customerMessage: msg,
        aiReply: data.reply,
        counterOffer: data.counterOffer ?? null,
        originalPrice: livePrice,
        decision: data.decision,
        ended: endedForAvatar,
        hasRecommendations: Boolean(nextRecommendations),
        conversationState: data.conversationState ?? null,
      })
      if (data.discountCode) setDiscountCode(data.discountCode)
      if (data.purchaseUrl) setPurchaseUrl(data.purchaseUrl)
      if (data.floorReached === true) setFloorReached(true)
      setShippingInfo(data.shipping ?? null)
      setPaymentInfo(data.payment ?? null)
      if (typeof data.attemptsUsed === 'number') setAttemptsUsed(data.attemptsUsed)
      if (data.goal) setGoal(data.goal)
      if (data.finalPrice != null) setFinalPrice(data.finalPrice)
      setRecommendations(nextRecommendations)
      if (nextRecommendations) {
        fireAvatar('recommendations_shown', {
          customerMessage: msg,
          aiReply: data.reply,
          hasRecommendations: true,
          ended: endedForAvatar,
          conversationState: data.conversationState ?? null,
        })
      }
      if (typeof data.recommendationReason === 'string') setRecommendationReason(data.recommendationReason)
      if (data.recommendationHistory) setRecommendationHistory(data.recommendationHistory)
      lastFailedRef.current = null
    } catch (err: any) {
      if (seq !== requestSeqRef.current) return
      fireAvatar('error')
      lastFailedRef.current = { kind: 'offer', payload: msg, turnId }
      setError(errorCopy(err))
    } finally {
      window.clearTimeout(ackTimer)
      window.clearTimeout(requestTimer)
      if (requestAbortRef.current === controller) requestAbortRef.current = null
      if (thinkingTimerRef.current) window.clearTimeout(thinkingTimerRef.current)
      if (seq === requestSeqRef.current) {
        markMessageDelivered(localId)
        setShowThinking(false)
        setLoading(false)
        busyRef.current = false
      }
    }
  }

  async function fireRecoEvent(action: RecommendationEventAction, card: BargainRecommendation) {
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
      return
    }
  }

  function handleRecommendationEvent(action: RecommendationEventAction, card: BargainRecommendation) {
    void fireRecoEvent(action, card)
    if (action === 'added') void addRecoToCart(card)
    if (action === 'clicked' || action === 'added') {
      fireAvatar('recommendation_selected', { hasRecommendations: true })
    }
  }

  async function addRecoToCart(card: BargainRecommendation) {
    if (!card.available) return
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
      return
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
          body: JSON.stringify({ sessionId, platform, message: 'opt-out', ...buyerIdentity() }),
        })
      }
      setSessionEnded(true)
      setEndedReason('optout')
      setMessages(prev => [
        ...prev,
        {
          id: createConversationId('s'), role: 'system',
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
        body: JSON.stringify({ sessionId, platform, ...buyerIdentity() }),
      })
      const data = (await res.json()) as BargainAcceptSuccess & {
        message?: string
        code?: string
        planId?: string
        upgradeUrl?: string
        reason?: string
      }
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
          fireAvatar('deal_rejected', { decision: 'reject' })
          setRejection({ code: data.code, reason: data.reason ?? data.code, message: data.message ?? t('tryAgain') })
          setMessages(prev => [
            ...prev,
            {
              id: createConversationId('s'),
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
      fireAvatar('deal_accepted', { decision: 'accept', ended: 'accepted' })
      setFinalPrice(data.finalPrice)
      setDiscountCode(data.discountCode)
      setPurchaseUrl(data.purchaseUrl ?? null)
      setShopifyStatus(data.shopifyStatus)
      setShippingInfo(data.shipping ?? null)
      setPaymentInfo(data.payment ?? null)
      setPostAcceptAddOns(Array.isArray(data.postAcceptAddOns) && data.postAcceptAddOns.length > 0 ? data.postAcceptAddOns : null)
      setShowAddOns(false)
      setMessages(prev => [
        ...prev,
        {
          id: createConversationId('s'),
          role: 'system',
          content: `${t('greatDeal')} ${currencySymbol}${(data.finalPrice ?? livePrice).toFixed(2)} — ${t('copy')} ${data.discountCode ?? ''} ${t('codeApply')}`,
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
    if (checkoutLocked) return
    setSessionId(null)
    setMessages([])
    setInput('')
    setError(null)
    setNotice(null)
    setSessionEnded(false)
    setDecision('idle')
    setFinalPrice(null)
    setDiscountCode(null)
    setPurchaseUrl(null)
    setEndedReason(null)
    setLimit(null)
    setRecommendations(null)
    setRecommendationReason(null)
    setRecommendationHistory(null)
    setPostAcceptAddOns(null)
    setShowAddOns(false)
    setFloorReached(false)
    setShippingInfo(null)
    setPaymentInfo(null)
    setRejection(null)
    setActiveTab('chat')
    void startSession()
  }

  // Replay the exact last failed action (start / offer / accept).
  async function retryLast() {
    const last = lastFailedRef.current
    if (!last) return
    if (last.kind === 'start') await startSession()
    else if (last.kind === 'offer' && last.payload) await sendMessage(last.payload, last.turnId)
    else if (last.kind === 'accept') await acceptDeal()
  }

  function trapDialogFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    if (!invitationFirst || !experience || !open || minimised || chatOpenTracked.current) return
    chatOpenTracked.current = true
    trackExperienceEvent({
      storeId,
      eventType: 'chat_open',
      experience,
      productId: shopifyProductId,
      variantId: productCtx.variantId,
      sessionId,
      source: mode === 'cart' ? 'cart' : mode === 'item' ? 'item' : 'storefront',
    })
  }, [invitationFirst, experience, open, minimised, storeId, shopifyProductId, productCtx.variantId, sessionId, mode])

  function openPanel() {
    // Inline experience: the iframe is only as tall as the invitation card.
    // Ask the theme controller to open the full side drawer instead of growing
    // the card into a cramped mini-chat.
    if (isEmbed && view !== 'drawer' && window.parent !== window) {
      let opened = false
      const onAck = (e: MessageEvent) => {
        if (parentOrigin && e.origin !== parentOrigin) return
        if (e.source && e.source !== window.parent) return
        if ((e.data as CgParentMessage | null)?.type === 'cg_drawer_opened') opened = true
      }
      window.addEventListener('message', onAck)
      try {
        window.parent.postMessage({ type: 'cg_open_drawer' } as CgEmbedMessage, '*')
      } catch {
        window.removeEventListener('message', onAck)
        setOpen(true)
        if (!sessionId) void startSession()
        return
      }
      if (parentOrigin) {
        window.setTimeout(() => {
          window.removeEventListener('message', onAck)
          if (!opened) {
            setOpen(true)
            if (!sessionId) void startSession()
          }
        }, 600)
      }
      return
    }
    setOpen(true)
    setMinimised(false)
    if (!sessionId) {
      void startSession()
    }
  }

  // Embedded mode opens as a full chat window by default (the launcher card is
  // what made the storefront look small/cramped). Auto-start the session so the
  // AI greets immediately. Idempotent: busyRef + sessionId guard below. In
  // drawer mode the start waits for the controller's first cg_product_update
  // (or a short deadline) so a variant picked before opening is honored.
  useEffect(() => {
    if (!isEmbed || !open || minimised || checkoutLocked || sessionId || loading || busyRef.current) return
    if (isDrawer && productPending) return
    void startSession()
    // startSession is a stable function declaration; the run is already gated
    // by sessionId/loading/busyRef so re-renders never double-start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbed, isDrawer, productPending, open, minimised, checkoutLocked, sessionId, loading])

  const closePanel = useCallback((preserveAvatar = false) => {
    if (isDrawer && typeof window !== 'undefined') {
      // The theme controller owns visibility in a drawer — closing keeps the
      // same iframe alive (session preserved) and lets the parent restore the
      // page scroll/focus state.
      try {
        window.parent?.postMessage({ type: 'cg_close' } as CgEmbedMessage, '*')
      } catch {}
      if (!preserveAvatar) fireAvatar('widget_closed')
      return
    }
    setOpen(false)
    setMinimised(false)
    if (!preserveAvatar) fireAvatar('widget_closed')
    // Keyboard users: hand focus back to the launcher when the panel closes so
    // the next tab-stop lands somewhere predictable in the theme.
    window.setTimeout(() => launcherRef.current?.focus(), 0)
  }, [fireAvatar, isDrawer])

  // Floating panel: close on Escape. Never fires in embedded/drawer mode (the
  // theme page owns key handling there). Order matters — closePanel above.
  useEffect(() => {
    if (isEmbed || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEmbed, open, closePanel])

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
        containerType: 'inline-size',
        containerName: 'cgwidget',
        ...(isEmbed
          ? isDrawer
            ? {
                // Drawer mode: the theme controller already sized this iframe to
                // 100% of the drawer, so the iframe's own viewport IS the host.
                // `position: fixed; inset: 0` pins the root to the viewport and
                // is immune to ancestor height. A `height: 100%` here silently
                // collapsed to 0: the app's html/body are `height: auto`, a
                // percentage against an auto-height containing block computes to
                // `auto`, and every child of this root is absolutely positioned
                // or screen-reader-only — so the drawer opened perfectly sized
                // and completely empty. Never reintroduce a percentage height.
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                width: '100%',
                background: '#ffffff',
                overflow: 'hidden',
                isolation: 'isolate',
              }
            : {
                position: 'relative',
                width: '100%',
                background: '#ffffff',
                borderRadius: 28,
                border: '1px solid #e0e7ff',
                boxShadow: '0 4px 12px rgba(15,23,42,0.08), 0 20px 48px rgba(79,70,229,0.14)',
                overflow: 'hidden',
                // Inline embed: a proper chat window the parent iframe grows to
                // match via cg_resize (the controller clamps 60–2400px). An
                // explicit pixel height is required here — the iframe is sized
                // FROM this value, so it can never be circular.
                height: open && !minimised ? panelHeight : 'auto',
              }
          : {}),
      }}
    >
      {/* Visually-hidden live region for screen readers */}
      <div className="cg-sr-only" role="status" aria-live="polite">{announcer}</div>

      {!open && (
        experience && experience.invitationVisible !== false ? (
          <div style={{
            minHeight: invitationFirst ? '100%' : undefined,
            display: 'flex',
            alignItems: invitationFirst ? 'center' : undefined,
            justifyContent: invitationFirst ? 'center' : undefined,
            padding: invitationFirst ? 20 : undefined,
          }}>
            <StorefrontInvitation
              experience={experience}
              onOpen={openPanel}
              language={language}
              storeId={storeId}
              productId={shopifyProductId}
              variantId={productCtx.variantId}
              source={mode === 'cart' ? 'cart' : mode === 'item' ? 'item' : 'storefront'}
              trackingEnabled={invitationFirst}
              showAvatar={avatarEnabled}
              personality={experience.personality}
              characterStyle={experience.characterStyle}
              motionEnabled={experience.motionEnabled}
              essentialMotionOnly={experience.essentialMotionOnly}
            />
          </div>
        ) : (
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
            <ProductThumb image={productCtx.image} title={productCtx.title} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minWidth: 0 }}>
                {productCtx.title ? productCtx.title : t('thisItem')}
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>{currencySymbol}{livePrice.toFixed(2)}</span>
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
        )
      )}

      {open && !minimised && (
        <div
          role="dialog"
          aria-modal={!isEmbed}
          aria-label={t('makeOfferSub')}
          onKeyDown={trapDialogFocus}
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
          {/* ── Slim brand accent: gives the embedded window a finished, professional top edge ── */}
          <div style={{ height: 3, flexShrink: 0, background: 'linear-gradient(90deg, #a5b4fc, #6366f1 45%, #818cf8)' }} />

          {/* ── Header: product identity + close/minimise ── */}
          <div style={{
            padding: '14px 14px 0',
            borderBottom: '1px solid #eef2f7',
            background: 'linear-gradient(180deg, #ffffff, #fafbff)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {renderHeaderAvatar(40)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 14.5, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t('bargainTitle')}
                  </span>
                  {personaChip && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, color: '#4f46e5',
                      background: '#eef2ff', border: '1px solid #e0e7ff',
                      borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {personaChip.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1.5, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: '#34d399', flexShrink: 0, boxShadow: '0 0 0 3px rgba(52,211,153,0.18)' }} />
                  <span style={{ fontWeight: 700, color: '#059669', flexShrink: 0 }}>{t('shopkeeperOnline')}</span>
                  <span style={{ color: '#cbd5e1', flexShrink: 0 }}>·</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
                    {productCtx.title || t('thisItem')}
                  </span>
                </div>
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff',
                borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              }}>
                <Zap size={11} />
                {currencySymbol}{livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              {!isEmbed && (
                <button onClick={() => setMinimised(true)} aria-label={t('minimise')} className="cg-icon-btn" style={{ width: 40, height: 40, borderRadius: 11 }}>
                  <Minimize2 size={16} />
                </button>
              )}
              <button
                onClick={() => closePanel()}
                aria-label={t('close')}
                className="cg-icon-btn"
                style={{ width: 40, height: 40, borderRadius: 11 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b' }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Tabs + status/trust/timer in ONE slim row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 2 }}>
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
                      padding: '10px 14px',
                      minHeight: 40,
                      background: activeTab === tab.key ? '#eef2ff' : 'transparent',
                      color: activeTab === tab.key ? '#4f46e5' : '#64748b',
                      border: '1px solid transparent',
                      borderColor: activeTab === tab.key ? '#e0e7ff' : 'transparent',
                      borderRadius: 10,
                      fontSize: 12.5,
                      fontWeight: activeTab === tab.key ? 700 : 600,
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
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, paddingLeft: 8 }}>
                {showRoundMeter && (
                  <RoundMeter used={roundsUsed} max={maxAttempts} t={t} />
                )}
                {timeLeft != null && !sessionEnded && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Clock size={11} style={{ color: '#94a3b8' }} />
                    <span>{t('expiresIn', { n: Math.floor(timeLeft / 60) + ':' + String(timeLeft % 60).padStart(2, '0') })}</span>
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 11, minWidth: 0 }}>
                  <ShieldCheck size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  <span className="cg-private-note" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('privateNote')}</span>
                </span>
                <a
                  href={linkout ? `${linkout}?ai_opt_out=1` : undefined}
                  onClick={linkout ? undefined : (e) => { e.preventDefault(); void optOutOfAI() }}
                  className="cg-link"
                  style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, cursor: 'pointer', outline: 'none', fontSize: 11.5, flexShrink: 0 }}
                >
                  {t('skip')}
                </a>
              </div>
            </div>
          </div>

          {/* ── Today's goal: real server progress (public projection) ── */}
          <GoalStrip goal={goal} currencySymbol={currencySymbol} t={t} />

          {/* ── Price progress rail: listed → best on the table ── */}
          {showPriceRail && (
            <PriceRail
              currencySymbol={currencySymbol}
              listedPrice={livePrice}
              bestCounter={lastCounter}
              bestCustomerOffer={bestCustomerOffer}
              t={t}
            />
          )}

          {/* ── Conversation shell: the shopkeeper stands beside the chat so
              the message list keeps the full panel height instead of spending
              ~204px on a top banner. The composer stays full-width below. ── */}
          <div className="cg-conversation-shell" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {avatarEnabled && !unavailable && !limit && (
              <ShopkeeperStage
                side
                personality={personality}
                expression={character.expression}
                state={character.state}
                event={character.event}
                eventSequence={character.eventSequence}
                eventContext={character}
                gesture={character.gesture}
                position={character.position}
                reaction={character.reaction}
                avatarVariant={avatarVariant}
                characterStyle={characterStyle}
                essentialMotionOnly={essentialMotionOnly}
                name={shopkeeperName}
                status={t('shopkeeperOnline')}
                line={stageLine}
                motionEnabled={experience?.motionEnabled !== false}
                gaze={gaze}
                targetRef={scrollRef}
                forbiddenRefs={[composerRef]}
                enable3D
              />
            )}

            {/* ── Conversation ── */}
            <div
              ref={scrollRef}
              className="cg-chat-log"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label={t('tabChat')}
              onScroll={handleConversationScroll}
              style={{
                flex: 1,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                padding: '16px 18px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                background: '#ffffff',
                minWidth: 0,
                minHeight: 0,
              }}
            >
            {activeTab === 'info' && (
              <BargainOfferSummary
                originalPrice={livePrice}
                finalPrice={finalPrice}
                lastCounter={lastCounter}
                currencySymbol={currencySymbol}
                decision={decision}
                discountCode={discountCode}
                shipping={shippingInfo}
                productTitle={productCtx.title}
                sessionEnded={sessionEnded}
                t={t}
              />
            )}

            {/* Product context — what we're negotiating, shown once at top.
            Hidden in embedded mode: the chat header already shows the
            product, price and persona, and the slim window needs every
            pixel for the actual conversation. */}
            {!isEmbed && messages.length > 0 && (
              <ProductContextCard
                image={productCtx.image}
                title={productCtx.title}
                currencySymbol={currencySymbol}
                price={livePrice}
                mode={mode}
              />
            )}

            {messages.length === 0 && (
              <ChatSkeleton t={t} />
            )}

            {messages.map((m, idx) => (
              <MessageBubble
                key={m.id}
                m={m}
                t={t}
                currencySymbol={currencySymbol}
                 personaChip={personaChip}
                 isFinal={floorReached && idx === messages.length - 1 && m.offeredPrice != null}
                 showSender={!avatarEnabled}
               />
            ))}

                {(shippingInfo || paymentInfo) && (
                  <div style={{ alignSelf: 'flex-start', width: '100%', animation: 'cgMsgIn 0.2s ease-out' }}>
                    <PriceBreakdown
                      t={t}
                      currencySymbol={currencySymbol}
                      listedPrice={livePrice}
                      currentPrice={decision === 'accept' ? finalPrice : lastCounter}
                      priceLabel={decision === 'accept' ? 'yourFinalPrice' : floorReached ? 'finalOffer' : 'counterOffer'}
                      shipping={shippingInfo}
                      payment={paymentInfo}
                    />
                  </div>
                )}

                {/* AI thinking indicator */}
                {thinkingVisible && <TypingIndicator personaChip={personaChip} t={t} showSender={!avatarEnabled} />}

                {/* ── Accepted deal card — conversion hero ── */}
                {!checkoutLocked && decision === 'accept' && finalPrice != null && (
                  <div style={{
                    background: 'linear-gradient(180deg, #ffffff, #f6fefa)',
                    border: '1px solid #bbf7d0',
                    padding: '20px 18px',
                    borderRadius: 24,
                    textAlign: 'center',
                    margin: '4px 0 2px',
                    animation: 'cgMsgIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                    boxShadow: '0 8px 32px rgba(22,163,74,0.18)',
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
                      {t('greatDeal')}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 8 }}>
                      {t('yourFinalPrice')}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10,
                    }}>
                      <span style={{ textDecoration: 'line-through', color: '#cbd5e1', fontWeight: 600, fontSize: 16 }}>{currencySymbol}{livePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      <ArrowRight size={16} style={{ color: '#94a3b8' }} />
                      <span style={{ fontWeight: 900, color: '#15803d', fontSize: 32, fontVariantNumeric: 'tabular-nums' }}>{currencySymbol}{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    {savings != null && savings > 0 && (
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
                          {copied ? t('copiedCheck') : t('copy')}
                        </button>
                      </div>
                    )}
                    {purchaseUrl && (
                      <div style={{ marginTop: 12 }}>
          <a href={purchaseUrl} target="_top" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); void openCheckout(purchaseUrl) }} className="cg-btn cg-btn-primary" style={{ display: 'inline-flex' }}>
                          {t('checkoutAtPrice')}
                        </a>
                      </div>
                    )}
                    <div style={{ fontSize: 12, marginTop: 10, color: '#94a3b8' }}>
                      {t('codeApply')}
                    </div>
                  </div>
                )}

                {checkoutLocked && (
                  <StateCard
                    icon={<CheckCircle2 size={18} />}
                    tone="indigo"
                    title={t('checkout_locked_title')}
                    body={t('checkout_locked_body')}
                  >
                    {lastBought && (
                      <div style={{
                        padding: '10px 12px', borderRadius: 12, background: '#f8fafc',
                        border: '1px solid #e2e8f0', fontSize: 12.5, color: '#475569', fontWeight: 600,
                      }}>
                        {t('last_bought', {
                          product: lastBought.productTitle,
                          price: lastBought.priceLabel ?? '—',
                          date: lastBoughtDate || '—',
                        })}
                      </div>
                    )}
                    {purchaseUrl && (
                      <div className="cg-card-cta">
                        <a href={purchaseUrl} target="_top" rel="noopener noreferrer" className="cg-btn cg-btn-primary" style={{ display: 'inline-flex' }}>
                          {t('continue_checkout')}
                        </a>
                      </div>
                    )}
                  </StateCard>
                )}

                {/* ── Terminal state cards ── */}
                {!checkoutLocked && !limit && sessionEnded && decision === 'reject' && !unavailable && (
                  <StateCard
                    icon={<Tag size={18} />}
                    tone="amber"
                    title={t('negotiationEnded')}
                    body={t('dealRejected')}
                  >
                    {retentionOffer}
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

                {!checkoutLocked && !limit && sessionEnded && endedReason === 'expired' && !unavailable && (
                  <StateCard
                    icon={<Clock size={18} />}
                    tone="slate"
                    title={t('expiredSession')}
                    body={t('terminal_expired')}
                  >
                    {retentionOffer}
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

                {!checkoutLocked && !limit && sessionEnded && endedReason !== 'expired' && decision === 'idle' && !unavailable && (
                  <StateCard
                    icon={<RotateCcw size={18} />}
                    tone="slate"
                    title={t('negotiationEnded')}
                    body={t('terminal_abandoned')}
                  >
                    {retentionOffer}
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
                {!checkoutLocked && !limit && unavailable && rejection && (
                  <StateCard
                    icon={<AlertCircle size={18} />}
                    tone="rose"
                    title={t('itemUnavailable')}
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
                {!checkoutLocked && !limit && sessionEnded === false && rejection && !unavailable && (
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

                {/* Customer-safe capacity notice — never expose plan/billing details here. */}
                {limit && (
                  <div role="alert">
                    <StateCard
                      icon={<MessageCircle size={18} />}
                      tone="slate"
                      title={t('negotiationEnded')}
                      body={t('noHardFeelings')}
                    >
                      {linkout && (
                        <div className="cg-card-cta">
                          <a href={linkout} className="cg-btn cg-btn-primary">{t('skip')}</a>
                        </div>
                      )}
                    </StateCard>
                  </div>
                )}

                {/* Network / generic error */}
                {!checkoutLocked && !limit && error && (
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
                        <button type="button" className="cg-btn cg-btn-ghost" onClick={() => setError(null)}>{t('dismiss')}</button>
                      )}
                    </div>
                  </StateCard>
                )}
            </div>
          </div>

          {activeTab === 'chat' && conversationUnread > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 12px 2px', background: '#ffffff' }}>
              <button
                type="button"
                onClick={() => { jumpToLatestMessage() }}
                style={{
                  background: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: 999,
                  padding: '6px 14px', minHeight: 40, fontSize: 11.5, fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(79,70,229,0.28)',
                }}
              >
                {t('jumpToLatest', { n: conversationUnread })}
              </button>
            </div>
          )}

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

          {activeTab === 'chat' && (
            <BargainRecommendationPanel
              recommendations={recommendations}
              reason={recommendationReason}
              history={recommendationHistory}
              onEvent={handleRecommendationEvent}
              autoExpand={recommendationReason === 'discovery' || recommendationReason === 'requested' || recommendationReason === 'complementary'}
              ariaLabel={t('alternativesTitle')}
              language={language}
            />
          )}

          {activeTab === 'chat' && decision === 'accept' && postAcceptAddOns && postAcceptAddOns.length > 0 && (
            <div style={{ background: '#ffffff', borderTop: '1px solid #eef2f7' }}>
              <button
                type="button"
                aria-expanded={showAddOns}
                onClick={() => setShowAddOns((value) => !value)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 13px', background: '#fafbff', border: 'none',
                  color: '#4338ca', cursor: 'pointer', textAlign: 'left', minWidth: 0, minHeight: 44,
                  fontSize: 12, fontWeight: 700,
                }}
              >
                <Zap size={13} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>{t('addOnsTitle')}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{showAddOns ? '−' : '+'}</span>
              </button>
              {showAddOns && (
                <BargainRecommendationPanel
                  recommendations={postAcceptAddOns}
                  reason="complementary"
                  autoExpand
                  onEvent={handleRecommendationEvent}
                  ariaLabel={t('addOnsTitle')}
                  language={language}
                />
              )}
            </div>
          )}

          {/* ── Offer composer ── */}
          {!limit && !unavailable && startedComposer(sessionEnded, decision) && (
            <>
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
                padding: '10px 14px 12px',
                background: '#ffffff',
                borderTop: '1px solid #eef2f7',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                {/* Message / offer composer — one calm, roomy control. Free text
                    is a real chat message; a number anywhere in it is treated
                    as the negotiation offer. */}
                <div ref={composerRef} className="cg-composer" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 24,
                  border: '1px solid #dbe3ee',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  padding: '6px 6px 6px 18px',
                  boxShadow: '0 6px 20px rgba(15,23,42,0.08)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
                  opacity: sessionEnded ? 0.55 : 1,
                }}>
                  <input
                    ref={inputRef}
                    id="cg-bargain-input"
                    name="cg-bargain-message"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    maxLength={500}
                    aria-label={t('typeMessage')}
                    aria-describedby="cg-bargain-input-help"
                    placeholder={t('typeMessage')}
                    value={input}
                    onFocus={() => {
                      setGaze({ x: 0, y: 0.55 })
                    }}
                    onBlur={() => {
                      setGaze(null)
                      customerTypingRef.current = false
                    }}
                    onChange={e => {
                      setInput(e.target.value)
                      if (e.target.value.trim() && !customerTypingRef.current) {
                        customerTypingRef.current = true
                        fireAvatar('customer_typing')
                      }
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
                      padding: '12px 4px',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: 16,
                      fontWeight: 500,
                      lineHeight: 1.35,
                      outline: 'none',
                      minHeight: 54,
                    }}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={loading || !input.trim() || sessionEnded || !!busyRef.current}
                    aria-label={draftAmount != null ? t('makeOffer') : t('send')}
                    className="cg-btn cg-btn-send cg-btn-send--inline"
                  >
                    <Send size={17} />
                    <span className="cg-send-label">
                      {draftAmount != null
                        ? `${t('makeOffer')} · ${currencySymbol}${draftAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                        : t('send')}
                    </span>
                  </button>
                </div>
                <div
                  id="cg-bargain-input-help"
                  className="cg-composer-helper"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '0 3px',
                    fontSize: 11.5,
                    lineHeight: 1.3,
                    color: '#94a3b8',
                  }}>

                  <span>{input.trim() ? (draftAmount != null ? t('offerDetected') : t('pressEnterToSend')) : t('nameYourPriceHint')}</span>
                  <span aria-hidden>{input.length}/500</span>
                </div>
              </div>
            </>
          )}

          {/* ── Accepted conversion footer ── */}
          {!checkoutLocked && !limit && decision === 'accept' && discountCode != null && (
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
                  <button type="button" className="cg-icon-btn" onClick={copyCode} aria-label={t('copy')}>
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
            {renderHeaderAvatar(32)}
            <div className="cg-mini-copy">
              <div>{t('bargainTitle')}</div>
              <div>{productCtx.title ? productCtx.title : t('thisItem')}</div>
            </div>
            <button type="button" onClick={() => setMinimised(false)} aria-label={t('makeOffer')} className="cg-icon-btn" style={{ width: 44, height: 44 }}>
              <MessageCircle size={18} />
            </button>
            <button type="button" onClick={() => closePanel()} aria-label={t('close')} className="cg-icon-btn" style={{ width: 44, height: 44 }}>
              <X size={17} />
            </button>
          </div>
          {isEmbed && (
            <style dangerouslySetInnerHTML={{ __html: `
              .cg-embed-mini { position: absolute; inset: 0; z-index: 99999; background: #ffffff; display: flex; }
              .cg-embed-mini .cg-mini-inner { display: flex; align-items: center; gap: 10px; padding: 10px 12px; width: 100%; border-radius: 14px; border: 1px solid #e0e7ff; background: #fafbff; }
            ` }} />
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes cgPanelIn { from { opacity: 0; transform: translateY(10px) scale(0.985) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes cgMsgIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cgDotPulse { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0) scale(0.85) } 40% { opacity: 1; transform: translateY(-2px) scale(1) } }
        @keyframes cgTickIn { 0% { opacity: 0; transform: scale(0.6) } 60% { transform: scale(1.12) } 100% { opacity: 1; transform: scale(1) } }
        /* Single delivered tick on the shopper's own bubble. */
        .cg-tick { color: rgba(255,255,255,0.55); opacity: 0.55; transition: color 0.2s ease, opacity 0.2s ease }
        .cg-tick-in { color: #ffffff; opacity: 1; animation: cgTickIn 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) }
        @keyframes cgAttnPulse { 0% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4) } 70% { box-shadow: 0 0 0 12px rgba(99,102,241,0) } 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0) } }
        @keyframes cgAttnFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }

        /* ── Scope: everything lives under the cartgain-bargain namespace so no
           Shopify theme CSS is touched. Deliberate z-index scale: FAB 9998,
           panel 9999, embed-in-frame 99999. Never bumped blindly above theme. ── */
        .cartgain-bargain * { box-sizing: border-box }
        .cartgain-bargain { --cg-surface: #f8fafc; --cg-ink: #0f172a; --cg-muted: #64748b; --cg-line: #e2e8f0 }
        .cartgain-bargain .cg-chat-log { background: linear-gradient(180deg, #f8fafc 0%, #ffffff 18%, #ffffff 100%); }
        .cartgain-bargain .cg-composer-helper { color: var(--cg-muted); letter-spacing: 0.01em }
        .cartgain-bargain ::-webkit-scrollbar { width: 6px }
        .cartgain-bargain ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px }
        .cartgain-bargain button:focus-visible,
        .cartgain-bargain a:focus-visible,
        .cartgain-bargain input:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px }
        .cartgain-bargain .cg-composer:focus-within {
          border-color: #818cf8;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.16), 0 6px 16px rgba(99,102,241,0.1);
          background: #ffffff;
        }
        .cartgain-bargain .cg-composer .cg-btn-send--inline {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #ffffff;
          border-radius: 12px;
          padding: 0 16px;
          height: 44px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(99,102,241,0.35);
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .cartgain-bargain .cg-composer .cg-btn-send--inline:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(99,102,241,0.45);
        }
        .cartgain-bargain .cg-composer .cg-btn-send--inline:active:not(:disabled) {
          transform: translateY(0);
        }

        .cg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0 }

        .cartgain-bargain .cg-fab { position: fixed; right: 24px; bottom: 24px; z-index: 9998 }
        .cartgain-bargain .cg-panel-fixed {
          position: fixed; z-index: 9999;
          right: 16px; bottom: 16px;
          width: clamp(440px, 44vw, 560px);
          max-width: calc(100vw - 32px);
          height: min(860px, calc(100dvh - 32px));
          max-height: calc(100dvh - 32px);
          min-height: 0;
          border-radius: 24px;
          border: 1px solid rgba(226,232,240,0.95);
          box-shadow: -20px 32px 80px rgba(15,23,42,0.28), 0 4px 16px rgba(15,23,42,0.12);
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
        .cg-mini-inner { display: flex; align-items: center; gap: 10px; padding: 10px 12px; width: 100%; height: 100%; }
        .cg-mini-copy { flex: 1; min-width: 0; }
        .cg-mini-copy > div:first-child { font-weight: 800; font-size: 13.5; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cg-mini-copy > div:last-child { font-size: 11.5; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .cartgain-bargain .cg-icon-btn {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
          color: #64748b; cursor: pointer; width: 40px; height: 40px;
          display: inline-flex; align-items: center; justify-content: center;
          transition: all 0.15s ease; outline: none; flex-shrink: 0;
        }
        .cg-tab { touch-action: manipulation }
        .cg-link { touch-action: manipulation }

        .cg-btn {
          border: none; border-radius: 12px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          font-weight: 800; font-size: 15px; outline: none; touch-action: manipulation;
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
          box-shadow: 0 4px 16px rgba(79,70,229,0.42); min-height: 56px;
          border-radius: 14px;
        }
        .cg-btn-send:not(:disabled):hover { background: linear-gradient(135deg, #4f46e5, #4338ca); box-shadow: 0 6px 20px rgba(79,70,229,0.5) }
        .cg-btn-send:active { transform: translateY(1px) }
        .cg-btn-send:disabled { opacity: 0.6; box-shadow: none }
        .cg-btn-send--inline {
          width: auto; flex: 0 0 auto; min-height: 50px; padding: 0 16px;
          border-radius: 13px; font-size: 14px; white-space: nowrap;
        }
        .cg-send-label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
        @media (max-width: 380px) {
          .cg-send-label { max-width: 92px }
          .cg-btn-send--inline { padding: 0 13px }
          .cartgain-bargain .cg-private-note { display: none }
        }
        .cg-btn-ghost {
          background: #ffffff; color: #475569; border: 1px solid #e2e8f0; text-decoration: none;
        }
        .cg-btn-ghost:hover { background: #f8fafc }

        .cg-card-cta { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 14px }

        .cg-skel-bar {
          height: 9px; border-radius: 999px; background: #e8ecf4;
          animation: cgSkelPulse 1.5s ease-in-out infinite;
        }
        .cg-skel-row { animation: cgMsgIn 0.2s ease-out }
        @keyframes cgSkelPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }

        .spin { animation: spin 1s linear infinite }
        .cg-dot { animation: cgDotPulse 1.2s infinite ease-in-out }

        /* Visible, slim scrollbar for the conversation so more content is
           always discoverable and scrollable on small screens. */
        .cartgain-bargain [role="log"] { scrollbar-width: thin; scrollbar-color: #c7d2fe transparent }
        .cartgain-bargain [role="log"]::-webkit-scrollbar { width: 8px }
        .cartgain-bargain [role="log"]::-webkit-scrollbar-track { background: transparent }
        .cartgain-bargain [role="log"]::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 999px }
        .cartgain-bargain [role="log"]::-webkit-scrollbar-thumb:hover { background: #a5b4fc }

        /* Reduced motion: kill every animation + transition */
        .cg-reduced-motion *, .cg-reduced-motion [style*="animation"], .cg-reduced-motion .cg-fab { animation: none !important; transition: none !important }
        .cg-reduced-motion .cg-attn { box-shadow: none !important; transform: none !important }

        /* Keyboard-up resilience on coarse pointers: keep composer reachable */
        @media (max-width: 680px), (pointer: coarse) {
          .cartgain-bargain .cg-fab { left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); width: auto; justify-content: center }
          .cartgain-bargain .cg-panel-fixed {
            left: 0; right: 0; bottom: 0; top: auto;
            width: 100%; max-width: none; max-height: none;
            border-radius: 24px 24px 0 0; border-bottom: none;
            height: 96svh; height: 96lvh; height: 96dvh;
            max-height: 100lvh;
          }
          .cartgain-bargain .cg-panel-mini { left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); width: auto }
        }
        @media (max-width: 680px) {
          /* dvh already shrinks with the keyboard on modern mobile; the panel
             keeps its constant height (never collapses below the chat while
             typing) and the composer stays reachable above the keyboard. */
          .cartgain-bargain .cg-panel-fixed { height: 96dvh; max-height: 100dvh }
        }
        @supports (padding: max(0px)) {
          .cartgain-bargain .cg-panel-fixed, .cartgain-bargain .cg-panel-mini { padding-bottom: env(safe-area-inset-bottom) }
        }
        @media (max-height: 560px) and (max-width: 680px) {
          .cartgain-bargain .cg-goal,
          .cartgain-bargain .cg-rounds { display: none !important; }
          .cartgain-bargain .cg-rail { padding-top: 6px; padding-bottom: 6px; }
        }
      ` }} />
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

