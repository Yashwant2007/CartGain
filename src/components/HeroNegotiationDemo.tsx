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
  image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=400&fit=crop',
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

const money = (value: number) => `${PRODUCT.currency}${value.toLocaleString('en-IN')}`

export default function HeroNegotiationDemo() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 0, role: 'ai', text: "Hi! I'm Morgan, the shopkeeper. Ask me about the serum or name a fair price — I'll do my best." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [character, setCharacter] = useState<ShopkeeperAnimation>(() =>
    resolveShopkeeperAnimation('friendly_shopkeeper', 'idle'),
  )
  const chatRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)

  const fireAvatar = (event: LivingEvent, ctx: FireAvatarContext = {}) => {
    setCharacter(resolveShopkeeperAnimation('friendly_shopkeeper', event, ctx))
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
      <div className="relative grid grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3 p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-[76px] h-[68px] rounded-xl bg-white/95 overflow-hidden flex items-center justify-center ring-1 ring-blue-700/40 flex-shrink-0">
              <ShopkeeperStage
                compact
                personality="friendly_shopkeeper"
                expression={character.expression}
                state={character.state}
                event={character.event}
                eventSequence={character.eventSequence}
                eventContext={character}
                gesture={character.gesture}
                position={character.position}
                reaction={character.reaction}
                avatarVariant="signature"
                name="Morgan"
                status="Live"
                line=""
                motionEnabled
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Morgan · AI Shopkeeper</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE DEMO
                </span>
              </div>
              <p className="text-[11px] text-blue-300/60 truncate">Try a question, a lowball, or a real offer.</p>
            </div>
            <Sparkles className="w-4 h-4 text-cyan-400 hidden sm:block" />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-blue-800/40 bg-slate-950/40 p-2.5 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PRODUCT.image} alt={PRODUCT.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-white truncate">{PRODUCT.title}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px] text-blue-300/70">
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
                    <span className="mt-1 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
                      Offer {money(m.offeredPrice)}
                    </span>
                  )}
                  {m.code && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
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
                  className="rounded-full border border-blue-700/50 bg-blue-900/30 px-2.5 py-1.5 text-[10px] sm:text-[11px] text-blue-200 hover:bg-blue-800/40 disabled:opacity-50"
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
                className="min-h-[44px] flex-1 rounded-xl border border-blue-800/50 bg-slate-950/50 px-3 text-[16px] text-white outline-none placeholder:text-blue-400/50 focus:border-cyan-500"
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
          {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
          <div className="mt-3 pt-2.5 border-t border-blue-800/30 text-[11px] text-blue-300/50 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Attempts {attemptsUsed}/3 · The floor is enforced by the engine, never by the AI.
          </div>
        </div>

        <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-blue-800/30 p-4 sm:p-5 flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-wider text-blue-300/60 font-semibold mb-3">The deal, on paper</p>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300/70">Base price</span>
              <span className="text-blue-100 font-medium line-through">{money(PRODUCT.basePrice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300/70">Merchant-set price</span>
              <span className="text-white font-semibold">{money(PRODUCT.merchantPrice)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300/70">Protected floor</span>
              <span className="text-amber-300 font-medium">{money(PRODUCT.floorPrice)}</span>
            </div>
            <div className="rounded-xl bg-emerald-900/30 border border-emerald-600/40 px-3 py-2.5 flex items-center justify-between">
              <span className="text-emerald-200 text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Margin protected
              </span>
              <span className="text-emerald-300 text-lg font-bold">✓</span>
            </div>
            <p className="text-[11px] text-blue-300/50 leading-relaxed">
              This is the same shopkeeper engine used in the storefront. Questions stay questions — only a real bid spends a bargaining round.
            </p>
            <div className="rounded-xl border border-blue-700/40 bg-blue-950/40 px-3 py-2.5 flex items-center gap-2 text-[11px] text-blue-200">
              <Store className="w-4 h-4 text-cyan-300" /> Sample catalog product · no store connection required
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
