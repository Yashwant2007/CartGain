'use client'

import { CheckCircle2, Tag } from 'lucide-react'
import type { BargainDecision } from '@/lib/bargain/api-types'
import { uiText, type UiKey } from '@/lib/bargain/i18n'

type Props = {
  originalPrice: number
  finalPrice: number | null
  lastCounter?: number | null
  customerOffer?: number | null
  round?: { used: number; max: number } | null
  currencySymbol: string
  decision: BargainDecision
  discountCode?: string | null
  productTitle?: string | null
  sessionEnded?: boolean
  t?: (key: UiKey, vars?: Record<string, string | number>) => string
}

export default function BargainOfferSummary({
  originalPrice,
  finalPrice,
  lastCounter,
  customerOffer,
  round,
  currencySymbol,
  decision,
  discountCode,
  productTitle,
  sessionEnded,
  t = (key, vars) => uiText('en', key, vars),
}: Props) {
  const agreed = decision === 'accept' && finalPrice != null
  const valid = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  const listed = valid(originalPrice)
  const counter = valid(lastCounter)
  const customer = valid(customerOffer)
  const final = valid(finalPrice)
  const standing = agreed ? final : counter
  const money = (value: number) => `${currencySymbol}${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const savings = listed != null && standing != null && standing < listed ? listed - standing : null
  const savingsPercent = savings != null && listed != null ? Math.round((savings / listed) * 100) : null
  const roundLabel = round && round.max > 0
    ? round.used >= round.max ? t('lastRound') : t('roundOf', { n: Math.max(1, round.used), m: round.max })
    : null

  return (
    <div style={{
      width: '100%', minWidth: 0, flexShrink: 0,
      padding: '10px 12px', borderRadius: 16,
      background: agreed
        ? 'linear-gradient(145deg, #f0fdf4 0%, #ffffff 62%, #eef2ff 100%)'
        : 'linear-gradient(145deg, #f8faff 0%, #ffffff 68%, #f5f3ff 100%)',
      border: `1px solid ${agreed ? '#bbf7d0' : '#e0e7ff'}`,
      boxShadow: '0 8px 24px rgba(79,70,229,0.08)',
      animation: 'cgMsgIn 0.22s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: agreed ? '#dcfce7' : '#eef2ff', color: agreed ? '#15803d' : '#4f46e5',
        }}>
          {agreed ? <CheckCircle2 size={15} /> : <Tag size={15} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: agreed ? '#15803d' : '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {t(agreed ? 'dealAgreed' : sessionEnded ? 'dealClosed' : 'dealAtGlance')}
          </div>
          <div title={productTitle ?? undefined} style={{
            fontSize: 12.5, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {productTitle || t('yourNegotiation')}
          </div>
        </div>
        {roundLabel && (
          <span style={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#4f46e5',
            background: '#eef2ff', border: '1px solid #e0e7ff', borderRadius: 999, padding: '5px 9px',
          }}>
            {roundLabel}
          </span>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
        gap: 6, marginTop: 9,
      }}>
        {listed != null && (
          <div style={{ padding: '7px 8px', borderRadius: 12, background: '#ffffff', border: '1px solid #eef2f7' }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700 }}>{t('listed')}</div>
            <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(listed)}</div>
          </div>
        )}
        {customer != null && (
          <div style={{ padding: '7px 8px', borderRadius: 12, background: '#ffffff', border: '1px solid #eef2f7' }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700 }}>{t('youOffered')}</div>
            <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(customer)}</div>
          </div>
        )}
        <div style={{
          padding: '7px 8px', borderRadius: 12,
          background: standing != null ? (agreed ? '#f0fdf4' : '#eef2ff') : '#f8fafc',
          border: `1px solid ${standing != null ? (agreed ? '#bbf7d0' : '#e0e7ff') : '#eef2f7'}`,
        }}>
          <div style={{ fontSize: 10.5, color: agreed ? '#15803d' : '#6366f1', fontWeight: 800 }}>
            {agreed ? t('yourFinalPrice') : t('counterOffer')}
          </div>
          {standing != null ? (
            <div style={{ fontSize: 14, color: agreed ? '#15803d' : '#4f46e5', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {money(standing)}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, lineHeight: 1.35, marginTop: 2 }}>
              {t('nameYourPriceHint')}
            </div>
          )}
        </div>
        {savings != null && savingsPercent != null && savingsPercent > 0 && (
          <div style={{ padding: '7px 8px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 10.5, color: '#15803d', fontWeight: 800 }}>{t('bestSoFar')}</div>
            <div style={{ fontSize: 12.5, color: '#15803d', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {money(savings)} · {savingsPercent}%
            </div>
          </div>
        )}
      </div>

      {discountCode && (
        <code style={{
          display: 'inline-block', marginTop: 11, fontSize: 11, fontWeight: 800, color: '#4f46e5',
          background: '#eef2ff', border: '1px solid #e0e7ff', borderRadius: 999, padding: '4px 10px',
        }}>
          {discountCode}
        </code>
      )}
    </div>
  )
}
