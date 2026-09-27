'use client'

// Presentational primitives for the Bargain chat. These components only render
// server-approved state — they never fetch, never negotiate, and never accept.
// Money displayed here is supplied by the parent controller (already server-
// clamped); the merchant floor never reaches these components.

import type { ReactNode } from 'react'
import { Tag, Zap, ShieldCheck, Loader2 } from 'lucide-react'
import type { UiKey } from '@/lib/bargain/i18n'
import type { BargainDecision, BargainMessage, BargainRecommendation } from '@/lib/bargain/api-types'

export type UiText = (key: UiKey, vars?: Record<string, string | number>) => string

// ── Product thumb ─────────────────────────────────────────────────────────
export function ProductThumb({ image, title, size }: { image?: string | null; title?: string | null; size: number }) {
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

// ── Product context card ──────────────────────────────────────────────────
// Only facts the storefront already shows (image, name, listed price).
// Never internal merchant data.
export function ProductContextCard({ image, title, currencySymbol, price, mode }: {
  image?: string | null
  title?: string | null
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

// ── Message bubble ────────────────────────────────────────────────────────
// Offers within a message are visually emphasized (YOU OFFERED / COUNTER
// OFFER / FINAL OFFER) so the negotiation scans at a glance.
export function MessageBubble({ m, t, currencySymbol, personaChip, isFinal }: {
  m: BargainMessage
  t: UiText
  currencySymbol: string
  personaChip?: { label: string; emoji: string }
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
        maxWidth: isCustomer ? '86%' : '84%',
        animation: 'cgMsgIn 0.18s ease-out',
      }}
    >
      {!isCustomer && (
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#334155',
          marginBottom: 3,
          paddingLeft: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            background: m.role === 'ai' ? 'linear-gradient(135deg,#818cf8,#4f46e5)' : '#e2e8f0',
            color: m.role === 'ai' ? '#ffffff' : '#475569',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 10, lineHeight: 1 }}>
              {m.role === 'ai' ? (personaChip ? personaChip.emoji : '🤝') : 'ℹ'}
            </span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
            {m.role === 'ai'
              ? (personaChip ? personaChip.label : t('assistant'))
              : t('notice')}
          </span>
        </div>
      )}
      <div
        style={{
          background:
            isCustomer
              ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
              : m.role === 'system'
              ? '#f8fafc'
              : '#ffffff',
          color: isCustomer ? '#ffffff' : m.role === 'system' ? '#334155' : '#334155',
          padding: '11px 14px',
          borderRadius: isCustomer ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          fontSize: 14.5,
          lineHeight: 1.55,
          border: m.role !== 'customer' ? '1px solid #e3e8f0' : 'none',
          boxShadow: m.role !== 'customer' ? '0 1px 4px rgba(15,23,42,0.07)' : '0 2px 10px rgba(79,70,229,0.22)',
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

// ── Typing indicator ──────────────────────────────────────────────────────
export function TypingIndicator({ personaChip, t }: {
  personaChip?: { label: string; emoji: string }
  t: UiText
}) {
  return (
    <div style={{ alignSelf: 'flex-start', animation: 'cgMsgIn 0.18s ease-out' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 3, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#818cf8,#4f46e5)', color: '#ffffff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 10, lineHeight: 1 }}>{personaChip ? personaChip.emoji : '🤝'}</span>
        </span>
        {personaChip ? personaChip.label : t('assistant')}
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
  )
}

// ── Calm state / notice card ──────────────────────────────────────────────
// Copy never leaks merchant internals.
export function StateCard({ icon, tone, title, body, children }: {
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

// ── Deal details tab ──────────────────────────────────────────────────────
// Mirrors the merchant's own pricing levers without ever revealing the floor.
export function DealInfoPanel({ t, currencySymbol, originalPrice, finalPrice, decision, discountCode, productTitle, sessEnded }: {
  t: UiText
  currencySymbol: string
  originalPrice: number
  finalPrice: number | null
  decision: BargainDecision
  discountCode: string | null
  productTitle?: string | null
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
          value: <span style={{ fontWeight: 700, color: '#4f46e5' }}>{'name a price that feels fair and I\u2019ll consider it'}</span>,
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

// ── Round meter ───────────────────────────────────────────────────────────
// Shows how many negotiation rounds the shopper has spent of the store's budget.
// SAFETY: `maxAttempts` is a COUNT the merchant publishes (the assistant already
// tells the shopper how many offers they have left in its replies), never a price
// or a margin. The rail renders nothing when the budget is unknown.
export function RoundMeter({ used, max, t }: { used: number; max?: number | null; t: UiText }) {
  if (!max || max < 1) return null
  const total = Math.max(1, Math.floor(max))
  const spent = Math.min(total, Math.max(0, Math.floor(used)))
  const left = Math.max(0, total - spent)
  const last = left === 1 || left === 0
  return (
    <div
      className="cg-rounds"
      role="group"
      aria-label={t('roundOf', { n: spent + 1, m: total })}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
    >
      <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 14,
              height: 5,
              borderRadius: 999,
              background: i < spent ? '#c7d2fe' : 'linear-gradient(90deg, #6366f1, #4f46e5)',
              boxShadow: i < spent ? 'none' : '0 1px 3px rgba(79,70,229,0.35)',
            }}
          />
        ))}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: last ? '#b45309' : '#64748b',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {last ? t('lastRound') : t('roundOf', { n: spent + 1, m: total })}
      </span>
    </div>
  )
}

// ── Price rail ────────────────────────────────────────────────────────────
// Where the negotiation stands, in one glance: the listed price, the best price
// the shopkeeper has actually put on the table, and the best number the shopper
// has named. Every value is either the public listed price or a number the
// SERVER sent back in a message — nothing here is derived from the floor, and
// the component renders nothing at all until there is a second data point.
export function PriceRail({
  currencySymbol,
  listedPrice,
  bestCounter,
  bestCustomerOffer,
  t,
}: {
  currencySymbol: string
  listedPrice: number
  bestCounter: number | null
  bestCustomerOffer: number | null
  t: UiText
}) {
  const fmt = (n: number) => `${currencySymbol}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  // Only numbers that came from the server (AI counter) or from the shopper
  // themselves. The listed price is public storefront data.
  const best = [bestCounter, bestCustomerOffer]
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    .reduce((min, v) => Math.min(min, v), Number.POSITIVE_INFINITY)

  if (!Number.isFinite(best) || listedPrice <= 0 || best >= listedPrice) {
    // Nothing has moved yet — the rail would be a duplicate of the header pill.
    return null
  }

  const offPct = Math.max(0, Math.min(99, Math.round((1 - best / listedPrice) * 100)))
  const widthPct = Math.max(6, Math.min(100, offPct))

  return (
    <div
      className="cg-rail"
      style={{
        flexShrink: 0,
        padding: '9px 16px 10px',
        background: '#ffffff',
        borderBottom: '1px solid #eef2f7',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }}>
          {t('priceProgress')}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#15803d', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          −{offPct}%
        </span>
      </div>
      <div
        role="img"
        aria-label={t('railLabel', { from: fmt(listedPrice), to: fmt(best) })}
        style={{ position: 'relative', height: 8, borderRadius: 999, background: '#eef2f7', overflow: 'hidden' }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${widthPct}%`,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #a5b4fc, #6366f1 60%, #4f46e5)',
            boxShadow: '0 1px 4px rgba(79,70,229,0.35)',
            transition: 'width 0.35s ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: '#94a3b8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(listedPrice)}
        </span>
        {bestCounter != null && bestCustomerOffer != null && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#4f46e5', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {t('bestSoFar')}{' '}{fmt(Math.min(bestCounter, bestCustomerOffer))}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Boot / connecting skeleton ────────────────────────────────────────────
// Shown for the moment between "drawer opened" and "the assistant replied".
// A bare spinner reads as a hang; a chat-shaped placeholder reads as loading.
export function ChatSkeleton({ t }: { t: UiText }) {
  return (
    <div className="cg-skeleton" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 2px' }}>
      <div
        className="cg-skel-row"
        style={{
          alignSelf: 'flex-start',
          maxWidth: '84%',
          background: '#ffffff',
          border: '1px solid #e9e4f9',
          borderRadius: '16px 16px 16px 4px',
          padding: '12px 16px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
        }}
      >
        <div className="cg-skel-bar" style={{ width: '78%' }} />
        <div className="cg-skel-bar" style={{ width: '54%', marginTop: 8 }} />
      </div>
      <div
        className="cg-skel-row"
        style={{
          alignSelf: 'flex-start',
          maxWidth: '70%',
          background: '#ffffff',
          border: '1px solid #e9e4f9',
          borderRadius: '16px 16px 16px 4px',
          padding: '12px 16px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
        }}
      >
        <div className="cg-skel-bar" style={{ width: '62%' }} />
      </div>
      <div style={{ fontSize: 12.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
        <Loader2 size={14} className="spin" style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
        {t('connecting')}
      </div>
    </div>
  )
}

// ── Quick-chip / offer suggestions ────────────────────────────────────────
export function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      style={{
        background: '#eef2ff',
        border: '1px solid #c7d2fe',
        color: '#4338ca',
        borderRadius: 999,
        padding: '9px 16px',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        outline: 'none',
        minHeight: 42,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#ffffff' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.color = '#4338ca' }}
    >
      {label}
    </button>
  )
}

// ── Recommendation badges + cards ─────────────────────────────────────────
export function RecoBadge({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
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

export function RecoCard({
  card,
  currencySymbol: sym,
  t,
  onView,
  onAdd,
}: {
  card: BargainRecommendation
  currencySymbol: string
  t: UiText
  onView: (card: BargainRecommendation) => void
  onAdd: (card: BargainRecommendation) => void
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