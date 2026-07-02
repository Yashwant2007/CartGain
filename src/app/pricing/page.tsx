'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { PLANS, FREE_CARTS_THRESHOLD } from '@/lib/payment'

export default function PricingPage() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')

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

      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h1>
            <p className="text-lg text-blue-300/80 max-w-2xl mx-auto">
              Pay a fixed monthly subscription based on your cart volume. First {FREE_CARTS_THRESHOLD} recovered carts free — then revenue share applies.
            </p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-12">
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
          </div>

          {/* Free Trial Banner */}
          <div className="max-w-3xl mx-auto mb-10 bg-gradient-to-r from-emerald-900/30 via-slate-800/50 to-blue-900/30 border border-emerald-500/30 rounded-xl p-8 backdrop-blur-sm text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Start Free — {FREE_CARTS_THRESHOLD} Recovered Carts, ₹0</h2>
            <p className="text-blue-300/70 mb-6 max-w-xl mx-auto">
              No credit card required. Recover your first {FREE_CARTS_THRESHOLD} abandoned carts completely free.
              All channels included — SMS, WhatsApp, Email. Upgrade when you grow.
            </p>
            <div className="flex items-center justify-center gap-6 text-sm text-blue-300/60 mb-6">
              <span>✓ SMS, WhatsApp &amp; Email</span>
              <span>✓ AI-powered messaging</span>
              <span>✓ Analytics dashboard</span>
            </div>
            <Link
              href="/signup"
              className="inline-block px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/50 transition-all"
            >
              Start Free Trial →
            </Link>
          </div>

          {/* Paid Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
            {Object.values(PLANS).filter(p => p.price > 0).map((plan) => {
              const isGrowth = plan.recommended
              const displayPrice = billing === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.price
              const period = billing === 'yearly' ? '/mo billed yearly' : '/mo'

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-8 flex flex-col ${
                    isGrowth
                      ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-2 border-amber-500/60 md:scale-105'
                      : 'bg-slate-800/50 border border-blue-700/30 hover:border-blue-500/70'
                  } transition-all h-full`}
                >
                  {isGrowth && (
                    <span className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full">
                      Recommended
                    </span>
                  )}

                  <h2 className="text-2xl font-bold text-white mb-1">{plan.name}</h2>
                  <p className="text-sm text-blue-300/60 mb-4">
                    Up to {plan.maxCarts === Infinity ? 'unlimited' : plan.maxCarts.toLocaleString('en-IN')} carts/mo
                  </p>

                  <div className="mb-1">
                    <span className="text-4xl font-bold text-white">₹{displayPrice.toLocaleString('en-IN')}</span>
                    <span className="text-base text-blue-300/60 ml-1">{period}</span>
                  </div>
                  <p className="text-xs text-emerald-400/80 mb-1">
                    Recover <strong>₹{plan.estimatedRecovery.min.toLocaleString('en-IN')}-{plan.estimatedRecovery.max.toLocaleString('en-IN')}</strong>/mo typically
                  </p>
                  <p className="text-xs text-blue-300/40 mb-6">
                    + {plan.revSharePercent}% revenue share on carts after first {FREE_CARTS_THRESHOLD}
                  </p>

                  <ul className="space-y-3 mb-8 flex-grow">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-blue-100">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className={`w-full py-3 rounded-lg font-semibold text-center transition-all ${
                      isGrowth
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/50'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                    }`}
                  >
                    Get Started Free
                  </Link>
                </div>
              )
            })}
          </div>

          {/* How Pricing Works */}
          <div className="max-w-5xl mx-auto bg-gradient-to-r from-slate-800/50 to-blue-900/30 border border-blue-700/30 rounded-xl p-8 backdrop-blur-sm">
            <div className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg">%</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Simple, transparent pricing</h3>
                <div className="space-y-2 text-sm text-blue-300/80">
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Pay a fixed monthly subscription based on your cart volume</span>
                  </p>
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>First <strong className="text-white">{FREE_CARTS_THRESHOLD} recovered carts</strong> — zero revenue share. We prove our value first.</span>
                  </p>
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>Revenue share: <strong className="text-white">3% Starter</strong> / <strong className="text-white">2.5% Growth</strong> / <strong className="text-white">2% Pro</strong>. Lower rates on higher plans.</span>
                  </p>
                  <p className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>No hidden fees, no per-message charges, no setup costs</span>
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
