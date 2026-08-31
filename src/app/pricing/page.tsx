'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Zap, Building2, ArrowRight, MessageSquare, ShoppingCart, Handshake, Percent } from 'lucide-react'
import { PLANS, FREE_CARTS_THRESHOLD } from '@/lib/payment'

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-IN') : 'Unlimited')
const fmtCurrency = (n: number) => `₹${n.toLocaleString('en-IN')}`

const TIER_STYLES: Record<string, { border: string; glow: string; gradient: string; bg: string; badge: string; chip: string; text: string }> = {
  free: {
    border: 'border-emerald-500/40',
    glow: 'shadow-emerald-500/10',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-gradient-to-br from-emerald-900/20 to-slate-900/40',
    badge: 'from-emerald-500 to-teal-500',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    text: 'text-emerald-300',
  },
  growth: {
    border: 'border-amber-500/50',
    glow: 'shadow-amber-500/20',
    gradient: 'from-amber-500 to-orange-500',
    bg: 'bg-gradient-to-br from-amber-900/20 to-slate-900/40',
    badge: 'from-amber-500 to-orange-500',
    chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    text: 'text-amber-300',
  },
  pro: {
    border: 'border-violet-500/40',
    glow: 'shadow-violet-500/20',
    gradient: 'from-violet-500 to-purple-500',
    bg: 'bg-gradient-to-br from-violet-900/20 to-slate-900/40',
    badge: 'from-violet-500 to-purple-500',
    chip: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    text: 'text-violet-300',
  },
  enterprise: {
    border: 'border-cyan-500/40',
    glow: 'shadow-cyan-500/20',
    gradient: 'from-cyan-500 to-blue-500',
    bg: 'bg-gradient-to-br from-cyan-900/20 to-slate-900/40',
    badge: 'from-cyan-500 to-blue-500',
    chip: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    text: 'text-cyan-300',
  },
}

function MeterRow({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 text-sm text-blue-200/90">
        <span className="w-4 h-4 shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-white">{value}</div>
        {hint && <div className="text-[11px] text-blue-300/50">{hint}</div>}
      </div>
    </div>
  )
}

