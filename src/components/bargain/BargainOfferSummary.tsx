'use client'

import { CheckCircle2, Tag } from 'lucide-react'
import type { BargainDecision } from '@/lib/bargain/api-types'

type Props = {
  originalPrice: number
  finalPrice: number | null
  lastCounter?: number | null
  currencySymbol: string
  decision: BargainDecision
  discountCode?: string | null
  productTitle?: string | null
  sessionEnded?: boolean
}

export default function BargainOfferSummary({
  originalPrice,
  finalPrice,
  lastCounter,
  currencySymbol,
  decision,
  discountCode,
  productTitle,
  sessionEnded,
}: Props) {
  const agreed = decision === 'accept' && finalPrice != null
  const shownPrice = agreed ? finalPrice : lastCounter
  const money = (value: number) => `${currencySymbol}${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div style={{
      width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', gap: 9,
      padding: '9px 11px', borderRadius: 12, flexShrink: 0,
      background: agreed ? 'linear-gradient(135deg,#f0fdf4,#ecfdf5)' : '#f8faff',
      border: `1px solid ${agreed ? '#bbf7d0' : '#e0e7ff'}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: agreed ? '#dcfce7' : '#eef2ff', color: agreed ? '#15803d' : '#4f46e5',
      }}>
        {agreed ? <CheckCircle2 size={16} /> : <Tag size={16} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: agreed ? '#15803d' : '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {agreed ? 'Deal agreed' : sessionEnded ? 'Deal closed' : 'Deal at a glance'}
        </div>
        <div title={productTitle ?? undefined} style={{
          fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {productTitle || 'Your negotiation'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
        {shownPrice != null && shownPrice < originalPrice && (
          <span style={{ fontSize: 11.5, color: '#94a3b8', textDecoration: 'line-through' }}>{money(originalPrice)}</span>
        )}
        <span style={{
          fontSize: 16, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
          color: agreed ? '#15803d' : shownPrice != null ? '#4f46e5' : '#0f172a',
        }}>
          {shownPrice != null ? money(shownPrice) : money(originalPrice)}
        </span>
        {discountCode && (
          <code style={{
            fontSize: 10.5, fontWeight: 800, color: '#4f46e5', background: '#eef2ff',
            border: '1px solid #e0e7ff', borderRadius: 999, padding: '2px 7px',
          }}>
            {discountCode}
          </code>
        )}
      </div>
    </div>
  )
}
