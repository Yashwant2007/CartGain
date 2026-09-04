'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BarChart3, ArrowRight, Lock, TrendingUp, ShoppingCart, Zap } from 'lucide-react'

// Single source of truth mirroring src/lib/payment.ts (PLANS). Keep these in
// sync whenever billing plan limits change.
const PLANS = [
  {
    name: 'Free',
    price: 0,
    yearlyPrice: 0,
    maxCarts: 50,
    revShare: 0,
    bargainSessions: 30,
    bargainDeals: 5,
  },
  {
    name: 'Growth',
    price: 1499,
    yearlyPrice: 14990,
    maxCarts: 750,
    revShare: 3.5,
    bargainSessions: 300,
    bargainDeals: 30,
    recommended: true,
  },
  {
    name: 'Pro',
    price: 3999,
    yearlyPrice: 39990,
    maxCarts: 3000,
    revShare: 3,
    bargainSessions: 1500,
    bargainDeals: 150,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    maxCarts: Infinity,
    revShare: 0,
    bargainSessions: Infinity,
    bargainDeals: Infinity,
  },
]

export default function ROICalculator({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [hasUsedFreeCalculation, setHasUsedFreeCalculation] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [hasDataEntered, setHasDataEntered] = useState(false)
  const [monthlyVisitors, setMonthlyVisitors] = useState<number | ''>(10000)
  const [avgCartValue, setAvgCartValue] = useState<number | ''>(800)
  const [currentRecoveryRate, setCurrentRecoveryRate] = useState<number | ''>(2)
  const [targetRecoveryRate, setTargetRecoveryRate] = useState<number | ''>(15)
  const [selectedPlan, setSelectedPlan] = useState<number>(1)

  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoggedIn) {
      const stored = localStorage.getItem('roiCalculatorUsed')
      setHasUsedFreeCalculation(!!stored)
    }
  }, [isLoggedIn])

  const handleCalculate = () => {
    if (monthlyVisitors && avgCartValue && currentRecoveryRate && targetRecoveryRate) {
      setShowResults(true)
      if (!isLoggedIn && !showResults) {
        localStorage.setItem('roiCalculatorUsed', 'true')
        setHasUsedFreeCalculation(true)
      }
    }
  }

  const handleInputChange = () => setHasDataEntered(true)

  const visitors = typeof monthlyVisitors === 'number' ? monthlyVisitors : 0
  const cartValue = typeof avgCartValue === 'number' ? avgCartValue : 0
  const currentRate = typeof currentRecoveryRate === 'number' ? currentRecoveryRate : 0
  const targetRate = typeof targetRecoveryRate === 'number' ? targetRecoveryRate : 0

  const plan = PLANS[selectedPlan]

  const abandonedCarts = Math.round(visitors * 0.7)
  const lostRevenue = abandonedCarts * cartValue
  const processedCarts = Math.min(abandonedCarts, plan.maxCarts === Infinity ? abandonedCarts : plan.maxCarts)
  // Carts CartGain will actually process on this plan — capped by the plan's
  // monthly cart allowance (Free 50 · Growth 750 · Pro 3,000 · Enterprise unlimited).
  const currentRecovered = Math.round(abandonedCarts * (currentRate / 100))
  const targetRecovered = Math.round(processedCarts * (targetRate / 100))
  const additionalRecovered = targetRecovered - currentRecovered

  const targetRecoveryRevenue = targetRecovered * cartValue
  const additionalRecoveryRevenue = targetRecoveryRevenue - currentRecovered * cartValue
  // Bargain: price-sensitive customers won't buy at list price but will accept
  // a negotiated deal. Contribution is capped by the plan's included bargain
  // sessions & accepted deals. We assume ~30% of processed carts reach a
  // bargain session and a realistic ~35% of those close at ~12% below list —
  // so each accepted deal still nets positive margin for the merchant.
  const bargainSessions = Math.min(
    plan.bargainSessions === Infinity ? Math.round(processedCarts * 0.3) : plan.bargainSessions,
    Math.round(processedCarts * 0.3),
  )
  const bargainDeals = Math.min(bargainSessions, plan.bargainDeals === Infinity ? bargainSessions : plan.bargainDeals)
  const acceptedDeals = Math.round(bargainDeals * 0.35)
  const bargainAvgDealValue = cartValue * 0.88
  const bargainRevenue = acceptedDeals * bargainAvgDealValue

  const subscriptionCost = typeof plan.price === 'number' ? plan.price : 0
  const revenueShareCost = Math.round((additionalRecoveryRevenue * plan.revShare) / 100)
  const totalMonthlyCost = subscriptionCost + revenueShareCost
  const netProfit = additionalRecoveryRevenue + bargainRevenue - totalMonthlyCost
  const roi = totalMonthlyCost > 0 ? Math.round((netProfit / totalMonthlyCost) * 100) : totalMonthlyCost === 0 && netProfit > 0 ? 999 : 0

  if (!isLoggedIn && hasUsedFreeCalculation && !showResults) {
    return (
      <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-blue-500/20">
        <Lock className="w-10 h-10 text-blue-400 mx-auto mb-3" />
        <h3 className="text-xl font-bold text-white mb-2 text-center">Continue Calculating</h3>
        <p className="text-blue-300/70 text-sm mb-5 max-w-sm mx-auto text-center">
          Sign up to unlock unlimited calculations and a personalized dashboard.
        </p>
        <div className="flex justify-center">
          <Link href="/signup" className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-xl hover:bg-blue-500 transition text-sm">
            Sign Up Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl border border-blue-500/20 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">ROI Calculator</h3>
              <p className="text-blue-100 text-xs">See your recovery potential</p>
            </div>
          </div>
          <span className="text-white/80 text-xs font-medium bg-white/10 px-2.5 py-1 rounded-md">INR ₹</span>
        </div>
      </div>

      <div className="p-5">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-blue-200/80 mb-1.5">Monthly Visitors</label>
            <input
              type="range" min="1000" max="100000" step="1000"
              value={monthlyVisitors || 0}
              onChange={(e) => { setMonthlyVisitors(Number(e.target.value)); handleInputChange() }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex items-center mt-1.5">
              <input
                type="number" value={monthlyVisitors} aria-label="Monthly Website Visitors"
                onChange={(e) => { setMonthlyVisitors(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                className="w-20 px-2 py-1.5 border border-blue-500/30 bg-slate-700/50 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={!isLoggedIn && showResults}
              />
              <span className="text-xs text-blue-300/60 ml-1.5">/mo</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-blue-200/80 mb-1.5">Avg Cart Value</label>
            <input
              type="range" min="100" max="5000" step="50"
              value={avgCartValue || 0}
              onChange={(e) => { setAvgCartValue(Number(e.target.value)); handleInputChange() }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex items-center mt-1.5">
              <span className="text-xs text-blue-300/60">₹</span>
              <input
                type="number" value={avgCartValue} aria-label="Average Cart Value"
                onChange={(e) => { setAvgCartValue(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                className="w-20 px-2 py-1.5 border border-blue-500/30 bg-slate-700/50 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ml-1"
                disabled={!isLoggedIn && showResults}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-blue-200/80 mb-1.5">Current Rate</label>
            <input
              type="range" min="0" max="10" step="0.5"
              value={currentRecoveryRate || 0}
              onChange={(e) => { setCurrentRecoveryRate(Number(e.target.value)); handleInputChange() }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex items-center mt-1.5">
              <input
                type="number" value={currentRecoveryRate} aria-label="Current recovery rate"
                onChange={(e) => { setCurrentRecoveryRate(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                step="0.5"
                className="w-20 px-2 py-1.5 border border-blue-500/30 bg-slate-700/50 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={!isLoggedIn && showResults}
              />
              <span className="text-xs text-blue-300/60 ml-1.5">%</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-blue-200/80 mb-1.5">Target Rate</label>
            <input
              type="range" min="5" max="25" step="0.5"
              value={targetRecoveryRate || 0}
              onChange={(e) => { setTargetRecoveryRate(Number(e.target.value)); handleInputChange() }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex items-center mt-1.5">
              <input
                type="number" value={targetRecoveryRate} aria-label="Target recovery rate"
                onChange={(e) => { setTargetRecoveryRate(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                step="0.5"
                className="w-20 px-2 py-1.5 border border-blue-500/30 bg-slate-700/50 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={!isLoggedIn && showResults}
              />
              <span className="text-xs text-blue-300/60 ml-1.5">%</span>
            </div>
          </div>
        </div>

        {/* Plan Selection */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-blue-200/80 mb-2">Select Plan</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PLANS.map((p, i) => (
              <button
                key={p.name}
                onClick={() => { setSelectedPlan(i); handleInputChange() }}
                className={`relative p-2.5 rounded-xl border transition-all text-center ${
                  selectedPlan === i
                    ? 'border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/10'
                    : 'border-slate-600/50 bg-slate-700/30 hover:border-slate-500'
                }`}
              >
                {p.recommended && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-cyan-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">Best</span>
                )}
                <div className={`text-xs font-bold ${selectedPlan === i ? 'text-blue-300' : 'text-white'}`}>{p.name}</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {typeof p.price === 'number' ? `₹${p.price.toLocaleString('en-IN')}` : p.price}
                </div>
                <div className="text-[10px] text-blue-300/50">
                  {typeof p.maxCarts === 'number' ? `${p.maxCarts.toLocaleString('en-IN')} carts` : 'Unlimited'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calculate Button */}
        <button
          onClick={handleCalculate}
          disabled={!hasDataEntered || (!isLoggedIn && showResults)}
          className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all ${
            !hasDataEntered || (!isLoggedIn && showResults)
              ? 'bg-slate-700/50 text-blue-300/40 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
          }`}
        >
          {isLoggedIn ? 'Calculate ROI' : showResults ? 'Free calculation used' : 'Calculate ROI'}
        </button>
        {!isLoggedIn && !showResults && hasDataEntered && (
          <p className="text-[10px] text-blue-300/50 text-center mt-1.5">One free calculation • Unlimited after signup</p>
        )}

        {/* Results */}
        {showResults && (
          <div className="mt-5 space-y-3 animate-in fade-in duration-300">
            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-700/40 rounded-xl p-3 border border-slate-600/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingCart className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-blue-300/60">Carts Processed</span>
                </div>
                <p className="text-lg font-bold text-white">{processedCarts.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-blue-300/40">on {plan.name} · {abandonedCarts.toLocaleString('en-IN')} abandoned/mo</p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                <span className="text-[10px] text-red-400/80">Lost Revenue</span>
                <p className="text-lg font-bold text-red-400">₹{lostRevenue.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-red-400/40">per month</p>
              </div>
            </div>

            {/* Revenue Gains */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400/80">Recovery Gain</span>
                </div>
                <p className="text-lg font-bold text-emerald-400">+₹{additionalRecoveryRevenue.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-emerald-400/40">+{additionalRecovered.toLocaleString('en-IN')} carts</p>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-3 border border-blue-500/20">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-blue-400/80">Bargain Gain</span>
                </div>
                <p className="text-lg font-bold text-blue-300">+₹{bargainRevenue.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-blue-400/40">{acceptedDeals.toLocaleString('en-IN')} accepted deals</p>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-slate-700/30 rounded-xl p-3 border border-slate-600/30">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3 h-3 text-blue-400" />
                <span className="text-xs font-medium text-blue-200/80">CartGain Cost</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-blue-300/60">{plan.name} subscription</span>
                  <span className="text-white">{subscriptionCost > 0 ? `₹${subscriptionCost.toLocaleString('en-IN')}/mo` : 'Free'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300/60">Revenue share
                    {plan.revShare > 0 ? ` (${plan.revShare}%, capped)` : ''}</span>
                  <span className="text-white">{revenueShareCost > 0 ? `₹${revenueShareCost.toLocaleString('en-IN')}/mo` : '₹0/mo'}</span>
                </div>
                <div className="flex justify-between border-t border-slate-600/30 pt-1.5">
                  <span className="text-blue-200/80 font-medium">Total cost</span>
                  <span className="text-white font-bold">{totalMonthlyCost > 0 ? `₹${totalMonthlyCost.toLocaleString('en-IN')}/mo` : '₹0/mo'}</span>
                </div>
              </div>
            </div>

            {/* Net Profit */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs">Net Monthly Gain</p>
                  <p className="text-2xl font-bold text-white mt-0.5">₹{netProfit.toLocaleString('en-IN')}</p>
                  <p className="text-blue-200/70 text-xs">+₹{additionalRecoveryRevenue.toLocaleString('en-IN')} recovery · +₹{bargainRevenue.toLocaleString('en-IN')} bargain</p>
                </div>
                <div className="bg-white/20 rounded-xl px-3 py-2 text-center">
                  <p className="text-blue-100 text-[10px]">ROI</p>
                  <p className="text-xl font-bold text-white">{roi === 999 ? '∞' : `${roi}%`}</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-slate-700/30 rounded-xl p-3 border border-slate-600/30 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-blue-300/60">Recovery rate improvement</span>
                <span className="text-emerald-400 font-semibold">+{(targetRate - currentRate).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-300/60">Additional carts recovered</span>
                <span className="text-emerald-400 font-semibold">+{additionalRecovered.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-300/60">Bargain sessions included</span>
                <span className="text-emerald-400 font-semibold">
                  {typeof plan.bargainSessions === 'number' ? plan.bargainSessions.toLocaleString('en-IN') : 'Unlimited'}
                </span>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center pt-1">
              <Link href="/signup" className="inline-flex items-center gap-1.5 bg-blue-600 text-white font-semibold py-2 px-5 rounded-xl hover:bg-blue-500 transition text-sm shadow-lg shadow-blue-500/20">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[10px] text-blue-300/40 mt-2">2-min setup • No credit card • First 50 carts free</p>
            </div>
          </div>
        )}

        {!isLoggedIn && showResults && (
          <div className="mt-5 p-4 bg-slate-700/30 border border-slate-600/30 rounded-xl text-center">
            <Lock className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <h4 className="font-semibold text-white text-sm mb-1">Want to adjust?</h4>
            <p className="text-xs text-blue-300/60 mb-3">Sign up for unlimited calculations.</p>
            <Link href="/signup" className="inline-flex items-center gap-1 bg-blue-600 text-white font-semibold py-1.5 px-4 rounded-lg hover:bg-blue-500 transition text-xs">
              Sign Up Free
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