export default function PricingPage() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')

  const displayPrice = (plan: (typeof PLANS)[keyof typeof PLANS]) =>
    plan.price === 0 ? 0 : billing === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.price
  const periodLabel = (plan: (typeof PLANS)[keyof typeof PLANS]) =>
    plan.price === 0 ? '' : billing === 'yearly' ? '/mo billed yearly' : '/mo'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Nav */}
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
              <Link href="/signup" className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all">
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-4">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Pricing that grows with you</h1>
            <p className="text-lg text-blue-300/80 max-w-2xl mx-auto">
              Start free with {FREE_CARTS_THRESHOLD} recovered carts. Scale with AI bargaining, multi-channel
              recovery and a revenue share that&apos;s capped — so costs never surprise you.
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex flex-col items-center justify-center mb-12">
            <div className="inline-flex items-center gap-3 bg-slate-800/50 border border-blue-700/30 p-1 rounded-full">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billing === 'monthly'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                    : 'text-blue-300/60 hover:text-blue-300'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('yearly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billing === 'yearly'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                    : 'text-blue-300/60 hover:text-blue-300'
                }`}
              >
                Yearly
                <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">Save 17%</span>
              </button>
            </div>
            <p className="text-xs text-blue-300/40 mt-3">
              Yearly prices shown per month. Growth ₹{displayPrice(PLANS.GROWTH).toLocaleString('en-IN')}/mo · Pro ₹{displayPrice(PLANS.PRO).toLocaleString('en-IN')}/mo
            </p>
          </div>

          {/* All plan cards including Free and Enterprise */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-12">
            {Object.values(PLANS).map((plan) => {
              const style = TIER_STYLES[plan.id] ?? TIER_STYLES.growth
              const isRecommended = plan.recommended === true
              const isEnterprise = plan.id === 'enterprise'

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-6 flex flex-col ${style.bg} border-2 ${style.border} hover:shadow-xl ${style.glow} transition-all duration-300 h-full ${isRecommended ? 'lg:scale-105 lg:-translate-y-2' : ''}`}
                >
                  {isRecommended && (
                    <span className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-amber-500/30">
                      Most Popular
                    </span>
                  )}

                  <div className="flex items-center gap-2 mb-1">
                    {isEnterprise ? <Building2 className={`w-5 h-5 ${style.text}`} /> : <Zap className={`w-5 h-5 ${style.text}`} />}
                    <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                  </div>

                  <p className="text-sm text-blue-300/70 mb-4">
                    {isEnterprise ? 'Custom volume & custom terms' : `Up to ${fmt(plan.maxCarts)} recovered carts/mo`}
                  </p>

                  <div className="mb-1 flex items-end gap-1">
                    {isEnterprise ? (
                      <span className="text-3xl font-bold text-white">Custom</span>
                    ) : (
                      <>
                        <span className="text-4xl font-extrabold text-white">{fmtCurrency(displayPrice(plan))}</span>
                        <span className="text-sm text-blue-300/60 pb-1">{periodLabel(plan)}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3 mb-5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${style.chip}`}>{plan.revSharePercent}% rev share{plan.revShareCap > 0 ? ` · cap ${fmtCurrency(plan.revShareCap)}/mo` : ''}</span>
                    {!isEnterprise && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${style.chip}`}>{fmt(plan.maxCampaigns)} campaigns</span>
                    )}
                  </div>

                  {/* Plan meters — the heart of the unified model */}
                  <div className="space-y-0 mb-6">
                    <MeterRow icon={<ShoppingCart className="w-4 h-4 text-cyan-400" />} label="Recovered carts" value={isEnterprise ? 'Unlimited' : fmt(plan.maxCarts)} />
                    <MeterRow icon={<MessageSquare className="w-4 h-4 text-violet-400" />} label="Campaigns" value={isEnterprise ? 'Unlimited' : fmt(plan.maxCampaigns)} />
                    <MeterRow
                      icon={<Handshake className="w-4 h-4 text-emerald-400" />}
                      label="Bargain sessions"
                      value={isEnterprise ? 'Unlimited' : fmt(plan.bargainSessions)}
                    />
                    <MeterRow
                      icon={<Handshake className="w-4 h-4 text-emerald-400" />}
                      label="Accepted deals"
                      value={isEnterprise ? 'Unlimited' : fmt(plan.bargainDeals)}
                      hint={plan.bargainOverageDealPrice > 0 ? `then ${fmtCurrency(plan.bargainOverageDealPrice)}/extra` : plan.id === 'free' ? 'hard cap' : undefined}
                    />
                    <MeterRow
                      icon={<MessageSquare className="w-4 h-4 text-blue-400" />}
                      label="Msgs / customer"
                      value={isEnterprise ? 'Unlimited' : `${fmt(plan.maxMessagesPerCustomer.email)}/channel`}
                    />
                    <MeterRow
                      icon={<Building2 className="w-4 h-4 text-cyan-400" />}
                      label="Stores"
                      value={isEnterprise ? 'Unlimited' : fmt(plan.storesLimit)}
                    />
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-grow">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-blue-100">
                        <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${style.text}`} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={isEnterprise ? '/contact' : '/signup'}
                    className={`w-full py-3 rounded-lg font-semibold text-center transition-all bg-gradient-to-r ${style.gradient} text-white hover:shadow-lg group-hover:scale-[1.02] inline-flex items-center justify-center gap-2`}
                  >
                    {isEnterprise ? 'Contact Sales' : billing === 'yearly' ? 'Choose Plan' : 'Subscribe Now'}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )
            })}
          </div>

          {/* How Pricing Works */}
          <div className="max-w-5xl mx-auto bg-gradient-to-r from-slate-800/50 to-blue-900/30 border border-blue-700/30 rounded-xl p-8 backdrop-blur-sm">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Percent className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Simple, transparent pricing</h3>
                <div className="space-y-2 text-sm text-blue-300/80">
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Pay a fixed monthly subscription based on your cart volume. No setup fees.</span>
                  </p>
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>First <strong className="text-white">{FREE_CARTS_THRESHOLD} recovered carts</strong> — zero revenue share. We prove our value first.</span>
                  </p>
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Revenue share: <strong className="text-white">{PLANS.GROWTH.revSharePercent}% Growth</strong> (capped at {fmtCurrency(PLANS.GROWTH.revShareCap)}/mo) / <strong className="text-white">{PLANS.PRO.revSharePercent}% Pro</strong> (capped at {fmtCurrency(PLANS.PRO.revShareCap)}/mo). Only on CartGain-attributed recoveries.</span>
                  </p>
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Per-customer message caps: <strong className="text-white">{PLANS.FREE.maxMessagesPerCustomer.email} Free</strong> / <strong className="text-white">{PLANS.GROWTH.maxMessagesPerCustomer.email} Growth</strong> / <strong className="text-white">{PLANS.PRO.maxMessagesPerCustomer.email} Pro</strong> per channel.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
