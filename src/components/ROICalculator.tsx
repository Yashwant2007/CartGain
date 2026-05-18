'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BarChart3, ArrowRight, Lock, Globe } from 'lucide-react'

const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee', code: 'INR' },
}

export default function ROICalculator({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [hasUsedFreeCalculation, setHasUsedFreeCalculation] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [hasDataEntered, setHasDataEntered] = useState(false)
  const [currency, setCurrency] = useState<keyof typeof CURRENCIES>('INR')
  const [monthlyVisitors, setMonthlyVisitors] = useState<number | ''>(5000)
  const [avgCartValue, setAvgCartValue] = useState<number | ''>(75)
  const [currentRecoveryRate, setCurrentRecoveryRate] = useState<number | ''>(3)
  const [targetRecoveryRate, setTargetRecoveryRate] = useState<number | ''>(14)

  // Load free calculation status
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
        localStorage.setItem('preferredCurrency', currency)
        setHasUsedFreeCalculation(true)
      }
    }
  }

  const handleInputChange = () => {
    setHasDataEntered(true)
  }

  const handleCurrencyChange = (newCurrency: keyof typeof CURRENCIES) => {
    setCurrency(newCurrency)
    localStorage.setItem('preferredCurrency', newCurrency)
  }

  // Calculations (only calculate if all values are entered)
  const visitors = typeof monthlyVisitors === 'number' ? monthlyVisitors : 0
  const cartValue = typeof avgCartValue === 'number' ? avgCartValue : 0
  const currentRate = typeof currentRecoveryRate === 'number' ? currentRecoveryRate : 0
  const targetRate = typeof targetRecoveryRate === 'number' ? targetRecoveryRate : 0

  const abandonmentRate = 0.7 // 70% abandon
  const abandonedCarts = Math.round(visitors * abandonmentRate)
  const currentRecovered = Math.round(abandonedCarts * (currentRate / 100))
  const targetRecovered = Math.round(abandonedCarts * (targetRate / 100))
  const additionalRecovered = targetRecovered - currentRecovered
  
  const lostRevenue = abandonedCarts * cartValue
  const currentRevenue = currentRecovered * cartValue
  const targetRevenue = targetRecovered * cartValue
  const additionalRevenue = targetRevenue - currentRevenue
  
  // Cost calculation (assuming $0.02 per SMS, 2-3 reminders per cart)
  const costPerCart = 0.02 * 2.5 // average 2.5 messages
  const monthlyCost = Math.round(abandonedCarts * costPerCart)
  
  const netProfit = additionalRevenue - monthlyCost
  const roi = monthlyCost > 0 ? Math.round((netProfit / monthlyCost) * 100) : 0

  // Show limited state after free calculation is used
  if (!isLoggedIn && hasUsedFreeCalculation && !showResults) {
    return (
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-8 shadow-2xl border border-blue-700/30 backdrop-blur-md">
        <Lock className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-white mb-3 text-center">Continue Calculating Your ROI</h3>
        <p className="text-blue-300/80 mb-6 max-w-md mx-auto text-center">
          You've used your free calculation! Sign up to unlock unlimited calculations, save your data, and get a personalized dashboard.
        </p>
        <div className="flex justify-center">
          <Link
            href="/signup"
            className="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-8 rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all border border-cyan-400/50"
          >
            Sign Up Free
            <ArrowRight className="inline ml-2 w-5 h-5" />
          </Link>
        </div>
        <p className="text-sm text-blue-300/70 mt-4 text-center">💳 No credit card required</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-8 shadow-2xl border border-blue-700/30 backdrop-blur-md">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-cyan-400" />
          Your CartGain ROI Calculator
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-300" />
            <span className="px-3 py-2 border border-blue-700/50 bg-slate-700/50 text-white rounded-lg text-sm font-medium">
              INR - Indian Rupee
            </span>
          </div>
          {!isLoggedIn && showResults && (
            <span className="text-xs bg-cyan-400/20 text-cyan-300 border border-cyan-400/50 px-3 py-1 rounded- la rounded-full font-medium">
              1 free calculation used
            </span>
          )}
        </div>
      </div>

      {/* Input Controls */}
      <div className="grid md:grid-cols-2 gap-8 mb-10">
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Monthly Website Visitors
          </label>
          <input
            type="range"
            min="100"
            max="100000"
            step="100"
            value={monthlyVisitors || 0}
            onChange={(e) => {setMonthlyVisitors(Number(e.target.value)); handleInputChange()}}
            className="w-full accent-cyan-400"
            disabled={!isLoggedIn && showResults}
          />
          <div className="flex justify-between items-center mt-2">
            <input
              type="number"
              value={monthlyVisitors}
              onChange={(e) => {setMonthlyVisitors(e.target.value ? Number(e.target.value) : ''); handleInputChange()}}
              className="w-24 px-3 py-2 border border-blue-700/50 bg-slate-700/50 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              disabled={!isLoggedIn && showResults}
            />
            <span className="text-sm text-blue-300/70">visitors/month</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Average Cart Value
          </label>
          <input
            type="range"
            min="10"
            max="500"
            step="5"
            value={avgCartValue || 0}
            onChange={(e) => {setAvgCartValue(Number(e.target.value)); handleInputChange()}}
            className="w-full accent-cyan-400"
            disabled={!isLoggedIn && showResults}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm text-blue-300/70">{CURRENCIES[currency].symbol}</span>
            <input
              type="number"
              value={avgCartValue}
              onChange={(e) => {setAvgCartValue(e.target.value ? Number(e.target.value) : ''); handleInputChange()}}
              className="w-24 px-3 py-2 border border-blue-700/50 bg-slate-700/50 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              disabled={!isLoggedIn && showResults}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Current Recovery Rate (Email Only)
          </label>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={currentRecoveryRate || 0}
            onChange={(e) => {setCurrentRecoveryRate(Number(e.target.value)); handleInputChange()}}
            className="w-full accent-cyan-400"
            disabled={!isLoggedIn && showResults}
          />
          <div className="flex justify-between items-center mt-2">
            <input
              type="number"
              value={currentRecoveryRate}
              onChange={(e) => {setCurrentRecoveryRate(e.target.value ? Number(e.target.value) : ''); handleInputChange()}}
              step="0.5"
              className="w-24 px-3 py-2 border border-blue-700/50 bg-slate-700/50 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              disabled={!isLoggedIn && showResults}
            />
            <span className="text-sm text-blue-300/70">%</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Target Recovery Rate (With CartGain)
          </label>
          <input
            type="range"
            min="5"
            max="25"
            step="0.5"
            value={targetRecoveryRate || 0}
            onChange={(e) => {setTargetRecoveryRate(Number(e.target.value)); handleInputChange()}}
            className="w-full accent-cyan-400"
            disabled={!isLoggedIn && showResults}
          />
          <div className="flex justify-between items-center mt-2">
            <input
              type="number"
              value={targetRecoveryRate}
              onChange={(e) => {setTargetRecoveryRate(e.target.value ? Number(e.target.value) : ''); handleInputChange()}}
              step="0.5"
              className="w-24 px-3 py-2 border border-blue-700/50 bg-slate-700/50 text-white rounded text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
              disabled={!isLoggedIn && showResults}
            />
            <span className="text-sm text-blue-300/70">%</span>
          </div>
        </div>
      </div>

      {/* Calculate Button */}
      <div className="mb-8">
        <button
          onClick={handleCalculate}
          disabled={!hasDataEntered || (!isLoggedIn && showResults)}
          className={`w-full py-4 px-6 rounded-lg font-semibold transition-all transform hover:scale-105 ${
            !hasDataEntered || (!isLoggedIn && showResults)
              ? 'bg-slate-700/50 text-blue-300/50 cursor-not-allowed border border-slate-600/50'
              : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-xl hover:shadow-cyan-500/50 border border-cyan-400/50'
          }`}
        >
          {isLoggedIn ? '✨ Calculate My ROI' : showResults ? '✅ Free calculation used' : '📊 Calculate ROI (Free)'}
        </button>
        {!isLoggedIn && !showResults && hasDataEntered && (
          <p className="text-xs text-cyan-300/70 text-center mt-2">👆 Get one free calculation. Unlimited access after signup!</p>
        )}
      </div>

      {/* Results Section - Only show after clicking Calculate */}
      {showResults && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 hover:border-blue-500/50 transition-all">
              <p className="text-sm text-blue-300/70">Abandoned Carts/Month</p>
              <p className="text-3xl font-bold text-cyan-300 mt-2">{abandonedCarts.toLocaleString('en-US')}</p>
            </div>

            <div className="bg-red-950/30 rounded-lg p-4 border border-red-700/50 hover:border-red-500/70 transition-all">
              <p className="text-sm text-red-400 font-medium">💸 Revenue Currently Lost</p>
              <p className="text-3xl font-bold text-red-300 mt-2">{CURRENCIES[currency].symbol}{(abandonedCarts * (typeof avgCartValue === 'number' ? avgCartValue : 0)).toLocaleString('en-US')}</p>
            </div>

            <div className="bg-amber-950/30 rounded-lg p-4 border border-amber-700/50 hover:border-amber-500/70 transition-all">
              <p className="text-sm text-amber-400 font-medium">📦 Currently Recovered</p>
              <p className="text-3xl font-bold text-amber-300 mt-2">{CURRENCIES[currency].symbol}{currentRevenue.toLocaleString('en-US')}</p>
            </div>

            <div className="bg-emerald-950/30 rounded-lg p-4 border border-emerald-700/50 hover:border-emerald-500/70 transition-all">
              <p className="text-sm text-emerald-400 font-medium">🚀 Additional with CartGain</p>
              <p className="text-3xl font-bold text-emerald-300 mt-2">+{CURRENCIES[currency].symbol}{additionalRevenue.toLocaleString('en-US')}/mo</p>
            </div>

            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 hover:border-cyan-500/50 transition-all">
              <p className="text-sm text-blue-300/70">💳 CartGain Monthly Cost</p>
              <p className="text-3xl font-bold text-cyan-300 mt-2">~{CURRENCIES[currency].symbol}{monthlyCost.toLocaleString('en-US')}</p>
            </div>

            <div className="bg-gradient-to-br from-cyan-600/40 to-blue-600/40 border border-cyan-500/50 rounded-lg p-4 text-white hover:border-cyan-400 transition-all">
              <p className="text-sm text-cyan-200 opacity-90 font-medium">💰 NET PROFIT/MONTH</p>
              <p className="text-3xl font-bold text-cyan-100 mt-2">{CURRENCIES[currency].symbol}{Math.max(0, netProfit).toLocaleString('en-US')}</p>
              <p className="text-sm text-cyan-200 opacity-75 mt-2">📈 ROI: {roi}:1</p>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-8 p-6 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 rounded-lg">
            <h4 className="font-semibold text-cyan-200 mb-3">📊 Your Recovery Potential ({currency})</h4>
            <div className="space-y-2 text-sm text-blue-200">
              <p className="flex justify-between">
                <span>Carts recovered currently (email only):</span>
                <span className="font-semibold text-cyan-300">{currentRecovered.toLocaleString('en-US')} carts/mo</span>
              </p>
              <p className="flex justify-between">
                <span>Carts you could recover with CartGain:</span>
                <span className="font-semibold text-emerald-300">{targetRecovered.toLocaleString('en-US')} carts/mo</span>
              </p>
              <p className="flex justify-between border-t border-cyan-400/20 pt-2 mt-2">
                <span className="font-semibold">Additional carts recovered:</span>
                <span className="font-bold text-emerald-300">+{additionalRecovered.toLocaleString('en-US')}</span>
              </p>
              <p className="flex justify-between">
                <span className="font-semibold">Yearly profit potential:</span>
                <span className="font-bold text-cyan-300">{CURRENCIES[currency].symbol}{(netProfit * 12).toLocaleString('en-US')}</span>
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/signup"
              className="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 px-8 rounded-lg hover:shadow-xl hover:shadow-cyan-500/50 transition-all border border-cyan-400/50"
            >
              Start Your Free Trial
              <ArrowRight className="inline ml-2 w-5 h-5" />
            </Link>
            <p className="text-sm text-blue-300/70 mt-3">⏱️ 2-minute setup • 💳 No credit card required • 🎁 First cart free</p>
          </div>
        </div>
      )}

      {!isLoggedIn && showResults && (
        <div className="mt-8 p-6 bg-blue-950/50 border border-blue-600/50 rounded-lg text-center">
          <Lock className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
          <h4 className="font-semibold text-white mb-2">Want to adjust calculations?</h4>
          <p className="text-sm text-blue-300/80 mb-4">
            Sign up to unlock unlimited calculations and save your data.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-2 px-6 rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all text-sm border border-cyan-400/50"
          >
            Sign Up Free
          </Link>
        </div>
      )}
    </div>
  )
}

