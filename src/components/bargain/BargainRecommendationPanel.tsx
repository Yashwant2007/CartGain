'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, ShoppingCart, Sparkles, X } from 'lucide-react'
import { currencySymbolFor } from '@/lib/bargain/i18n'
import { normalizeProductId, type RecommendationHistory } from '@/lib/bargain/recommendations'
import type { BargainRecommendation } from '@/lib/bargain/api-types'
import { ProductThumb } from '@/components/bargain/BargainPrimitives'

export type RecommendationEventAction = 'viewed' | 'clicked' | 'added' | 'dismissed' | 'rejected'

type Props = {
  recommendations?: BargainRecommendation[] | null
  reason?: string | null
  history?: RecommendationHistory | null
  onEvent?: (action: RecommendationEventAction, card: BargainRecommendation) => void
}

function cardKey(card: BargainRecommendation): string {
  return normalizeProductId(card.productId) || card.productId
}

function RecommendationRow({
  card,
  onEvent,
  onHide,
  onView,
}: {
  card: BargainRecommendation
  onEvent?: (action: RecommendationEventAction, card: BargainRecommendation) => void
  onHide: (action: 'dismissed' | 'rejected', card: BargainRecommendation) => void
  onView: (card: BargainRecommendation) => void
}) {
  const symbol = currencySymbolFor(card.currency)
  return (
    <div style={{
      display: 'flex', gap: 8, padding: 8, minWidth: 0,
      background: '#fafbff', border: '1px solid #e2e8f0', borderRadius: 11,
    }}>
      <ProductThumb image={card.imageUrl} title={card.title} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div title={card.title} style={{
          fontSize: 12.5, fontWeight: 700, color: '#1e293b', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {card.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
            {symbol}{card.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          {card.compareAtPrice != null && card.compareAtPrice > card.price && (
            <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>
              {symbol}{card.compareAtPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
          )}
          {card.budgetFit === 'over' && (
            <span style={{ fontSize: 10, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '1px 7px' }}>
              Over budget
            </span>
          )}
          {!card.available && (
            <span style={{ fontSize: 10, color: '#be123c', background: '#fff1f2', borderRadius: 999, padding: '1px 7px' }}>
              Unavailable
            </span>
          )}
        </div>
        {card.reason && (
          <div title={card.reason} style={{
            fontSize: 11, color: '#6d28d9', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <Sparkles size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            {card.reason}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <a
            href={card.productUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (card.productUrl) {
                e.preventDefault()
                window.open(card.productUrl, '_blank', 'noopener')
              }
              onView(card)
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#ffffff', border: '1px solid #c7d2fe', color: '#4338ca',
              borderRadius: 8, padding: '5px 9px', fontSize: 11.5, fontWeight: 700,
              textDecoration: 'none', minHeight: 30,
            }}
          >
            View <ExternalLink size={11} />
          </a>
          <button
            type="button"
            disabled={!card.available}
            onClick={() => onEvent?.('added', card)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#4f46e5', border: 'none', color: '#ffffff',
              borderRadius: 8, padding: '5px 9px', fontSize: 11.5, fontWeight: 700,
              cursor: card.available ? 'pointer' : 'default', opacity: card.available ? 1 : 0.5, minHeight: 30,
            }}
          >
            <ShoppingCart size={11} /> Add
          </button>
          <button
            type="button"
            onClick={() => onHide('rejected', card)}
            style={{
              background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b',
              borderRadius: 8, padding: '5px 9px', fontSize: 11.5, fontWeight: 600, minHeight: 30,
            }}
          >
            Not for me
          </button>
          <button
            type="button"
            aria-label={`Dismiss ${card.title}`}
            onClick={() => onHide('dismissed', card)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: '#ffffff', border: '1px solid #e2e8f0', color: '#94a3b8',
              borderRadius: 8, width: 30, minHeight: 30,
            }}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BargainRecommendationPanel({
  recommendations,
  reason,
  history,
  onEvent,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const viewedRef = useRef<Set<string>>(new Set())
  const clickedRef = useRef<Set<string>>(new Set())

  const excluded = useMemo(() => new Set([
    ...(history?.dismissedProductIds ?? []),
    ...(history?.rejectedProductIds ?? []),
  ].map((id) => normalizeProductId(id)).filter(Boolean)), [history])

  const signature = useMemo(
    () => (recommendations ?? []).map(cardKey).join('|'),
    [recommendations],
  )

  const visible = useMemo(() => {
    const seen = new Set<string>()
    const cards: BargainRecommendation[] = []
    for (const card of recommendations ?? []) {
      const key = cardKey(card)
      if (!key || seen.has(key) || excluded.has(key) || hidden.has(key)) continue
      seen.add(key)
      cards.push(card)
      if (cards.length === 2) break
    }
    return cards
  }, [excluded, hidden, recommendations])

  useEffect(() => {
    setExpanded(false)
    setHidden(new Set())
    viewedRef.current = new Set()
    clickedRef.current = new Set()
  }, [signature])

  const markViewed = () => {
    for (const card of visible) {
      const key = cardKey(card)
      if (viewedRef.current.has(key)) continue
      viewedRef.current.add(key)
      onEvent?.('viewed', card)
    }
  }

  const markClicked = (card: BargainRecommendation) => {
    const key = cardKey(card)
    if (clickedRef.current.has(key)) return
    clickedRef.current.add(key)
    onEvent?.('clicked', card)
  }

  const hide = (action: 'dismissed' | 'rejected', card: BargainRecommendation) => {
    setHidden((prev) => new Set(prev).add(cardKey(card)))
    onEvent?.(action, card)
  }

  if (visible.length === 0) return null

  return (
    <div style={{
      flexShrink: 0, width: '100%', minWidth: 0, overflow: 'hidden',
      background: '#ffffff', borderTop: '1px solid #eef2f7',
    }} data-cg-recommendation-panel>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${visible.length} better matches found`}
        onClick={() => {
          if (!expanded) markViewed()
          setExpanded((value) => !value)
        }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 13px', background: '#fafbff', border: 'none',
          color: '#4338ca', cursor: 'pointer', textAlign: 'left', minWidth: 0,
        }}
      >
        <ChevronDown size={14} style={{
          flexShrink: 0, transform: expanded ? 'rotate(180deg)' : undefined,
          transition: 'transform 0.15s ease',
        }} />
        <Sparkles size={13} style={{ color: '#8b5cf6', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 12, fontWeight: 700,
        }}>
          {visible.length} better matches found
        </span>
      </button>
      {expanded && (
        <div style={{
          maxHeight: 180, overflowY: 'auto', overscrollBehavior: 'contain',
          display: 'flex', flexDirection: 'column', gap: 7,
          padding: '8px 10px 10px', minWidth: 0,
        }}>
          {visible.map((card) => (
            <RecommendationRow
              key={cardKey(card)}
              card={card}
              onEvent={onEvent}
              onHide={hide}
              onView={markClicked}
            />
          ))}
          {reason && (
            <div style={{ fontSize: 10.5, color: '#94a3b8', padding: '0 2px' }} title={reason}>
              {reason}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
