import Link from 'next/link'
import {
  ArrowRight, CheckCircle2, Zap, MessageSquare, Sparkles, Shield, UsersRound,
} from 'lucide-react'
import { Button } from '@/components/Button'
import FeatureCard from '@/components/FeatureCard'

const CAPABILITIES = [
  {
    icon: <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />,
    title: 'Real-World Negotiation Psychology',
    description: 'The AI negotiates like an experienced shopkeeper — not canned discount scripts.',
    features: [
      'Anchoring, reciprocity, loss aversion & scarcity',
      'Concession patterns that signal your floor without revealing it',
      'Silence handling, round-number & split-the-difference plays',
      'Fluid adaptation to customer emotional state',
    ],
  },
  {
    icon: <Shield className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />,
    title: 'Margin Safety by Design',
    description: 'Protection isn&apos;t a prompt — it&apos;s enforced at the engine level.',
    features: [
      'Your floor price is a hard constraint, never a suggestion',
      'Accept decisions below the floor are downgraded automatically',
      'Bulk orders unlock controlled, merchant-defined discounts',
      'Never reveals the floor, margin or internal pricing',
    ],
  },
  {
    icon: <UsersRound className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />,
    title: 'Abuse & Brand Protection',
    description: 'The AI stays professional through the worst humans throw at it.',
    features: [
      '6-layer abuse firewall: profanity, threats, harassment',
      'Multi-layer protection against common prompt-injection attempts',
      'Toxic users get graceful, dignified responses',
      'Flooding & spam don&apos;t burn your customer&apos;s attempts',
    ],
  },
  {
    icon: <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />,
    title: 'Turns Negotiations Into Sales',
    description: 'Every hard-won agreement becomes revenue — fully automated.',
    features: [
      'Accepted deal auto-generates a Shopify discount code',
      'Codes bound to that customer + that cart — no sharing',
      'Walkout retention saves customers who threaten to leave',
      'Memory of returning customers rewards loyalty',
    ],
  },
]

const SCENARIOS = [
  'Lowball openers ("₹200 take it or leave it")',
  'Comparison shoppers ("Amazon has it cheaper")',
  'Price haggling ("can you do better?")',
  'Emotional appeals (student, birthday, budget)',
  'Walkout threats & retention saves',
  'Chatting hesitation — indecisive buyers',
  '"My manager / partner" excuses',
  'Round-number games & split-the-difference',
  'Bulk / multi-unit wholesale requests',
  'Cash & UPI payment haggling',
  'Flattery & charm attacks',
  'Quality & feature complaints',
  'Loyalty & returning-customer rewards',
  'Rude, aggressive, or abusive behavior',
  '"My friend got it for ₹X"',
  'Combo tactics — multiple at once',
  '"Let me think about it"',
  'Absurd offers: ₹0, free, ₹1',
]

