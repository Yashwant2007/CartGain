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

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const userText = input.trim()
    setMessages((prev) => [...prev, { role: 'customer', content: userText }])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/bargain/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `storefront_${shop}_${productId || 'cart'}_${line.kind}_${originalPrice}`,
          message: userText,
          // Pass context for session creation
          shopDomain: shop,
          productId: isCart ? null : productId,
          variantId: isCart ? null : variantId,
          originalPrice,
          currency,
          title,
          minPrice: Math.round(originalPrice * (1 - PROFIT_PERCENT / 100) * 100) / 100,
          maxAttempts: MAX_ATTEMPTS,
          persona,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Fallback to local logic if API fails
        throw new Error(data.message || 'API error')
      }

      const nextAttempt = attempts + 1
      const exhausted = nextAttempt >= MAX_ATTEMPTS

      setMessages((prev) => [...prev, { role: 'ai', content: data.reply, price: data.counterOffer }])
      setAttempts(nextAttempt)

      if (data.decision === 'accept') {
        setStep('deal')
        setFinalPrice(data.counterOffer ?? data.finalPrice)
        setDiscountCode(data.discountCode || `BARGAIN_${Date.now().toString(36).toUpperCase()}`)
      } else if (data.decision === 'reject' || data.sessionStatus === 'rejected' || data.sessionStatus === 'abandoned') {
        setStep('rejected')
      } else {
        setStep('chat')
      }
    } catch (err: any) {
      console.warn('[StorefrontBargain] API failed, using local fallback:', err.message)
      // Local fallback logic (existing rule-based)
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

  // Local fallback helpers (copied from original for fallback)
  const extractPrice 
