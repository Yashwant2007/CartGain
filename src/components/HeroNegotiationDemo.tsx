'use client'

import { useRef, useState } from 'react'
import { BadgeCheck, Send, ShieldCheck, Sparkles, Store } from 'lucide-react'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import {
  resolveShopkeeperAnimation,
  type FireAvatarContext,
  type ShopkeeperAnimation,
} from '@/lib/bargain/experience/living'
import type { LivingEvent } from '@/lib/bargain/experience/avatar-state'
import type { ShopkeeperPersonality } from '@/lib/bargain/experience/types'
import type { V2AvatarVariant } from '@/lib/bargain/experience/v2-shopkeepers'
import { V2_AVATARS } from '@/lib/bargain/experience/v2-shopkeepers'
import {
  V2_REACTIONS,
  v2ReactionCell,
  v2ReactionSheet,
  type BargainReaction,
} from '@/lib/bargain/experience/reactions'

type ChatMsg = {
  id: number
  role: 'customer' | 'ai'
  text: string
  offeredPrice?: number | null
  code?: string
}

type DemoReply = {
  reply: string
  decision: 'accept' | 'counter' | 'reject' | 'welcome' | 'chat'
  counterOffer: number | null
  offer: number | null
  offerDetected: boolean
  attemptsUsed: number
  conversationState: string
}

const PRODUCT = {
  id: 'home-demo-serum',
  title: 'Vitamin C Brightening Serum',
  image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=96&h=96&fit=crop',
  basePrice: 1499,
  merchantPrice: 1299,
  floorPrice: 1100,
  currency: '₹',
}

const QUICK_PROMPTS = [
  'What makes this serum special?',
  '₹999 please',
  "I'll take it",
]

const AVATAR_PROFILES: Record<V2AvatarVariant, { name: string; role: string; personality: ShopkeeperPersonality }> = {
  morgan: { name: 'Morgan', role: 'Friendly Shopkeeper', personality: 'friendly_shopkeeper' },
  riley: { name: 'Riley', role: 'Playful Shopkeeper', personality: 'playful_shopkeeper' },
  alex: { name: 'Alex', role: 'Strict Shopkeeper', personality: 'strict_shopkeeper' },
}

const AVATAR_VARIANTS: V2AvatarVariant[] = ['morgan', 'riley', 'alex']

const greetingFor = (variant: V2AvatarVariant) =>
  `Hi! I'm ${AVATAR_PROFILES[variant].name}, the shopkeeper. Ask me about the serum or name a fair price — I'll do my best.`

const HERO_STAGE_CSS = `
.cg-hero-avatar .cg-stage-avatar { width: 104px; height: 116px; }
.cg-hero-avatar .cg-stage-avatar > * { transform: scale(.56) !important; transform-origin: 50% 100% !important; }
@media (max-width: 640px) { .cg-hero-avatar .cg-stage-avatar > * { transform: scale(.5) !important; } }
`

const money = (value: number) => `${PRODUCT.currency}${value.toLocaleString('en-IN')}`

