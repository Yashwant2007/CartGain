'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, BadgeCheck, Sparkles } from 'lucide-react'

type Step =
  | { type: 'msg'; role: 'customer' | 'ai'; text: string }
  | { type: 'deal'; text: string }

const STEPS: Step[] = [
  { type: 'msg', role: 'customer', text: '₹1,499 is a little expensive.' },
  { type: 'msg', role: 'ai', text: 'I can help with that. Would ₹1,349 work for you?' },
  { type: 'msg', role: 'customer', text: 'Can you do ₹1,299?' },
  { type: 'msg', role: 'ai', text: 'I can do ₹1,299.' },
  { type: 'deal', text: 'Deal locked — here is your one-use code: LUMINA-SERUM10' },
]

const TIMINGS = [0, 1400, 3200, 4400, 5800]
const HOLD_MS = 4200
const LOOP_MS = TIMINGS[TIMINGS.length - 1] + HOLD_MS

export default function HeroNegotiationDemo() {
  const [visible, setVisible] = useState(0)
  const [typing, setTyping] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setVisible(STEPS.length)
      setShowSummary(true)
      return
    }

    let timers: ReturnType<typeof setTimeout>[] = []

    const schedule = () => {
      setVisible(0)
      setTyping(false)
      setShowSummary(false)
      STEPS.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            setVisible(i + 1)
            if (i === STEPS.length - 1) setShowSummary(true)
            const next = STEPS[i + 1]
            if (i < STEPS.length - 1 && next.type === 'msg' && next.role === 'ai') {
              setTyping(true)
              timers.push(setTimeout(() => setTyping(false), 900))
            }
          }, TIMINGS[i])
        )
      })
      timers.push(setTimeout(schedule, LOOP_MS))
    }

    schedule()
    return () => {
      timers.forEach(t => clearTimeout(t))
    }
  }, [])

  return (
    <div className="relative rounded-2xl border border-blue-700/40 bg-slate-900/70 backdrop-blur-sm shadow-2xl overflow-hidden" aria-hidden="true">
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl"></div>
      <div className="relative grid grid-cols-1 lg:grid-cols-5">
        {/* Chat panel */}
        <div className="lg:col-span-3 p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
              CG
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">AI Shopkeeper</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ETHEREAL — LIVE
                </span>
              </div>
              <p className="text-[11px] text-blue-300/60">Lumina Beauty · Negotiating in real time</p>
            </div>
            <Sparkles className="w-4 h-4 text-cyan-400 hidden sm:block" />
          </div>

          <div className="space-y-2.5 min-h-[190px]">
            {STEPS.slice(0, visible).map((step, i) =>
              step.type === 'deal' ? (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-emerald-900/40 border border-emerald-600/40 px-4 py-2.5 text-xs sm:text-sm text-emerald-200 inline-flex items-center gap-2">
                    <BadgeCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {step.text}
                  </div>
                </div>
              ) : (
                <div key={i} className={`flex ${step.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-2 duration-500 ${
                      step.role === 'customer'
                        ? 'rounded-tr-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                        : 'rounded-tl-sm bg-slate-800 text-blue-100 border border-blue-800/50'
                    }`}
                  >
                    {step.text}
                  </div>
                </div>
              )
            )}
            {typing && visible > 0 && visible < STEPS.length && (
              <div className="flex justify-start">
                <div className="rounded-xl rounded-tl-sm bg-slate-800 border border-blue-800/50 px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '240ms' }} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-blue-800/30 text-[11px] text-blue-300/50 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Accepted deals auto-generate a one-use, 24-hour discount code — bound to that cart.
          </div>
        </div>

        {/* Deal summary */}
        <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-blue-800/30 p-5 sm:p-6 flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-wider text-blue-300/60 font-semibold mb-4">The deal, on paper</p>
          <div className={`space-y-3 transition-all duration-700 ${showSummary ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300/70">Original price</span>
              <span className="text-blue-100 font-medium">₹1,499</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300/70">Final price</span>
              <span className="text-white font-semibold">₹1,299</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-300/70">Your floor price</span>
              <span className="text-amber-300 font-medium">₹1,250</span>
            </div>
            <div className="rounded-xl bg-emerald-900/30 border border-emerald-600/40 px-4 py-3 flex items-center justify-between">
              <span className="text-emerald-200 text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Margin protected
              </span>
              <span className="text-emerald-300 text-lg font-bold">✓</span>
            </div>
            <p className="text-[11px] text-blue-300/50 leading-relaxed">
              The engine enforces your floor — the AI never offers, and never can offer, below it.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}