export default function BargainPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <nav className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-lg border-b border-blue-800/30 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">CG</span>
              </div>
              <span className="text-lg font-bold text-white">CartGain</span>
            </Link>
            <div className="flex items-center space-x-3">
              <Link href="/login" className="text-sm text-blue-200 hover:text-blue-100">Sign In</Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-24 sm:pt-28">
        <section aria-labelledby="bargain-heading" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/60">
          <div className="max-w-7xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-blue-950/80 to-slate-900 p-8 sm:p-12 md:p-16 shadow-2xl shadow-cyan-500/10">
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl"></div>
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-5">
                    <Sparkles className="w-3.5 h-3.5" /> The AI Negotiator — Deep Dive
                  </span>
                  <h1 id="bargain-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                    The AI shopkeeper built to turn <span className="text-cyan-400">price objections into sales.</span>
                  </h1>
                  <p className="text-lg text-blue-100 max-w-xl mb-8">
                    Bargain hunters walk away when they can&apos;t get a deal. CartGain embeds an AI negotiator at your checkout that reads your customer&apos;s tactics, adapts its strategy in real time, and closes deals a human shopkeeper would — while your margin stays protected.
                  </p>
                  <ul className="space-y-3 mb-8">
                    {[
                      'Not a chatbot — an AI negotiation agent with real-world negotiation psychology',
                      'Reads a dozen customer behavioral patterns (from lowball openers to walkout threats) and adapts its strategy mid-conversation',
                      'You set the floor price — the AI cannot sell below it, enforced at the engine level',
                      '3 distinct shopkeeper personas, each with a consistent negotiation style',
                      'Has Indian-market psychology built in — round figures, festivals, UPI/cash leverage',
                      'Negotiates in English, Hinglish, Hindi and 9 regional languages, mirroring your customer',
                      'Multi-layer protection against common prompt-injection and manipulation attempts',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-blue-100">
                        <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3 sm:gap-4">
                    <Button isLink href="/demo" variant="primary">
                      Try the Negotiator <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button isLink href="/s/bargain" variant="accent" className="border-2 border-cyan-400">
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                      Live Demo
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <div className="rounded-2xl border border-blue-700/40 bg-slate-900/80 backdrop-blur-sm p-6 shadow-xl">
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-300/70 mb-4">Live Negotiation Preview</div>
                    <div className="space-y-3">
                      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm text-white">I love this serum, but ₹1,499 is too much for me. Can you do ₹1,200?</div>
                      </div>
                      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: '300ms' }}>
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-700/70 px-4 py-3 text-sm text-blue-100">I get it — it&apos;s our best-seller for a reason. For you today, I can do ₹1,349. That&apos;s 10% off. Deal?</div>
                      </div>
                      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: '600ms' }}>
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm text-white">Amazon has it for ₹1,280. Match that?</div>
                      </div>
                      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: '900ms' }}>
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-700/70 px-4 py-3 text-sm text-blue-100">You&apos;ve done your homework! I can&apos;t match Amazon blindly, but I&apos;ll split the difference at ₹1,299 — with our 90-day quality guarantee included. Fair?</div>
                      </div>
                      <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: '1200ms' }}>
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm text-white">Deal!</div>
                      </div>
                      <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: '1500ms' }}>
                        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-emerald-600/40 border border-emerald-500/40 px-4 py-3 text-sm text-emerald-200">Done! Here&apos;s your code: <span className="font-bold">BARGAIN10</span> — 24 hours only.</div>
                      </div>
                    </div>
                    <div className="mt-5 pt-4 border-t border-blue-700/30 flex items-center justify-between text-xs text-blue-300/60">
                      <span>Floor price set by you: ₹1,250</span>
                      <span className="text-emerald-400">Margin protected ✓</span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-blue-300/50 text-center">
                    The negotiation engine never offers, and never can offer, below your floor.
                  </p>
                </div>
              </div>
            </div>

            {/* Capability Pillars */}
            <div className="grid grid-cols-1 gap-5 mt-12 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map((cap) => (
                <FeatureCard
                  key={cap.title}
                  className="h-full"
                  icon={cap.icon}
                  title={cap.title}
                  description={cap.description}
                  features={cap.features}
                />
              ))}
            </div>

            {/* Personas */}
            <div className="mt-12 sm:mt-16 relative rounded-3xl overflow-hidden border border-blue-700/30 bg-slate-900/60 p-8 sm:p-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/40 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-5">
                    <UsersRound className="w-3.5 h-3.5" /> Three Shopkeeper Personas
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Choose the voice that fits your brand.</h2>
                  <p className="text-blue-100 mb-8 max-w-xl">
                    Each persona holds the same negotiation mastery but speaks in its own voice — so you can match the personality of your store.
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 bg-slate-800/40 border border-cyan-500/20 rounded-xl p-5">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0">A</div>
                      <div>
                        <p className="font-semibold text-white">Alex — The Friendly Shopkeeper</p>
                        <p className="text-sm text-blue-200 mt-1">Warm and folksy, treats customers like family. Concedes with stories and personal touches. Ideal for beauty & lifestyle stores.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 bg-slate-800/40 border border-blue-500/20 rounded-xl p-5">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold flex-shrink-0">M</div>
                      <div>
                        <p className="font-semibold text-white">Morgan — The Strict Negotiator</p>
                        <p className="text-sm text-blue-200 mt-1">Measured and precise, uses silence and value-framing. Never makes the first move. Perfect for electronics or B2B catalogues.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 bg-slate-800/40 border border-purple-500/20 rounded-xl p-5">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">R</div>
                      <div>
                        <p className="font-semibold text-white">Riley — The Playful Friend</p>
                        <p className="text-sm text-blue-200 mt-1">Witty and dramatic, makes haggling fun while staying razor-sharp. Great for streetwear, toys & Gen-Z brands.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" /> Handles every real-world bargaining scenario
                    </h2>
                    <p className="text-sm text-blue-200 mb-4">The behavioral engine reads intent — not just words — and adapts mid-conversation. It&apos;s trained to recognize and respond to:</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SCENARIOS.map((item) => (
                      <div key={item} className="flex items-start gap-2 bg-slate-800/30 border border-blue-700/20 rounded-lg px-3 py-2.5 text-sm text-blue-100">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-900/20 p-4 text-sm text-emerald-200">
                    <strong className="text-emerald-300">The result:</strong> customers get the feeling they won — and stores get the sale without giving away margins.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-blue-950/80">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Put the negotiator to work on your checkout.</h2>
            <p className="text-lg text-blue-100/90 mb-8 max-w-2xl mx-auto">
              Start free with 50 recovered carts. No credit card, no setup fees — your floor price stays safe from the first conversation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
              <Button isLink href="/signup" variant="primary">
                Start Free <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button isLink href="/s/bargain" variant="accent" className="border-2 border-cyan-400">
                <Zap className="w-4 h-4" />
                Watch It Bargain Live
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}