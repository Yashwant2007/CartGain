'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Send, MessageCircle, Sparkles, Loader2, CheckCircle2, Clock, Tag,
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
  const [decision, setDecision] = useState<'idle' | 'counter' | 'accept' | 'reject'>('idle')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<'created' | 'pending' | 'failed' | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const currencySymbol = currencySymbolFor(currency)
  const t = (key: Parameters<typeof uiText>[1], vars?: Record<string, string | number>) => uiText(language, key, vars)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(ms / 1000)))
    }, 1000)
    return () => clearInterval(t)
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
  }, [isEmbed, announceHeight, open, messages, decision, discountCode, attemptsRemaining, loading, sessionEnded])

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
      if (!res.ok) throw new Error(data.message ?? 'Could not start bargaining')
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
      if (!res.ok) throw new Error(data.message ?? 'Could not accept')
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
    }
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
              height: open ? 520 : 'auto',
            }
          : {}),
      }}
    >
      {isEmbed ? (
        <button
          onClick={openPanel}
          type="button"
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
          }}
        >
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt=""
              width={52}
              height={52}
              style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', border: '1px solid #e2e8f0', background: '#f8fafc' }}
            />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 12, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
              🛍️
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {productTitle ? productTitle : 'this item'}
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
              <span style={{ fontWeight: 600 }}>{currencySymbol}{originalPrice.toFixed(2)}</span>
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
              {isEmbed && mode === 'cart' ? 'Bargain a discount on this item before checkout' : 'Want a better price? Bargain with us'}
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span
              style={{
                background: '#ffffff',
                color: '#4f46e5',
                fontWeight: 700,
                fontSize: 13,
                padding: '9px 16px',
                borderRadius: 999,
                border: '2px solid #4f46e5',
                boxShadow: '0 2px 10px rgba(79,70,229,0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={14} style={{ color: '#4f46e5' }} />
              {t('negotiate')}
            </span>
            {persona && PERSONA_CHIP[persona] && (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
                {PERSONA_CHIP[persona].emoji} {PERSONA_CHIP[persona].label} negotiator
              </span>
            )}
          </div>
        </button>
      ) : (
        /* Floating trigger button */
        <button
          onClick={openPanel}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#ffffff',
            color: '#4f46e5',
            padding: '14px 22px',
            borderRadius: 999,
            border: '2px solid #4f46e5',
            fontWeight: 700,
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(79,70,229,0.25), 0 1px 4px rgba(0,0,0,0.06)',
            transition: 'all 0.2s ease',
            zIndex: 99998,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#eef2ff'
            e.currentTarget.style.borderColor = '#4f46e5'
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(79,70,229,0.35), 0 2px 8px rgba(0,0,0,0.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff'
            e.currentTarget.style.borderColor = '#4f46e5'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.25), 0 1px 4px rgba(0,0,0,0.06)'
          }}
        >
          <Sparkles size={18} style={{ color: '#6366f1' }} />
          <span>{t('negotiate')}</span>
        </button>
      )}

      {/* Slide-out panel */}
      {open && (
        <div
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
            boxShadow: isEmbed ? 'none' : '-8px 0 40px rgba(0,0,0,0.15)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
              }}>
                <MessageCircle size={22} style={{ color: '#ffffff' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{t('dealTitle')}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  {productTitle ? productTitle : 'Product'} · {currencySymbol}{originalPrice.toFixed(2)}
                </div>
              </div>
            </div>
            <button
              onClick={closePanel}
              aria-label="Close"
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                color: '#64748b',
                cursor: 'pointer',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f1f5f9'
                e.currentTarget.style.color = '#334155'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f8fafc'
                e.currentTarget.style.color = '#64748b'
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Subtle AI opt-out link */}
          <div style={{
            padding: '10px 24px',
            fontSize: 12,
            color: '#94a3b8',
            background: '#fafbfc',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{t('aiPowered')}</span>
            <a
              href={linkout ? `${linkout}?ai_opt_out=1` : undefined}
              onClick={linkout ? undefined : (e) => { e.preventDefault(); void optOutOfAI() }}
              style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              {t('skip')}
            </a>
          </div>

          {/* Attempts + timer */}
          {(attemptsRemaining != null || timeLeft != null) && (
            <div style={{
              padding: '10px 24px',
              fontSize: 13,
              color: '#64748b',
              background: '#ffffff',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              {attemptsRemaining != null && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    background: attemptsRemaining <= 1 ? '#fef2f2' : '#f0fdf4',
                    color: attemptsRemaining <= 1 ? '#dc2626' : '#16a34a',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {t('attemptsLeft', { n: attemptsRemaining })}
                  </span>
                </span>
              )}
              {timeLeft != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
                  <Clock size={13} />
                  {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 20px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
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
                  maxWidth: '85%',
                }}
              >
                {/* Role label */}
                {m.role !== 'customer' && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: m.role === 'ai' ? '#6366f1' : '#94a3b8',
                    marginBottom: 4,
                    paddingLeft: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    {m.role === 'ai' ? t('assistant') : t('notice')}
                  </div>
                )}
                <div
                  style={{
                    background:
                      m.role === 'customer'
                        ? '#6366f1'
                        : m.role === 'system'
                        ? '#f8fafc'
                        : '#ffffff',
                    color: m.role === 'customer' ? '#ffffff' : '#334155',
                    padding: '12px 16px',
                    borderRadius: m.role === 'customer' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    border: m.role !== 'customer' ? '1px solid #e2e8f0' : 'none',
                    boxShadow: m.role !== 'customer' ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                  }}
                >
                  {m.content}
                  {m.offeredPrice != null && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      background: '#f0fdf4',
                      borderRadius: 8,
                      border: '1px solid #bbf7d0',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#15803d',
                    }}>
                      {t('offered')} {currencySymbol}{m.offeredPrice.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Accepted deal card */}
            {decision === 'accept' && finalPrice != null && (
              <div style={{
                background: '#ffffff',
                border: '2px solid #6366f1',
                padding: 20,
                borderRadius: 16,
                textAlign: 'center',
                margin: '8px 0',
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: '#f0fdf4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <CheckCircle2 size={28} style={{ color: '#16a34a' }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#0f172a', marginBottom: 4 }}>
                  {t('youSaved', { x: `${currencySymbol}${(originalPrice - finalPrice).toFixed(2)}` })}
                </div>
                <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                  {t('newPrice')} <span style={{ fontWeight: 700, color: '#0f172a' }}>{currencySymbol}{finalPrice.toFixed(2)}</span>
                </div>
                {discountCode && (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '12px 16px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                  }}>
                    <Tag size={16} style={{ color: '#6366f1' }} />
                    <code style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: 0.5 }}>{discountCode}</code>
                    <button
                      onClick={copyCode}
                      style={{
                        background: '#ffffff',
                        border: '2px solid #4f46e5',
                        color: '#4f46e5',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2ff' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff' }}
                    >
                      {t('copy')}
                    </button>
                  </div>
                )}
                {shopifyStatus === 'pending' && (
                  <div style={{ fontSize: 12, marginTop: 10, color: '#94a3b8' }}>
                    {t('codeApply')}
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
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
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #f1f5f9',
            background: '#ffffff',
            display: 'flex',
            gap: 10,
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
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#0f172a',
                fontSize: 15,
                outline: 'none',
                transition: 'border-color 0.15s ease',
                opacity: sessionEnded ? 0.5 : 1,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !sessionEnded) void sendMessage()
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || sessionEnded}
              aria-label="Send"
              style={{
                background: '#ffffff',
                color: '#4f46e5',
                border: '2px solid #4f46e5',
                borderRadius: 12,
                padding: '0 20px',
                cursor: 'pointer',
                minWidth: 52,
                minHeight: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 15,
                fontWeight: 700,
                opacity: (loading || !input.trim() || sessionEnded) ? 0.5 : 1,
                boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.color = '#ffffff' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#4f46e5' }}
            >
              {loading ? <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
            </button>
          </div>

          {/* Accept bar */}
          {decision === 'accept' && (
            <div style={{ padding: '12px 20px 16px', background: '#ffffff', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={acceptDeal}
                disabled={loading || !!discountCode}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: discountCode ? '#16a34a' : '#ffffff',
                  color: discountCode ? '#ffffff' : '#16a34a',
                  border: discountCode ? 'none' : '2px solid #16a34a',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 15,
                  opacity: (loading || !!discountCode) ? 0.8 : 1,
                  boxShadow: '0 2px 10px rgba(22,163,74,0.3)',
                  transition: 'all 0.2s ease',
                }}
              >
                {discountCode ? t('dealComplete') : t('acceptDeal')}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .spin { animation: spin 1s linear infinite }
      `}</style>
    </div>
  )
}
