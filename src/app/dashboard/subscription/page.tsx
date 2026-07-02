'use client'

import { useEffect, useState } from 'react'
import { Check, Shield, Percent, Zap, FileText, Download } from 'lucide-react'
import { PLANS, FREE_CARTS_THRESHOLD } from '@/lib/payment'

type SubscriptionData = {
  id: string
  plan: string
  status: string
  smsCredits: number
  smsCreditsUsed: number
  revenueShareAccrued: number
  revenueSharePaid: number
  currentPeriodEnd: string
}

type StoreData = {
  id: string
  name: string
  currency: string
}

type InvoiceData = {
  id: string
  amount: number
  status: string
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt: string | null
  createdAt: string
}

type PlanKey = keyof typeof PLANS

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [invoices, setInvoices] = useState<InvoiceData[]>([])
  const [loading, setLoading] = useState(true)
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null)
  const [totalRecoveredCarts, setTotalRecoveredCarts] = useState(0)
  const [monthlyRecoveredRevenue, setMonthlyRecoveredRevenue] = useState(0)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const [subRes, overviewRes] = await Promise.all([
        fetch('/api/subscription'),
        fetch('/api/analytics/overview'),
      ])

      if (subRes.ok) {
        const subData = await subRes.json()
        setSubscription(subData.subscription)
        setStore(subData.store)
        setInvoices(subData.invoices || [])
      }

      if (overviewRes.ok) {
        const overviewData = await overviewRes.json()
        const current = overviewData?.current?.overview
        if (current) {
          setTotalRecoveredCarts(current.cartsRecovered ?? 0)
          setMonthlyRecoveredRevenue(current.netRevenue ?? current.revenueRecovered ?? 0)
        }
      }
    } catch (err) {
      console.error('Failed to load subscription data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).Razorpay) {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => setRazorpayLoaded(true)
      document.body.appendChild(script)
    } else {
      setRazorpayLoaded(true)
    }
  }, [])

  const PAID_PLANS = Object.values(PLANS).filter(p => p.price > 0).map(p => p.id)
  const isPaidUser = !!(subscription && PAID_PLANS.includes(subscription.plan) && subscription.status === 'active')
  const isFreeUser = !subscription || subscription.plan === 'free' || !PAID_PLANS.includes(subscription.plan)

  const currentPlanKey = isPaidUser
    ? (subscription!.plan.toLowerCase() as PlanKey)
    : null
  const normalizedKey = currentPlanKey
    ? (Object.keys(PLANS).find(k => PLANS[k].id === currentPlanKey) as PlanKey)
    : null
  const currentPlan = normalizedKey ? PLANS[normalizedKey] : null

  const isYearly = subscription?.currentPeriodEnd
    ? (new Date(subscription.currentPeriodEnd).getTime() - Date.now()) > 45 * 24 * 60 * 60 * 1000
    : false

  const cartsUsed = totalRecoveredCarts
  const freeCartsRemaining = Math.max(0, FREE_CARTS_THRESHOLD - cartsUsed)
  const revShareCarts = Math.max(0, cartsUsed - FREE_CARTS_THRESHOLD)
  const avgCartValue = monthlyRecoveredRevenue > 0 && cartsUsed > 0 ? Math.round(monthlyRecoveredRevenue / cartsUsed) : 1000
  const revSharePercent = currentPlan ? currentPlan.revSharePercent : 0
  const estimatedRevShare = revShareCarts * avgCartValue * (revSharePercent / 100)

  const handlePurchase = async (planKey: PlanKey) => {
    if (!razorpayLoaded) return
    setProcessing(planKey)

    try {
      const plan = PLANS[planKey]
      if (!plan || plan.price === 0) return

      const res = await fetch('/api/payment/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, period: billing }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create subscription')

      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'CartGain',
        description: `${plan.name} Plan - ${billing === 'yearly' ? 'Yearly' : 'Monthly'}`,
        handler: (response: any) => {
          setPurchaseSuccess(plan.name)
          // Refetch data instead of reloading the page — reload breaks inside
          // a Shopify admin iframe and is jarring UX regardless.
          setTimeout(() => { fetchData() }, 2000)
        },
        prefill: { 
          name: '', 
          email: '', 
          contact: '' 
        },
        theme: { color: '#22D3EE' },
        modal: {
          ondismiss: function() {
            setProcessing(null)
          }
        }
      }

      const razorpay = new (window as any).Razorpay(options)
      razorpay.open()
    } catch (error) {
      console.error('Payment error:', error)
      alert('Payment failed. Please try again.')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-blue-300/80 text-sm">Loading subscription...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Success Overlay */}
      {purchaseSuccess && (
        <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-xl p-6 backdrop-blur-sm text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-bold text-white mb-2">Welcome to {purchaseSuccess}!</h2>
          <p className="text-sm text-emerald-300/80 mb-3">Your payment was successful. Recovery will continue without interruption.</p>
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-blue-300/60 mt-3">Refreshing your plan details...</p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Subscription</h1>
        <p className="text-blue-300/80 mt-1 text-sm">Choose a plan that fits your store size</p>
      </div>

      {/* Current Plan + Revenue Share Meter */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              {isPaidUser && currentPlan ? (
                <>
                  <h2 className="text-lg font-semibold text-white">{currentPlan.name}</h2>
                  <p className="text-sm text-blue-300/60">
                    {isYearly ? `₹${currentPlan.yearlyPrice.toLocaleString('en-IN')}/yr` : `₹${currentPlan.price.toLocaleString('en-IN')}/mo`}
                    {subscription?.currentPeriodEnd && (
                      <> &middot; Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}</>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white">Free Trial</h2>
                  <p className="text-sm text-blue-300/60">
                    {freeCartsRemaining > 0
                      ? `${freeCartsRemaining} of ${FREE_CARTS_THRESHOLD} free carts remaining`
                      : 'Free carts exhausted — pick a plan to continue'}
                  </p>
                </>
              )}
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${
            isPaidUser
              ? 'bg-emerald-600/40 text-emerald-300 border-emerald-500/40'
              : 'bg-amber-600/40 text-amber-300 border-amber-500/40'
          }`}>
            {isPaidUser ? 'Active' : freeCartsRemaining > 0 ? 'Trial' : 'Trial Exhausted'}
          </span>
        </div>

        {/* Free Carts Progress (free users only) */}
        {!isPaidUser && (
          <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <p className="text-sm text-blue-300/80 font-medium">Free Recovery Trial</p>
              </div>
              <p className="text-sm text-blue-300/60">
                {Math.min(cartsUsed, FREE_CARTS_THRESHOLD)} / {FREE_CARTS_THRESHOLD} carts
              </p>
            </div>
            <div className="w-full bg-slate-600/50 rounded-full h-3 mb-1">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-full h-3 transition-all duration-500"
                style={{ width: `${Math.min((cartsUsed / FREE_CARTS_THRESHOLD) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-blue-300/60 mt-2">
              {freeCartsRemaining > 0
                ? `${freeCartsRemaining} more carts recovered at 0% revenue share`
                : `50 free carts used. Revenue share is now active on recovered revenue.`}
            </p>
          </div>
        )}

        {/* Plan Usage (paid users only) */}
        {isPaidUser && currentPlan && (
          <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <p className="text-sm text-blue-300/80 font-medium">Monthly Cart Usage</p>
              </div>
              <p className="text-sm text-blue-300/60">
                {cartsUsed.toLocaleString('en-IN')} / {currentPlan.maxCarts === Infinity ? 'Unlimited' : currentPlan.maxCarts.toLocaleString('en-IN')} carts
              </p>
            </div>
            {currentPlan.maxCarts < Infinity && (
              <>
                <div className="w-full bg-slate-600/50 rounded-full h-3 mb-1">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full h-3 transition-all duration-500"
                    style={{ width: `${Math.min((cartsUsed / currentPlan.maxCarts) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-blue-300/60 mt-2">
                  {currentPlan.revSharePercent}% revenue share on recovered revenue
                </p>
              </>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-xs text-blue-300/60">Carts Recovered (All Time)</p>
            <p className="text-xl font-bold text-white mt-1">{cartsUsed.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-xs text-blue-300/60">Revenue Recovered</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">₹{monthlyRecoveredRevenue.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-xs text-blue-300/60">Rev Share Carts</p>
            <p className="text-xl font-bold text-white mt-1">{revShareCarts.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-xs text-blue-300/60">Rev Share Accrued</p>
            <p className="text-xl font-bold text-cyan-400 mt-1">₹{Math.round((subscription?.revenueShareAccrued ?? estimatedRevShare)).toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {/* Usage Warning (paid users only) */}
      {isPaidUser && currentPlan && currentPlan.maxCarts < Infinity && totalRecoveredCarts > 0 && (
        (() => {
          const estimatedProcessed = Math.round(totalRecoveredCarts / 0.20)
          const usagePercent = Math.min(100, (estimatedProcessed / currentPlan.maxCarts) * 100)
          if (usagePercent < 60) return null

          const nextPlan = Object.values(PLANS).find(p => p.price > currentPlan.price && p.id !== 'enterprise')
          const isUrgent = usagePercent >= 90

          return (
            <div className={`rounded-xl p-5 border backdrop-blur-sm ${
              isUrgent
                ? 'bg-red-900/20 border-red-500/40'
                : 'bg-amber-900/20 border-amber-500/40'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    {isUrgent ? 'Plan limit nearly reached' : 'Approaching plan limit'}
                  </h3>
                  <p className="text-xs text-blue-300/70">
                    Estimated cart processing: {estimatedProcessed.toLocaleString('en-IN')} of {currentPlan.maxCarts.toLocaleString('en-IN')} ({Math.round(usagePercent)}%).
                    {nextPlan ? ` Upgrade to ${nextPlan.name} to keep recovering without interruption.` : ''}
                  </p>
                </div>
                {nextPlan && (
                  <button
                    onClick={() => {
                      const nextKey = Object.keys(PLANS).find(k => PLANS[k].id === nextPlan.id) as PlanKey
                      handlePurchase(nextKey)
                    }}
                    disabled={processing !== null}
                    className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      isUrgent
                        ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/50'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/50'
                    } ${processing ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    Upgrade to {nextPlan.name}
                  </button>
                )}
              </div>
            </div>
          )
        })()
      )}

      {/* How Pricing Works */}
      <div className="bg-gradient-to-r from-slate-800/50 to-blue-900/30 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-start space-x-4">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Percent className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Simple, transparent pricing</h3>
            <div className="space-y-2 text-sm text-blue-300/80">
              <p className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>Pay a fixed monthly subscription based on your cart volume</span>
              </p>
              <p className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>First <strong className="text-white">{FREE_CARTS_THRESHOLD} recovered carts</strong> — zero revenue share. We prove our value first.</span>
              </p>
              <p className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>Revenue share: <strong className="text-white">3% Starter</strong> / <strong className="text-white">2.5% Growth</strong> / <strong className="text-white">2% Pro</strong>. Lower rates on higher plans.</span>
              </p>
              <p className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>No hidden fees, no per-message charges, no setup costs</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoices Section */}
      {isPaidUser && (
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Revenue Share & Invoices</h2>
                <p className="text-sm text-blue-300/60">
                  {subscription?.revenueShareAccrued && subscription.revenueShareAccrued > 0
                    ? `₹${Math.round(subscription.revenueShareAccrued).toLocaleString('en-IN')} accrued, ₹${Math.round(subscription.revenueSharePaid).toLocaleString('en-IN')} paid`
                    : 'No revenue share accrued yet'}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                setGeneratingInvoice(true)
                setInvoiceMsg(null)
                try {
                  const res = await fetch('/api/invoices', { method: 'POST' })
                  const data = await res.json()
                  if (res.ok) {
                    setInvoiceMsg('Invoice generated successfully')
                    setInvoices(prev => [data.invoice, ...prev])
                  } else {
                    setInvoiceMsg(data.error || 'Failed to generate invoice')
                  }
                } catch {
                  setInvoiceMsg('Failed to generate invoice')
                } finally {
                  setGeneratingInvoice(false)
                }
              }}
              disabled={generatingInvoice || !subscription?.revenueShareAccrued || subscription.revenueShareAccrued < 100}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                subscription?.revenueShareAccrued && subscription.revenueShareAccrued >= 100
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                  : 'bg-slate-600/50 text-blue-300/40 cursor-not-allowed'
              } ${generatingInvoice ? 'opacity-50 cursor-wait' : ''}`}
            >
              {generatingInvoice ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>

          {invoiceMsg && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
              invoiceMsg.includes('successfully')
                ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
            }`}>
              {invoiceMsg}
            </div>
          )}

          {invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-blue-300/60 border-b border-blue-700/20">
                    <th className="pb-3 font-medium">Period</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-blue-700/10">
                      <td className="py-3 text-white">
                        {new Date(inv.periodStart).toLocaleDateString('en-IN')} - {new Date(inv.periodEnd).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 text-white font-medium">₹{inv.amount.toLocaleString('en-IN')}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          inv.status === 'paid'
                            ? 'bg-emerald-600/30 text-emerald-300'
                            : inv.status === 'pending'
                            ? 'bg-amber-600/30 text-amber-300'
                            : 'bg-red-600/30 text-red-300'
                        }`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 text-blue-300/80">{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-blue-300/50 text-center py-6">No invoices yet. Revenue share invoices will appear here once accrued.</p>
          )}
        </div>
      )}

      {/* Plan Comparison */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <h2 className="text-lg font-semibold text-white">Choose your plan</h2>
          <div className="inline-flex items-center gap-2 bg-slate-700/50 border border-blue-700/30 p-0.5 rounded-full">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                billing === 'monthly'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-blue-300/60 hover:text-blue-300'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                billing === 'yearly'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-blue-300/60 hover:text-blue-300'
              }`}
            >
              Yearly
              <span className="ml-1.5 text-xs bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">Save 17%</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.values(PLANS).filter(p => p.id !== 'enterprise').map((plan) => {
            const isCurrent = isPaidUser && currentPlan?.id === plan.id
            const isGrowth = plan.recommended
            const displayPrice = billing === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.price
            const period = billing === 'yearly' ? '/mo billed yearly' : '/mo'

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl p-6 flex flex-col ${
                  isGrowth
                    ? 'bg-gradient-to-b from-slate-700/60 to-slate-800/60 border-2 border-amber-500/50'
                    : isCurrent
                    ? 'bg-slate-700/40 border border-cyan-500/40'
                    : 'bg-slate-700/40 border border-blue-700/30'
                }`}
              >
                {isGrowth && (
                  <span className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full">
                    Recommended
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-4 px-3 py-1 bg-cyan-600 text-white text-xs font-bold rounded-full">
                    Current
                  </span>
                )}

                <h3 className="text-lg font-semibold text-white mb-1">{plan.name}</h3>
                <p className="text-xs text-blue-300/60 mb-3">
                  Up to {plan.maxCarts === Infinity ? 'unlimited' : plan.maxCarts.toLocaleString('en-IN')} carts/mo
                </p>

                <div className="mb-1">
                  <span className="text-3xl font-bold text-white">₹{displayPrice.toLocaleString('en-IN')}</span>
                  <span className="text-base text-blue-300/60 ml-1">{period}</span>
                </div>
                <p className="text-xs text-emerald-400/80 mb-1">
                  Recover <strong>₹{plan.estimatedRecovery.min.toLocaleString('en-IN')}-{plan.estimatedRecovery.max.toLocaleString('en-IN')}</strong>/mo typically
                </p>
                <p className="text-xs text-blue-300/40 mb-4">
                  + {plan.revSharePercent}% rev share after first {FREE_CARTS_THRESHOLD}
                </p>

                <div className="flex-1 space-y-3 mb-6">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start space-x-2">
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-blue-200">{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handlePurchase(plan.id.toUpperCase() as PlanKey)}
                  disabled={isCurrent || processing === plan.id.toUpperCase()}
                  className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
                    isCurrent
                      ? 'bg-slate-600/50 text-blue-300/60 cursor-not-allowed'
                      : isGrowth
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/50'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                  } ${processing === plan.id.toUpperCase() ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {processing === plan.id.toUpperCase()
                    ? 'Processing...'
                    : isCurrent
                    ? 'Current Plan'
                    : `Upgrade to ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>


    </div>
  )
}
