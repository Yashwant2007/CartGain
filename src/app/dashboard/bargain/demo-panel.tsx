'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Send,
  RotateCcw,
  Sparkles,
  MessageCircle,
  CheckCircle2,
  Play,
  ShoppingBag,
  Languages,
} from 'lucide-react'
import {
  buildOpeningMessage,
  ruleBasedDecision,
  retentionOffer,
  graduatedCounter,
  type Persona,
  type NegotiationContext,
  type NegotiationResult,
} from '@/lib/bargain/engine'
import { extractPrice, detectWalkout } from '@/lib/bargain/text'

type ChatMsg = {
  role: 'customer' | 'ai'
  content: string
  offeredPrice?: number | null
}

const PERSONAS: { id: Persona; name: string; blurb: string }[] = [
  { id: 'friendly_shopkeeper', name: 'Friendly Shopkeeper', blurb: 'Warm, neighbourly, finds a way.' },
  { id: 'strict_negotiator', name: 'Strict Negotiator', blurb: 'Precise, data-driven, protects margin.' },
  { id: 'playful_friend', name: 'Playful Friend', blurb: 'Cheeky, fun, keeps it engaging.' },
]

const LANGUAGES: { id: string; label: string }[] = [
  { id: 'auto', label: 'Auto · mirror me' },
  { id: 'en', label: 'English' },
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'ta', label: 'தமிழ்' },
  { id: 'te', label: 'తెలుగు' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'mr', label: 'मराठी' },
  { id: 'pa', label: 'ਪੰਜਾਬੀ' },
]

type DemoPanelProps = {
  defaultPersona: Persona
  defaultLanguage: string
  maxAttempts: number
  minProfitPercent: number
}

