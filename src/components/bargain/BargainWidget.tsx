'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Send, MessageCircle, Sparkles, Loader2, CheckCircle2, Clock, Tag, Zap, ShieldCheck, ChevronRight,
} from 'lucide-react'
import { currencySymbolFor, uiText } from '@/lib/bargain/i18n'

type Props = {
  storeId: string
  shopifyProductId: string
  variantId?: string
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
  attemptsRemaining?: number
  finalPrice?: number | null
  discountCode?: string | null
  expiresAt?: string
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
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState<{ code: string; planId?: string; upgradeUrl?: string } | null>(null)
  const [decision, setDecision] = useState<'idle' | 'counter' | 'accept' | 'reject'>('idle')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<'created' | 'pending' | 'failed' | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const currencySymbol = currencySymbolFor(currency)
  const t = (key: Parameters<typeof uiText>[1], vars?: Record<string, string | number>) => uiText(language, key, vars)

  const thinking = loading && decision !== 'accept'
  const personaChip = persona ? PERSONA_CHIP[persona] : undefined
  const savings = decision === 'accept' && finalPrice != null ? originalPrice - finalPrice : null

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  useEffect(() => {
    if (!expiresAt) return
    const iv = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(ms / 1000)))
    }, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])

  // Embedded mode: keep the parent Shopify iframe sized to our content.
  const announceHeight = useCallback(() => {
    if (!isEmbed || typeof window === 'undefined') return
    const h = Math.max(
      document.documentElement?.scrollHeight ?? 0,
      document.body?.scrollHeight ?? 0,
    )
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
    const t = setTimeout(announceHeight, 60)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(t)
    }
  }, [isEmbed, announceHeight])

  useEffect(() => {
    if (!isEmbed) return
    const t = setTimeout(announceHeight, 40)
    return () => clearTimeout(t)
  }, [isEmbed, announceHeight, open, messages, decision, discountCode, attemptsRemaining, loading, sessionEnded, copied])

  async function startSession() {
    setLoading(true)
    setError(null)
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
      setAttemptsRemaining(data.attemptsRemaining ?? null)
      setExpiresAt(data.expiresAt ?? null)
      if (data.existingSession && data.session?.messages?.length) {
        const restored: Message[] = data.session.messages.map((m: any) => ({
          id: m.id,
          role: m.role === 'ai' ? 'ai' : m.role === 'customer' ? 'customer' : 'system',
          content: m.content,
          offeredPrice: m.offeredPrice ?? null,
          createdAt: m.createdAt,
        }))
        setMessages(restored)
        if (data.session.status !== 'active') setSessionEnded(true)
      } else {
        const aiMsg: Message = {
          id: 'opening',
          role: 'ai',
          content: data.openingMessage ?? 'Welcome! What price were you thinking?',
          createdAt: new Date().toISOString(),
        }
        setMessages([aiMsg])
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to start')
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage(text?: string) {
    if (!sessionId) return
    const msg = (text ?? input).trim()
    if (!msg) { setError('Type a message'); return }
    setLoading(true)
    setError(null)
    setMessages(prev => [
      ...prev,
      { id: `c-${Date.now()}`, role: 'customer', content: msg, offeredPrice: null, createdAt: new Date().toISOString() },
    ])
    setInput('')
    try {
      const res = await fetch(`${apiBase}/api/bargain/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: msg }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.terminal) {
          setSessionEnded(true)
          setMessages(prev => [...prev, {
            id: `s-${Date.now()}`, role: 'system', content: data.message ?? 'Session ended.',
            offeredPrice: null, createdAt: new Date().toISOString(),
          }])
          if (data.status === 'rejected') setDecision('reject')
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
      setAttemptsRemaining(data.attemptsRemaining ?? null)
      if (data.decision === 'accept' || data.decision === 'reject') {
        setDecision(data.decision)
      }
      if (data.finalPrice != null) setFinalPrice(data.finalPrice)
    } catch (err: any) {
      setError(err.message ?? 'Failed to send')
    } finally {
      setLoading(false)
    }
  }

  async function optOutOfAI() {
    try {
      setLoading(true)
      if (sessionId) {
        await fetch(`${apiBase}/api/bargain/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: 'opt-out' }),
        })
      }
      setSessionEnded(true)
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
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/api/bargain/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 402 && data.code) {
          setLimit({ code: data.code, planId: data.planId, upgradeUrl: data.upgradeUrl })
          setDecision('idle')
          setSessionEnded(true)
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
          content: data.message,
          createdAt: new Date().toISOString(),
        },
      ])
      setDecision('accept')
      setSessionEnded(true)
    } catch (err: any) {
      setError(err.message ?? 'Could not complete the deal')
    } finally {
      setLoading(false)
    }
  }

  function openPanel() {
    setOpen(true)
    if (!sessionId) {
      void startSession()
    }
  }

  function closePanel() {
    setOpen(false)
  }

  function copyCode() {
    if (!discountCode) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(discountCode).catch(() => {})
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  function quickOffer(fn: () => void) {
    if (sessionEnded || thinking) return
    fn()
  }

  return (
    <div
      className="bargain-widget-root"
      style={{
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        ...(isEmbed
          ? {
              position: 'relative',
              width: '100%',
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06)',
              overflow: 'hidden',
              height: open ? 560 : 'auto',
            }
          : {}),
      }}
    >
      {isEmbed ? (
        <button
          onClick={openPanel}
          type="button"
          aria-label="Bargain for a better price"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            background: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            borderRadius: 16,
            transform: open ? 'translateY(0)' : undefined,
          }}
        >
          {/* Indigo accent spine */}
          <div style={{
            alignSelf: 'stretch',
            width: 4,
            borderRadius: 4,
            background: 'linear-gradient(180deg, #818cf8, #4f46e5)',
            flexShrink: 0,
          }} />
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt=""
              width={56}
              height={56}
              style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', border: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
              🛍️
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {productTitle ? productTitle : 'this item'}
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{currencySymbol}{originalPrice.toFixed(2)}</span>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Zap size={11} style={{ color: '#4f46e5' }} />
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
                  {isEmbed && mode === 'cart' ? 'Bargain a discount before checkout' : 'Want a better price?'}
                </span>
              </span>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <span
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                padding: '9px 16px',
                borderRadius: 999,
                border: 'none',
                boxShadow: '0 2px 10px rgba(79,70,229,0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={14} />
              {t('negotiate')}
            </span>
            {personaChip && (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                {personaChip.emoji} {personaChip.label} negotiator
              </span>
            )}
          </div>
          <ChevronRight size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
        </button>
      ) : (
        /* Floating trigger button */
        <button
          onClick={openPanel}
          aria-label="Bargain for a better price"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.2)',
            fontWeight: 700,
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(79,70,229,0.4), 0 2px 8px rgba(0,0,0,0.12)',
            transition: 'all 0.2s ease',
            zIndex: 99998,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)'
            e.currentTarget.style.boxShadow = '0 10px 34px rgba(79,70,229,0.5), 0 2px 8px rgba(0,0,0,0.14)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)'
            e.currentTarget.style.boxShadow = '0 8px 28px rgba(79,70,229,0.4), 0 2px 8px rgba(0,0,0,0.12)'
          }}
        >
          <Sparkles size={18} />
          <span>{t('negotiate')}</span>
        </button>
      )}

      {/* Slide-out panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Price negotiation"
          style={{
            position: isEmbed ? 'absolute' : 'fixed',
            top: 0,
            right: 0,
            left: isEmbed ? 0 : undefined,
            bottom: 0,
            width: '100%',
            maxWidth: isEmbed ? 'none' : 440,
            background: '#ffffff',
            color: '#1e293b',
            boxShadow: isEmbed ? 'none' : '-8px 0 40px rgba(0,0,0,0.16)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'cgPanelIn 0.22s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '18px 20px',
            borderBottom: '1px solid #eef2f7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #ffffff, #fafbff)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
                flexShrink: 0,
              }}>
                <MessageCircle size={20} style={{ color: '#ffffff' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t('dealTitle')}
                  {personaChip && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#4f46e5',
                      background: '#eef2ff',
                      border: '1px solid #e0e7ff',
                      borderRadius: 999,
                      padding: '2px 8px',
                      whiteSpace: 'nowrap',
                    }}>
                      {personaChip.emoji} {personaChip.label}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {productTitle ? productTitle : 'Product'} · <span style={{ fontWeight: 600, color: '#0f172a' }}>{currencySymbol}{originalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={closePanel}
              aria-label="Close"
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                color: '#64748b',
                cursor: 'pointer',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Privacy / AI notice strip */}
          <div style={{
            padding: '8px 20px',
            fontSize: 11,
            color: '#94a3b8',
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
              {t('aiPowered')}
            </span>
            <a
              href={linkout ? `${linkout}?ai_opt_out=1` : undefined}
              onClick={linkout ? undefined : (e) => { e.preventDefault(); void optOutOfAI() }}
              style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, cursor: 'pointer', outline: 'none' }}
            >
              {t('skip')}
            </a>
          </div>

          {/* Attempts + timer */}
          {(attemptsRemaining != null || timeLeft != null) && !sessionEnded && (
            <div style={{
              padding: '8px 20px',
              fontSize: 12,
              color: '#64748b',
              background: '#ffffff',
              borderBottom: '1px solid #eef2f7',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}>
              {attemptsRemaining != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    background: attemptsRemaining <= 1 ? '#fef2f2' : '#f0fdf4',
                    color: attemptsRemaining <= 1 ? '#dc2626' : '#16a34a',
                    padding: '2px 9px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {t('attemptsLeft', { n: attemptsRemaining })}
                  </span>
                </span>
              )}
              {timeLeft != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                  <Clock size={12} />
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: '#fbfcfe',
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '40px 0' }}>
                <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                {t('connecting')}
              </div>
            )}
            {messages.map(m => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'customer' ? 'flex-end' : 'flex-start',
                  maxWidth: '86%',
                  animation: 'cgMsgIn 0.18s ease-out',
                }}
              >
                {m.role !== 'customer' && (
                  <div style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: m.role === 'ai' ? '#6366f1' : '#94a3b8',
                    marginBottom: 4,
                    paddingLeft: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}>
                    {m.role === 'ai' ? <span>💬 {t('assistant')}</span> : <span>{t('notice')}</span>}
                  </div>
                )}
                <div
                  style={{
                    background:
                      m.role === 'customer'
                        ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                        : m.role === 'system'
                        ? '#eef2ff'
                        : '#ffffff',
                    color: m.role === 'customer' ? '#ffffff' : '#334155',
                    padding: '11px 15px',
                    borderRadius: m.role === 'customer' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    border: m.role !== 'customer' ? '1px solid #e2e8f0' : 'none',
                    boxShadow: m.role !== 'customer' ? '0 1px 3px rgba(15,23,42,0.05)' : '0 2px 8px rgba(79,70,229,0.18)',
                  }}
                >
                  {m.content}
                  {m.offeredPrice != null && (
                    <div style={{
                      marginTop: 8,
                      padding: '7px 11px',
                      background: m.role === 'customer' ? 'rgba(255,255,255,0.14)' : '#f0fdf4',
                      borderRadius: 8,
                      border: m.role === 'customer' ? 'none' : '1px solid #bbf7d0',
                      fontSize: 13,
                      fontWeight: 700,
                      color: m.role === 'customer' ? '#ffffff' : '#15803d',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <Tag size={13} />
                      {t('offered')} {currencySymbol}{m.offeredPrice.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* AI thinking indicator */}
            {thinking && (
              <div style={{ alignSelf: 'flex-start', animation: 'cgMsgIn 0.18s ease-out' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', marginBottom: 4, paddingLeft: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {t('assistant')}
                </div>
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  padding: '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
                }}>
                  <span className="cg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1' }} />
                  <span className="cg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animationDelay: '0.15s' }} />
                  <span className="cg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animationDelay: '0.3s' }} />
                </div>
              </div>
            )}

            {/* Accepted deal card */}
            {decision === 'accept' && finalPrice != null && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #c7d2fe',
                padding: 18,
                borderRadius: 16,
                textAlign: 'center',
                margin: '6px 0 2px',
                animation: 'cgMsgIn 0.2s ease-out',
                boxShadow: '0 4px 16px rgba(79,70,229,0.12)',
              }}>
                <div style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                }}>
                  <CheckCircle2 size={26} style={{ color: '#16a34a' }} />
                </div>
                {savings != null && (
                  <div style={{ fontWeight: 800, fontSize: 17, color: '#0f172a', marginBottom: 3 }}>
                    {t('youSaved', { x: `${currencySymbol}${savings.toFixed(2)}` })}
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                  {t('newPrice')}{' '}
                  <span style={{ textDecoration: 'line-through', color: '#cbd5e1', marginRight: 6 }}>{currencySymbol}{originalPrice.toFixed(2)}</span>
                  <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>{currencySymbol}{finalPrice.toFixed(2)}</span>
                </div>
                {discountCode && (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px dashed #c7d2fe',
                    padding: '10px 14px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}>
                    <Tag size={15} style={{ color: '#6366f1' }} />
                    <code style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', letterSpacing: 0.8 }}>{discountCode}</code>
                    <button
                      onClick={copyCode}
                      style={{
                        background: copied ? '#16a34a' : '#ffffff',
                        border: copied ? 'none' : '2px solid #4f46e5',
                        color: copied ? '#ffffff' : '#4f46e5',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4338ca' } }}
                      onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#4f46e5' } }}
                    >
                      {copied ? '✓ Copied' : t('copy')}
                    </button>
                  </div>
                )}
                {shopifyStatus === 'pending' || !discountCode ? (
                  <div style={{ fontSize: 12, marginTop: 10, color: '#94a3b8' }}>
                    {t('codeApply')}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, marginTop: 10, color: '#94a3b8' }}>
                    Apply the code at checkout to save now.
                  </div>
                )}
              </div>
            )}

            {/* Rejection footer message */}
            {sessionEnded && decision === 'reject' && (
              <div style={{
                padding: '10px 16px',
                fontSize: 13,
                color: '#b45309',
                background: '#fffbeb',
                borderRadius: 10,
                border: '1px solid #fde68a',
                textAlign: 'center',
              }}>
                Looks like we couldn&apos;t reach a deal this time. Your cart stays at the listed price — no hard feelings!
              </div>
            )}

            {/* Plan limit reached */}
            {limit && (
              <div role="alert" style={{
                margin: '0 16px',
                padding: '16px',
                fontSize: 13,
                color: '#1e293b',
                background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)',
                borderRadius: 12,
                border: '1px solid #c7d2fe',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
                <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: 4 }}>
                  {limit.code === 'bargain_sessions_exhausted'
                    ? 'This month\u2019s bargain sessions are used up'
                    : 'This month\u2019s slate of deals has been filled'}
                </div>
                <div style={{ color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>
                  Bargaining reopens next month. The store can raise the limit on a Growth or Pro plan.
                </div>
                <a
                  href={limit.upgradeUrl ?? 'https://cart-gain.com/pricing'}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-block',
                    background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
                    color: '#fff',
                    padding: '9px 18px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: 13,
                    boxShadow: '0 2px 10px rgba(79,70,229,0.3)',
                  }}
                >
                  View plans
                </a>
              </div>
            )}

            {/* Error */}
            {!limit && error && (
              <div role="alert" style={{
                padding: '10px 16px',
                fontSize: 13,
                color: '#dc2626',
                background: '#fef2f2',
                borderRadius: 10,
                border: '1px solid #fecaca',
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          {!limit && startedComposer(sessionEnded, decision) && (
            <>
              {!sessionEnded && (
                <div style={{
                  padding: '8px 20px 0',
                  background: '#ffffff',
                  display: 'flex',
                  gap: 6,
                  borderTop: '1px solid #eef2f7',
                  flexWrap: 'wrap',
                }}>
                  <QuickChip label={`−10%`} disabled={thinking} onClick={() => quickOffer(() => setInput(`${currencySymbol}${Math.round(originalPrice * 0.9)}`))} />
                  <QuickChip label={t('bestOffer')} disabled={thinking} onClick={() => quickOffer(() => setInput(t('bestOfferPrompt')))} />
                  <QuickChip label={t('walkout')} disabled={thinking} onClick={() => quickOffer(() => setInput(t('walkoutPrompt')))} />
                </div>
              )}
              <div style={{
                padding: '12px 16px 16px',
                background: '#ffffff',
                display: 'flex',
                gap: 8,
              }}>
                <input
                  type="text"
                  placeholder={sessionEnded ? t('sessionEnded') : t('typeOffer')}
                  aria-label="Type your offer"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={loading || sessionEnded}
                  autoComplete="off"
                  style={{
                    flex: 1,
                    padding: '12px 15px',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                    outline: 'none',
                    transition: 'border-color 0.15s ease',
                    opacity: sessionEnded ? 0.55 : 1,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#ffffff' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !sessionEnded) void sendMessage()
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim() || sessionEnded}
                  aria-label="Send"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '0 18px',
                    cursor: 'pointer',
                    minWidth: 50,
                    minHeight: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: (loading || !input.trim() || sessionEnded) ? 0.5 : 1,
                    boxShadow: '0 2px 10px rgba(79,70,229,0.35)',
                    transition: 'all 0.15s ease',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5, #4338ca)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
                >
                  {loading ? <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
                </button>
              </div>
            </>
          )}

          {/* Accept bar */}
          {decision === 'accept' && (
            <div style={{ padding: '10px 16px 14px', background: '#ffffff', borderTop: '1px solid #eef2f7' }}>
              <button
                onClick={acceptDeal}
                disabled={loading || !!discountCode}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: discountCode ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#ffffff',
                  color: discountCode ? '#ffffff' : '#16a34a',
                  border: discountCode ? 'none' : '2px solid #16a34a',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 15,
                  opacity: (loading || !!discountCode) ? 0.85 : 1,
                  boxShadow: '0 3px 12px rgba(22,163,74,0.3)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  outline: 'none',
                }}
              >
                {discountCode ? (
                  <><CheckCircle2 size={18} /> {t('dealComplete')}</>
                ) : (
                  <>{t('acceptDeal')} · {currencySymbol}{finalPrice?.toFixed(2)}</>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes cgPanelIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cgMsgIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cgDotPulse { 0%, 60%, 100% { opacity: 0.35; transform: scale(0.9) } 30% { opacity: 1; transform: scale(1) } }
        .spin { animation: spin 1s linear infinite }
        .cg-dot { animation: cgDotPulse 1.2s infinite ease-in-out }
        .bargain-widget-root * { box-sizing: border-box }
        .bargain-widget-root ::-webkit-scrollbar { width: 6px }
        .bargain-widget-root ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px }
        .bargain-widget-root button:focus-visible, .bargain-widget-root a:focus-visible, .bargain-widget-root input:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px }
      `}</style>
    </div>
  )
}

function startedComposer(sessionEnded: boolean, decision: 'idle' | 'counter' | 'accept' | 'reject'): boolean {
  // Keep the composer hidden once a deal is concluded with a code (accepted)
  // or rejected — the accept bar takes over for the 'accept' state.
  if (decision === 'accept') return false
  return true
}

function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        color: '#475569',
        borderRadius: 999,
        padding: '5px 11px',
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        outline: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.color = '#4338ca' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569' }}
    >
      {label}
    </button>
  )
}