export default function HeroNegotiationDemo() {
  const [avatarVariant, setAvatarVariant] = useState<V2AvatarVariant>('morgan')
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 0, role: 'ai', text: greetingFor('morgan') },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewReaction, setPreviewReaction] = useState<BargainReaction | null>(null)
  const [character, setCharacter] = useState<ShopkeeperAnimation>(() =>
    resolveShopkeeperAnimation('friendly_shopkeeper', 'idle'),
  )
  const chatRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)

  const profile = AVATAR_PROFILES[avatarVariant]
  const displayedReaction = previewReaction ?? character.reaction ?? null

  const fireAvatar = (event: LivingEvent, ctx: FireAvatarContext = {}) => {
    setPreviewReaction(null)
    setCharacter(resolveShopkeeperAnimation(profile.personality, event, ctx))
  }

  const chooseAvatar = (variant: V2AvatarVariant) => {
    setAvatarVariant(variant)
    setPreviewReaction(null)
    setCharacter(resolveShopkeeperAnimation(AVATAR_PROFILES[variant].personality, 'greeting', { opening: true }))
    setMessages((prev) => prev.map((message, index) => (
      index === 0 ? { ...message, text: greetingFor(variant) } : message
    )))
  }

  const scrollToLatest = () => {
    window.setTimeout(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    }, 30)
  }

  const pushMessage = (message: ChatMsg) => {
    setMessages((prev) => [...prev, message])
    scrollToLatest()
  }

  const send = async (rawText?: string) => {
    const text = (rawText ?? input).trim()
    if (!text || loading || settled) return
    setInput('')
    setError(null)
    setLoading(true)
    fireAvatar('customer_message', { customerMessage: text, originalPrice: PRODUCT.merchantPrice })
    pushMessage({ id: nextId.current++, role: 'customer', text })

    try {
      const res = await fetch('/api/bargain/home-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          attemptsUsed,
          history: messages.map((m) => ({
            role: m.role,
            content: m.text,
            offeredPrice: m.offeredPrice ?? undefined,
          })),
        }),
      })
      const data = await res.json() as DemoReply & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Demo unavailable')

      fireAvatar('ai_thinking', { customerMessage: text, originalPrice: PRODUCT.merchantPrice })
      await new Promise((resolve) => window.setTimeout(resolve, 260))

      fireAvatar(data.decision === 'counter' ? 'counter_offer' : 'ai_reply', {
        customerMessage: text,
        aiReply: data.reply,
        counterOffer: data.counterOffer,
        originalPrice: PRODUCT.merchantPrice,
        decision: data.decision,
        conversationState: data.conversationState,
      })
      pushMessage({
        id: nextId.current++,
        role: 'ai',
        text: data.reply,
        offeredPrice: data.offerDetected ? data.offer : null,
        code: data.decision === 'accept' ? 'LUMINA-SERUM10' : undefined,
      })
      setAttemptsUsed(data.attemptsUsed)
      if (data.decision === 'accept' || data.decision === 'reject') setSettled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo unavailable')
      fireAvatar('error')
    } finally {
      setLoading(false)
      scrollToLatest()
    }
  }

  return (
    <div className="relative rounded-2xl border border-blue-700/40 bg-slate-900/70 backdrop-blur-sm shadow-2xl overflow-hidden">
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl" />
      <style dangerouslySetInnerHTML={{ __html: HERO_STAGE_CSS }} />
      <div className="relative grid grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-1.5" data-avatar-picker="v2">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-blue-200/80">Shopkeeper</span>
            {AVATAR_VARIANTS.map((variant) => {
              const meta = V2_AVATARS[variant]
              const selected = variant === avatarVariant
              return (
                <button
                  key={variant}
                  type="button"
                  aria-label={`Preview ${meta.name}`}
                  aria-pressed={selected}
                  data-avatar-option={variant}
                  data-avatar-selected={selected ? 'true' : 'false'}
                  onClick={() => chooseAvatar(variant)}
                  className={`flex min-h-11 items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition ${
                    selected
                      ? 'border-cyan-400/70 bg-cyan-950/40 text-white'
                      : 'border-blue-700/50 bg-blue-950/30 text-blue-200 hover:bg-blue-900/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 rounded-md border border-white/10 bg-white/90"
                    style={{
                      backgroundImage: `url(${meta.expressionSheet})`,
                      backgroundPosition: '0% 0%',
                      backgroundSize: '200% 200%',
                    }}
                  />
                  {meta.name}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="cg-hero-avatar w-[104px] h-[116px] rounded-xl bg-white/95 overflow-hidden flex items-center justify-center ring-1 ring-blue-700/40 flex-shrink-0">
              <ShopkeeperStage
                compact
                personality={profile.personality}
                expression={character.expression}
                state={character.state}
                event={character.event}
                eventSequence={character.eventSequence}
                eventContext={character}
                gesture={character.gesture}
                position={character.position}
                reaction={displayedReaction}
                avatarVariant={avatarVariant}
                name={profile.name}
                status="Live"
                line=""
                motionEnabled
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{profile.name} · {profile.role}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE DEMO
                </span>
              </div>
              <p className="text-xs text-blue-200/90 truncate">Try a question, a lowball, or a real offer.</p>
            </div>
            <Sparkles className="w-4 h-4 text-cyan-400 hidden sm:block" />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-blue-800/40 bg-slate-950/40 p-2.5 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PRODUCT.image} alt={PRODUCT.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-white truncate">{PRODUCT.title}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm text-blue-200/90">
                <span>Base <span className="line-through">{money(PRODUCT.basePrice)}</span></span>
                <span className="text-white font-semibold">Merchant price {money(PRODUCT.merchantPrice)}</span>
                <span className="text-amber-300">Floor {money(PRODUCT.floorPrice)}</span>
              </div>
            </div>
          </div>

          <div
            ref={chatRef}
            className="space-y-2.5 min-h-[182px] max-h-[250px] overflow-y-auto pr-1"
            role="log"
            aria-live="polite"
          >
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[86%] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm ${
                    m.role === 'customer'
                      ? 'rounded-tr-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                      : 'rounded-tl-sm bg-slate-800 text-blue-100 border border-blue-800/50'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.offeredPrice != null && (
                    <span className="mt-1 inline-block rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">
                      Offer {money(m.offeredPrice)}
                    </span>
                  )}
                  {m.code && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                      <BadgeCheck className="w-3.5 h-3.5" /> Code {m.code}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl rounded-tl-sm bg-slate-800 border border-blue-800/50 px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '240ms' }} />
                </div>
              </div>
            )}
          </div>

          {!settled && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  disabled={loading}
                  className="min-h-11 rounded-full border border-blue-700/50 bg-blue-900/30 px-3 py-2 text-xs sm:text-sm text-blue-200 hover:bg-blue-800/40 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {!settled ? (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question or name your price…"
                aria-label="Ask a question or name your price"
                className="min-h-[44px] flex-1 rounded-xl border border-blue-800/50 bg-slate-950/50 px-3 text-[16px] text-white outline-none placeholder:text-blue-300/80 focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Send message"
                className="min-h-[44px] rounded-xl bg-cyan-600 px-4 text-white font-semibold hover:bg-cyan-500 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-3 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Demo complete — reset the page to bargain again.
            </div>
          )}
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
          <div className="mt-3 pt-2.5 border-t border-blue-800/30 text-xs text-blue-200/80 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Attempts {attemptsUsed}/3 · The floor is enforced by the engine, never by the AI.
          </div>
        </div>

        <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-blue-800/30 p-4 sm:p-5 flex flex-col justify-center">
          <p className="text-xs uppercase tracking-wider text-blue-200/90 font-semibold mb-3">The deal, on paper</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-200/90">Base price</span>
              <span className="text-blue-100 font-medium line-through">{money(PRODUCT.basePrice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-200/90">Merchant-set price</span>
              <span className="text-white font-semibold">{money(PRODUCT.merchantPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-200/90">Protected floor</span>
              <span className="text-amber-300 font-medium">{money(PRODUCT.floorPrice)}</span>
            </div>
            <div className="rounded-xl bg-emerald-900/30 border border-emerald-600/40 px-3 py-2.5 flex items-center justify-between">
              <span className="text-emerald-200 text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Margin protected
              </span>
              <span className="text-emerald-300 text-lg font-bold">✓</span>
            </div>
            <p className="text-xs text-blue-200/80 leading-relaxed">
              This is the same shopkeeper engine used in the storefront. Questions stay questions — only a real bid spends a bargaining round.
            </p>
            <div className="rounded-xl border border-blue-700/40 bg-blue-950/40 px-3 py-2.5 flex items-center gap-2 text-xs text-blue-200">
              <Store className="w-4 h-4 text-cyan-300" /> Sample catalog product · no store connection required
            </div>
          </div>
          <div className="mt-4 border-t border-blue-800/30 pt-3" data-reaction-sheet-preview={avatarVariant}>
            <p className="text-[11px] uppercase tracking-wider text-blue-200/80 font-semibold mb-1">
              {profile.name}&rsquo;s reaction sheet
            </p>
            <p className="text-[11px] text-blue-300/70 mb-2">Each pose follows what you type. Tap one to preview it.</p>
            <div className="grid grid-cols-4 gap-1.5">
              {V2_REACTIONS.map((reaction) => {
                const cell = v2ReactionCell(reaction.id)
                const active = displayedReaction === reaction.id
                return (
                  <button
                    key={reaction.id}
                    type="button"
                    title={`${reaction.label} — ${reaction.trigger}`}
                    aria-label={`Preview ${reaction.label} reaction`}
                    aria-pressed={active}
                    data-reaction-preview={reaction.id}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => setPreviewReaction(reaction.id)}
                    className={`h-12 rounded-lg border bg-white/90 bg-no-repeat transition ${
                      active ? 'border-cyan-400 ring-1 ring-cyan-400/60' : 'border-white/10 hover:border-cyan-400/60'
                    }`}
                    style={{
                      backgroundImage: `url(${v2ReactionSheet(avatarVariant, cell.sheet)})`,
                      backgroundPosition: cell.position,
                      backgroundSize: '200% 200%',
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
