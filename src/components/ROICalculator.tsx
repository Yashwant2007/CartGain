'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BarChart3, ArrowRight, Lock, Globe, TrendingUp, ShoppingCart, MessageSquare, Zap } from 'lucide-react'

const PLANS = [
  { name: 'Starter', price: 999, yearlyPrice: 9990, maxCarts: 500, revShare: 3 },
  { name: 'Growth', price: 2999, yearlyPrice: 29990, maxCarts: 3000, revShare: 2.5, recommended: true },
  { name: 'Pro', price: 8999, yearlyPrice: 89990, maxCarts: 15000, revShare: 2 },
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

  const handleInputChange = () => {
    setHasDataEntered(true)
  }

  const visitors = typeof monthlyVisitors === 'number' ? monthlyVisitors : 0
  const cartValue = typeof avgCartValue === 'number' ? avgCartValue : 0
  const currentRate = typeof currentRecoveryRate === 'number' ? currentRecoveryRate : 0
  const targetRate = typeof targetRecoveryRate === 'number' ? targetRecoveryRate : 0

  const abandonmentRate = 0.7
  const abandonedCarts = Math.round(visitors * abandonmentRate)
  const currentRecovered = Math.round(abandonedCarts * (currentRate / 100))
  const targetRecovered = Math.round(abandonedCarts * (targetRate / 100))
  const additionalRecovered = targetRecovered - currentRecovered

  const lostRevenue = abandonedCarts * cartValue
  const currentRevenue = currentRecovered * cartValue
  const targetRevenue = targetRecovered * cartValue
  const additionalRevenue = targetRevenue - currentRevenue

  const plan = PLANS[selectedPlan]
  const subscriptionCost = plan.price
  const revenueShareCost = Math.round((targetRevenue * plan.revShare) / 100)
  const totalMonthlyCost = subscriptionCost + revenueShareCost

  const netProfit = additionalRevenue - totalMonthlyCost
  const yearlyNetProfit = netProfit * 12
  const roi = totalMonthlyCost > 0 ? Math.round((netProfit / totalMonthlyCost) * 100) : 0

  if (!isLoggedIn && hasUsedFreeCalculation && !showResults) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100">
        <Lock className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-gray-900 mb-3 text-center">Continue Calculating Your ROI</h3>
        <p className="text-gray-500 mb-6 max-w-md mx-auto text-center">
          You&apos;ve used your free calculation. Sign up to unlock unlimited calculations and get a personalized dashboard.
        </p>
        <div className="flex justify-center">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-8 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            Sign Up Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
        <p className="text-sm text-gray-400 mt-4 text-center">No credit card required</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">ROI Calculator</h3>
              <p className="text-indigo-100 text-sm">See your potential revenue recovery</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
            <Globe className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-medium">INR (₹)</span>
          </div>
        </div>
      </div>

      <div className="p-8">
        {/* Input Controls */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Monthly Website Visitors
            </label>
            <input
              type="range"
              min="1000"
              max="100000"
              step="1000"
              value={monthlyVisitors || 0}
              onChange={(e) => { setMonthlyVisitors(Number(e.target.value)); handleInputChange() }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex justify-between items-center mt-2">
              <input
                type="number"
                value={monthlyVisitors}
                aria-label="Monthly Website Visitors"
                onChange={(e) => { setMonthlyVisitors(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                className="w-28 px-3 py-2 border border-gray-200 bg-gray-50 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={!isLoggedIn && showResults}
              />
              <span className="text-sm text-gray-500">visitors/mo</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Average Cart Value
            </label>
            <input
              type="range"
              min="100"
              max="5000"
              step="50"
              value={avgCartValue || 0}
              onChange={(e) => { setAvgCartValue(Number(e.target.value)); handleInputChange() }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-2">₹</span>
                <input
                  type="number"
                  value={avgCartValue}
                  aria-label="Average Cart Value"
                  onChange={(e) => { setAvgCartValue(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                  className="w-28 px-3 py-2 border border-gray-200 bg-gray-50 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  disabled={!isLoggedIn && showResults}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Current Recovery Rate
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={currentRecoveryRate || 0}
              onChange={(e) => { setCurrentRecoveryRate(Number(e.target.value)); handleInputChange() }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex justify-between items-center mt-2">
              <input
                type="number"
                value={currentRecoveryRate}
                aria-label="Current recovery rate"
                onChange={(e) => { setCurrentRecoveryRate(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                step="0.5"
                className="w-28 px-3 py-2 border border-gray-200 bg-gray-50 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={!isLoggedIn && showResults}
              />
              <span className="text-sm text-gray-500">% without CartGain</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Target Recovery Rate
            </label>
            <input
              type="range"
              min="5"
              max="25"
              step="0.5"
              value={targetRecoveryRate || 0}
              onChange={(e) => { setTargetRecoveryRate(Number(e.target.value)); handleInputChange() }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              disabled={!isLoggedIn && showResults}
            />
            <div className="flex justify-between items-center mt-2">
              <input
                type="number"
                value={targetRecoveryRate}
                aria-label="Target recovery rate"
                onChange={(e) => { setTargetRecoveryRate(e.target.value ? Number(e.target.value) : ''); handleInputChange() }}
                step="0.5"
                className="w-28 px-3 py-2 border border-gray-200 bg-gray-50 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={!isLoggedIn && showResults}
              />
              <span className="text-sm text-gray-500">% with CartGain</span>
            </div>
          </div>
        </div>

        {/* Plan Selection */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-700 mb-3">Select Plan</label>
          <div className="grid grid-cols-3 gap-3">
            {PLANS.map((p, i) => (
              <button
                key={p.name}
                onClick={() => { setSelectedPlan(i); handleInputChange() }}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  selectedPlan === i
                    ? 'border-indigo-600 bg-indigo-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                {p.recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
                <div className={`text-sm font-bold ${selectedPlan === i ? 'text-indigo-600' : 'text-gray-900'}`}>
                  {p.name}
                </div>
                <div className="text-lg font-bold text-gray-900 mt-1">₹{p.price.toLocaleString('en-IN')}</div>
                <div className="text-xs text-gray-500">/month</div>
                <div className="text-xs text-gray-400 mt-1">{p.revShare}% rev share</div>
              </button>
            ))}
          </div>
        </div>

        {/* Calculate Button */}
        <div className="mb-8">
          <button
            onClick={handleCalculate}
            disabled={!hasDataEntered || (!isLoggedIn && showResults)}
            className={`w-full py-4 px-6 rounded-xl font-semibold transition-all ${
              !hasDataEntered || (!isLoggedIn && showResults)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 hover:shadow-xl'
            }`}
          >
            {isLoggedIn ? 'Calculate My ROI' : showResults ? 'Free calculation used' : 'Calculate ROI (Free)'}
          </button>
          {!isLoggedIn && !showResults && hasDataEntered && (
            <p className="text-xs text-gray-400 text-center mt-2">One free calculation. Unlimited after signup!</p>
          )}
        </div>

        {/* Results Section */}
        {showResults && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">Abandoned Carts</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{abandonedCarts.toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-400 mt-1">per month</p>
              </div>

              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-red-500">Lost Revenue</span>
                </div>
                <p className="text-2xl font-bold text-red-600">₹{lostRevenue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-red-400 mt-1">per month</p>
              </div>

              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-amber-600">Currently Recovering</span>
                </div>
                <p className="text-2xl font-bold text-amber-600">₹{currentRevenue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-amber-500 mt-1">{currentRecovered.toLocaleString('en-IN')} carts/mo</p>
              </div>

              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600">Additional Revenue</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">+₹{additionalRevenue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-emerald-500 mt-1">+{additionalRecovered.toLocaleString('en-IN')} carts/mo</p>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="bg-gray-50 rounded-xl p-6 mb-6 border border-gray-100">
              <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                CartGain Cost Breakdown
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{plan.name} Subscription</span>
                  <span className="font-semibold text-gray-900">₹{subscriptionCost.toLocaleString('en-IN')}/mo</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Revenue Share ({plan.revShare}% of ₹{targetRevenue.toLocaleString('en-IN')})</span>
                  <span className="font-semibold text-gray-900">₹{revenueShareCost.toLocaleString('en-IN')}/mo</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Total Monthly Cost</span>
                  <span className="text-lg font-bold text-gray-900">₹{totalMonthlyCost.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Net Profit Card */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm font-medium">Net Monthly Profit</p>
                  <p className="text-4xl font-bold mt-1">₹{netProfit.toLocaleString('en-IN')}</p>
                  <p className="text-indigo-200 text-sm mt-2">
                    Yearly: ₹{yearlyNetProfit.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <div className="bg-white/20 rounded-xl px-4 py-3">
                    <p className="text-indigo-100 text-sm">ROI</p>
                    <p className="text-3xl font-bold">{roi}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-6 mb-6 border border-gray-100">
              <h4 className="font-semibold text-gray-900 mb-4">Recovery Summary</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Carts recovered currently (email only)</span>
                  <span className="font-semibold text-gray-900">{currentRecovered.toLocaleString('en-IN')} carts/mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Carts you could recover with CartGain</span>
                  <span className="font-semibold text-emerald-600">{targetRecovered.toLocaleString('en-IN')} carts/mo</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-3">
                  <span className="font-semibold text-gray-900">Additional carts recovered</span>
                  <span className="font-bold text-emerald-600">+{additionalRecovered.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-900">Recovery rate improvement</span>
                  <span className="font-bold text-indigo-600">+{(targetRate - currentRate).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-8 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
              >
                Start Your Free Trial
                <ArrowRight className="w-5 h-5" />
              </Link>
              <p className="text-sm text-gray-400 mt-3">2-minute setup • No credit card required • First 50 carts free</p>
            </div>
          </div>
        )}

        {!isLoggedIn && showResults && (
          <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <Lock className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
            <h4 className="font-semibold text-gray-900 mb-2">Want to adjust calculations?</h4>
            <p className="text-sm text-gray-500 mb-4">
              Sign up to unlock unlimited calculations and save your data.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-indigo-700 transition-all text-sm"
            >
              Sign Up Free
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
