import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { PLANS, FREE_CARTS_THRESHOLD, REVENUE_SHARE_PERCENT } from '@/lib/payment'

export default function PricingPage() {
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
              Pay a fixed monthly subscription based on your cart volume. First {FREE_CARTS_THRESHOLD} recovered carts free — then just {REVENUE_SHARE_PERCENT}% revenue share.
            </p>
          </div>

          {/* Plan Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
            {Object.values(PLANS).filter(p => p.id !== 'enterprise').map((plan) => {
              const isGrowth = plan.recommended

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

                  <div className="mb-6">
                    <span className="text-4xl font-bold text-white">₹{plan.price.toLocaleString('en-IN')}</span>
                    <span className="text-base text-blue-300/60 ml-1">/mo</span>
                  </div>

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
                    <span>After that, just <strong className="text-white">{REVENUE_SHARE_PERCENT}%</strong> of revenue recovered. We only make more when you do.</span>
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
