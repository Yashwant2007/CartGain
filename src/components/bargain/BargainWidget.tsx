'use client'

import { useEffect, useRef, useState } from 'react'
import {
  X, Send, MessageCircle, Sparkles, Loader2, CheckCircle2, Clock, Tag,
} from 'lucide-react'

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
  apiBase?: string // e.g. https://cart-gain.com — defaults to current origin
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
  apiBase = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [offer, setOffer] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState<'idle' | 'counter' | 'accept' | 'reject'>('idle')
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [discountCode, setDiscountCode] = useState<string | null>(null)
  const [shopifyStatus, setShopifyStatus] = useState<'created' | 'pending' | 'failed' | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const currencySymbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' '

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now()
      setTimeLeft(Math.max(0, Math.floor(ms / 1000)))
    }, 1000)
    return () => clearInterval(t)
  }, [expiresAt])

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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Could not start bargaining')
      setSessionId(data.sessionId)
      setAttemptsRemaining(data.attemptsRemaining ?? null)
      setExpiresAt(data.expiresAt ?? null)
      const aiMsg: Message = {
        id: 'opening',
        role: 'ai',
        content: data.openingMessage ?? 'Welcome! What price were you thinking?',
        createdAt: new Date().toISOString(),
      }
      setMessages([aiMsg])
    } catch (err: any) {
      setError(err.message ?? 'Failed to start')
    } finally {
      setLoading(false)
    }
  }

  async function submitOffer(value?: number) {
    if (!sessionId) return
    const offerValue = value ?? parseFloat(offer)
    if (!offerValue || offerValue <= 0) {
      setError('Enter a valid offer')
      return
    }
    if (offerValue > originalPrice) {
      setError(`Offer must be under ${currencySymbol}${originalPrice.toFixed(2)} (the list price)`)
      return
    }
    setLoading(true)
    setError(null)
    setMessages(prev => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        role: 'customer',
        content: `I'll offer ${currencySymbol}${offerValue.toFixed(2)}`,
        offeredPrice: offerValue,
        createdAt: new Date().toISOString(),
      },
    ])
    setOffer('')
    try {
      const res = await fetch(`${apiBase}/api/bargain/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, offer: offerValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Bargain failed')
      setMessages(prev => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'ai',
          content: data.reply,
          offeredPrice: data.counterOffer ?? null,
          createdAt: new Date().toISOString(),
        },
      ])
      setAttemptsRemaining(data.attemptsRemaining ?? null)
      setDecision(data.decision ?? 'counter')
      if (data.finalPrice != null) setFinalPrice(data.finalPrice)
      if (data.sessionStatus === 'accepted' || data.decision === 'accept') {
        // Accept route will be called from customer "Confirm" action
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to send offer')
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
    <div className="bargain-widget-root" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Trigger button */}
      <button
        onClick={openPanel}
        style={{
          background: 'linear-gradient(135deg, #2563eb, #1e40af)',
          color: 'white',
          padding: '10px 18px',
          borderRadius: 999,
          border: 'none',
          fontWeight: 600,
          fontSize: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(37,99,235,0.35)',
        }}
      >
        <Sparkles size={16} />
        Bargain for a better price
      </button>

      {/* Slide-out panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 0, right: 0, top: 0,
            width: '100%',
            maxWidth: 400,
            background: '#0b1220',
            color: '#e6eefc',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.45)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid rgba(59,130,246,0.3)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(59,130,246,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(30,41,99,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #3b82f6, #1e3a8a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageCircle size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Bargain with us</div>
                <div style={{ fontSize: 11, color: '#9fb6e0' }}>
                  {productTitle ? productTitle : 'Product'} · {currencySymbol}{originalPrice.toFixed(2)}
                </div>
              </div>
            </div>
            <button onClick={closePanel} style={{ background: 'transparent', border: 'none', color: '#9fb6e0', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>

          {/* Attempt + timer bar */}
          {(attemptsRemaining != null || timeLeft != null) && (
            <div style={{
              padding: '8px 16px',
              fontSize: 11,
              color: '#9fb6e0',
              background: 'rgba(15,23,42,0.6)',
              borderBottom: '1px solid rgba(59,130,246,0.15)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              {attemptsRemaining != null && (
                <span>Attempts left: <strong style={{ color: '#dbeafe' }}>{attemptsRemaining}</strong></span>
              )}
              {timeLeft != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} /> {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </span>
              )}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#9fb6e0', fontSize: 13 }}>
                <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Starting…
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
                <div
                  style={{
                    background:
                      m.role === 'customer'
                        ? '#2563eb'
                        : m.role === 'system'
                        ? '#334155'
                        : '#1e293b',
                    color: m.role === 'system' ? '#cbd5e1' : '#fff',
                    padding: '10px 12px',
                    borderRadius: 12,
                    fontSize: 13,
                    lineHeight: 1.45,
                    border: m.role === 'ai' ? '1px solid rgba(59,130,246,0.25)' : 'none',
                  }}
                >
                  {m.content}
                  {m.offeredPrice != null && (
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                      Counter: {currencySymbol}{m.offeredPrice.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Accepted deal banner */}
            {decision === 'accept' && finalPrice != null && (
              <div style={{
                background: 'linear-gradient(135deg, #065f46, #047857)',
                color: '#ecfdf5',
                padding: 14,
                borderRadius: 12,
                textAlign: 'center',
              }}>
                <CheckCircle2 size={28} style={{ margin: '0 auto 6px' }} />
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  You got it for {currencySymbol}{finalPrice.toFixed(2)}!
                </div>
                {discountCode && (
                  <div style={{
                    marginTop: 10,
                    background: '#022c22', padding: '8px 10px',
                    borderRadius: 8, fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Tag size={14} />
                    <code style={{ fontWeight: 700, letterSpacing: 0.5 }}>{discountCode}</code>
                    <button
                      onClick={copyCode}
                      style={{
                        background: 'transparent', border: '1px solid #10b981',
                        color: '#a7f3d0', borderRadius: 6, padding: '2px 8px',
                        fontSize: 11, cursor: 'pointer', marginLeft: 4,
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
                {shopifyStatus === 'pending' && (
                  <div style={{ fontSize: 11, marginTop: 6, color: '#a7f3d0' }}>
                    Code will be applied automatically at checkout when available.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {/* Composer */}
          <div style={{
            padding: 12,
            borderTop: '1px solid rgba(59,130,246,0.25)',
            background: 'rgba(15,23,42,0.6)',
            display: 'flex', gap: 8,
          }}>
            <input
              type="number"
              placeholder={`${currencySymbol} your offer`}
              value={offer}
              onChange={e => setOffer(e.target.value)}
              disabled={loading || decision === 'accept'}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8,
                border: '1px solid rgba(59,130,246,0.4)',
                background: '#020617', color: '#fff', fontSize: 14,
                outline: 'none',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') void submitOffer()
              }}
            />
            <button
              onClick={() => submitOffer()}
              disabled={loading || !offer || decision === 'accept'}
              style={{
                background: '#2563eb', color: 'white',
                border: 'none', borderRadius: 8,
                padding: '0 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 14, fontWeight: 600,
                opacity: (loading || !offer || decision === 'accept') ? 0.5 : 1,
              }}
            >
              {loading ? <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
            </button>
          </div>

          {/* Accept bar */}
          {decision === 'accept' && (
            <div style={{ padding: '8px 12px 14px', background: 'rgba(6,78,59,0.2)' }}>
              <button
                onClick={acceptDeal}
                disabled={loading || !!discountCode}
                style={{
                  width: '100%', padding: '12px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white', border: 'none', borderRadius: 10,
                  cursor: 'pointer', fontWeight: 700, fontSize: 15,
                  opacity: (loading || !!discountCode) ? 0.7 : 1,
                }}
              >
                {discountCode ? '✓ Deal Complete' : `Accept & Get Code`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tiny keyframe for spinner */}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  )
}