export function DemoPanel({ defaultPersona, defaultLanguage, maxAttempts, minProfitPercent }: DemoPanelProps) {
  const [price, setPrice] = useState<number>(1000)
  const [persona, setPersona] = useState<Persona>(defaultPersona)
  const [language, setLanguage] = useState<string>(defaultLanguage || 'auto')
  const [started, setStarted] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [attemptsUsed, setAttemptsUsed] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [ended, setEnded] = useState<null | 'accepted' | 'rejected' | 'abandoned'>(null)
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef(0)

  const minPrice = useMemo(
    () => Math.round(price * (1 - minProfitPercent / 100) * 100) / 100,
    [price, minProfitPercent],
  )

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking])

  function buildCtx(attempts: number): NegotiationContext {
    return {
      storeName: 'My Store',
      currencySymbol: '₹',
      originalPrice: price,
      minPrice,
      attemptsUsed: attempts,
      maxAttempts,
      persona,
      productTitle: 'Sample Product',
      language,
    }
  }

  function reset() {
    sessionIdRef.current += 1
    setStarted(false)
    setMessages([])
    setInput('')
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setThinking(false)
    setAiError(null)
  }

  function start() {
    sessionIdRef.current += 1
    setAiError(null)
    setMessages([{ role: 'ai', content: buildOpeningMessage(buildCtx(0)) }])
    setAttemptsUsed(0)
    setEnded(null)
    setFinalPrice(null)
    setThinking(false)
    setStarted(true)
  }

  function replyDelay(len: number) {
    return 600 + Math.min(len, 240) * 1.0
  }

  async function send() {
    if (!input.trim() || ended || thinking) return
    const userText = input.trim()
    const offer = extractPrice(userText)
    const isWalkout = detectWalkout(userText)

    const nextAttempt = attemptsUsed + 1
    const attemptsLeft = maxAttempts - nextAttempt
    const exhausted = nextAttempt >= maxAttempts
    const ctx = buildCtx(attemptsUsed)

    let reply = ''
    let counterOffer: number | null = null
    let decision: NegotiationResult['decision'] = 'counter'
    let newEnded: null | 'accepted' | 'rejected' | 'abandoned' = null
    let newFinal: number | null = null

    const history = messages.map(m => ({
      role: m.role,
      content: m.content,
      offeredPrice: m.offeredPrice ?? undefined,
    }))

    try {
      const res = await fetch('/api/bargain/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          offer,
          history,
          storeName: ctx.storeName,
          currencySymbol: ctx.currencySymbol,
          originalPrice: ctx.originalPrice,
          minPrice: ctx.minPrice,
          maxAttempts: ctx.maxAttempts,
          attemptsUsed: ctx.attemptsUsed,
          persona: ctx.persona,
          productTitle: ctx.productTitle,
          language: ctx.language,
          walkoutTriggered: isWalkout,
        }),
      })
      const data = await res.json()
      if (res.ok && typeof data?.reply === 'string' && data.reply.trim()) {
        reply = data.reply
        counterOffer = typeof data.counterOffer === 'number' ? data.counterOffer : null
        if (data.decision === 'accept') decision = 'accept'
        else if (data.decision === 'reject') decision = 'reject'
      } else if (!res.ok && data?.error) {
        setAiError(data.error)
      }
    } catch {
      setAiError('Network error — showing offline fallback responses.')
    }

    if (!reply) {
      if (isWalkout && attemptsLeft > 0) {
        const lastCounter = [...messages].reverse().find(m => m.role === 'ai' && m.offeredPrice != null)?.offeredPrice ?? null
        const r = retentionOffer(ctx, lastCounter)
        reply = r.reply
        counterOffer = r.counterOffer ?? null
      } else if (offer != null) {
        const result = ruleBasedDecision(offer, ctx)
        reply = result.reply
        counterOffer = result.counterOffer ?? null
        decision = result.decision
      } else {
        const counter = graduatedCounter(ctx)
        reply = `What price did you have in mind? I could probably do ₹${counter.toFixed(2)} if you make me a fair offer.`
        counterOffer = counter
      }
    }

    if (exhausted && decision !== 'accept') newEnded = 'rejected'
    else if (decision === 'accept') {
      newEnded = 'accepted'
      newFinal = newFinal ?? offer ?? counterOffer ?? null
    } else if (isWalkout && attemptsLeft <= 0) {
      newEnded = 'abandoned'
    }

    const sid = sessionIdRef.current
    setMessages(prev => [...prev, { role: 'customer', content: userText, offeredPrice: offer }])
    setAttemptsUsed(nextAttempt)
    setInput('')
    setThinking(true)

    window.setTimeout(() => {
      if (sessionIdRef.current !== sid) return
      setMessages(prev => [...prev, { role: 'ai', content: reply, offeredPrice: counterOffer }])
      setThinking(false)
      if (newEnded) {
        setEnded(newEnded)
        if (newFinal != null) setFinalPrice(newFinal)
      } else {
        setAiError(null)
      }
    }, replyDelay(reply.length))
  }

  const attemptsLeft = Math.max(0, maxAttempts - attemptsUsed)

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      {/* Setup / compare */}
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5 space-y-5 self-start">
        <div className="flex items-center gap-2 text-blue-100 font-semibold">
          <Sparkles className="w-4 h-4 text-blue-400" />
          Live Demo
          <span className="ml-auto text-[10px] font-normal text-blue-300/50">Powered by your AI engine</span>
        </div>
        <p className="text-xs text-blue-300/70 -mt-3">
          Try each persona and language with the same offer — see exactly what your customers will experience,
          with your saved persona and floor as defaults.
        </p>

        <div>
          <label className="flex items-center gap-1.5 text-sm text-blue-200 mb-1.5">
            <ShoppingBag className="w-3.5 h-3.5 text-blue-300/70" /> Sample price (list)
          </label>
          <div className="flex gap-2">
            <span className="flex items-center px-3 bg-slate-950 border border-blue-800/40 rounded-lg text-blue-200">₹</span>
            <input
              type="number"
              min={1}
              value={price}
              onChange={e => { setPrice(Math.max(1, parseFloat(e.target.value) || 1)); reset() }}
              className="flex-1 bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div className="flex justify-between text-[11px] text-amber-300/80 mt-1.5">
            <span>Floor (protected)</span>
            <span className="font-mono">₹{minPrice.toFixed(2)}</span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-sm text-blue-200 mb-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-blue-300/70" /> Persona
          </label>
          <div className="space-y-1.5">
            {PERSONAS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPersona(p.id); started && reset() }}
                className={`w-full text-left p-2.5 rounded-lg transition ${
                  persona === p.id ? 'bg-blue-900/40 border border-blue-600/50' : 'hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-[11px] text-blue-300/70 mt-0.5">{p.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-sm text-blue-200 mb-1.5">
            <Languages className="w-3.5 h-3.5 text-blue-300/70" /> Language
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {LANGUAGES.map(l => (
              <button
                key={l.id}
                onClick={() => { setLanguage(l.id); started && reset() }}
                className={`px-2 py-1.5 text-xs rounded-lg transition ${
                  language === l.id
                    ? 'bg-blue-900/40 border border-blue-600/50 text-blue-100'
                    : 'hover:bg-slate-800/50 border border-transparent text-blue-300/70'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-1">
          {!started ? (
            <button
              onClick={start}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition active:scale-95"
            >
              <Play className="w-4 h-4" /> Start Bargain Session
            </button>
          ) : (
            <button
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-lg transition active:scale-95"
            >
              <RotateCcw className="w-4 h-4" /> Reset Session
            </button>
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="lg:col-span-2 bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-blue-800/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${started ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span className="text-blue-200">
              {PERSONAS.find(p => p.id === persona)?.name}
              <span className="text-blue-300/50 ml-2 italic">· {LANGUAGES.find(l => l.id === language)?.label}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-blue-300/70">
            <span>{thinking ? 'negotiating…' : started ? `Attempts: ${attemptsLeft} left` : ''}</span>
          </div>
        </div>

        <div ref={scrollRef} className="h-[380px] overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-950/40 to-transparent">
          {!started ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-blue-300/50 text-sm space-y-2">
              <Sparkles className="w-8 h-8 text-blue-400/40" />
              <div>Pick a persona, language and price above, then start the session.</div>
              <div className="text-[11px] text-blue-300/40 max-w-sm">
                Type anything — &quot;₹700?&quot;, a walkout threat, or &quot;free delivery?&quot; — and watch the AI negotiator
                respond in the right language, all while enforcing your floor.
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-blue-300/50 text-sm">Starting session…</div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                      m.role === 'customer'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-slate-800 text-blue-100 rounded-bl-sm border border-blue-800/40'
                    }`}
                  >
                    <div>{m.content}</div>
                    {m.offeredPrice != null && (
                      <div className="text-[11px] mt-1 opacity-70 font-mono">
                        {m.role === 'customer' ? 'offered' : 'counter'}: ₹{m.offeredPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-blue-800/40 rounded-xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {ended === 'accepted' && finalPrice != null && (
          <div className="px-4 py-4 bg-emerald-900/20 border-t border-emerald-700/40 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div className="text-sm font-semibold text-emerald-200">
              Deal accepted at ₹{finalPrice.toFixed(2)} — customer saved ₹{(price - finalPrice).toFixed(2)}
            </div>
          </div>
        )}
        {ended === 'rejected' && (
          <div className="px-4 py-4 bg-red-900/20 border-t border-red-700/40 text-sm text-red-200">
            Attempts exhausted — session rejected. On a real store this feeds the cart-recovery flow with
            &quot;missed bargain&quot; context.
          </div>
        )}
        {ended === 'abandoned' && (
          <div className="px-4 py-4 bg-amber-900/20 border-t border-amber-700/40 text-sm text-amber-200">
            Session abandoned. On a real store this triggers the WhatsApp / Email / SMS recovery sequence.
          </div>
        )}
        {aiError && !ended && (
          <div className="px-4 py-2 bg-amber-900/20 border-t border-amber-700/40 text-[11px] text-amber-200">
            {aiError}
          </div>
        )}

        {started && !ended && (
          <>
            <div className="p-3 border-t border-blue-800/30 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-blue-300/50 mr-1">Quick tries</span>
              <button
                onClick={() => setInput('₹200')}
                className="px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-slate-700 border border-blue-800/40 rounded-full text-blue-300/80 transition"
              >
                Lowball ₹200
              </button>
              <button
                onClick={() => setInput(`₹${Math.ceil(minPrice + 20)}`)}
                className="px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-slate-700 border border-blue-800/40 rounded-full text-blue-300/80 transition"
              >
                Offer near floor
              </button>
              <button
                onClick={() => setInput('This is too expensive. I am going to leave.')}
                className="px-2.5 py-1 text-xs bg-slate-800/70 hover:bg-slate-700 border border-blue-800/40 rounded-full text-blue-300/80 transition"
              >
                Walkout threat
              </button>
            </div>
            <div className="p-3 pt-0 border-t border-blue-800/30 flex items-center gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') send() }}
                placeholder={`Make an offer (e.g. "₹${Math.round(price * 0.7)}")`}
                className="flex-1 bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-sm text-white placeholder:text-blue-300/40 focus:outline-none focus:border-blue-500"
                maxLength={300}
              />
              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition active:scale-95"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}