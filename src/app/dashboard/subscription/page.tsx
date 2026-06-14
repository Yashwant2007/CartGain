'use client'

import { useEffect, useState } from 'react'
import { Check, CreditCard, Shield, TrendingUp, History, Percent, Zap } from 'lucide-react'
import { PLANS, FREE_CARTS_THRESHOLD, REVENUE_SHARE_PERCENT } from '@/lib/payment'

type SubscriptionData = {
  id: string
  plan: string
  status: string
  smsCredits: number
  smsCreditsUsed: number
  currentPeriodEnd: string
}

type StoreData = {
  id: string
  name: string
  currency: string
}

type PaymentRecord = {
  id: string
  amount: number
  plan: string
  credits: number
  status: string
  createdAt: string
}

type PlanKey = keyof typeof PLANS

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [totalRecoveredCarts, setTotalRecoveredCarts] = useState(0)
  const [monthlyRecoveredRevenue, setMonthlyRecoveredRevenue] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subRes, payRes, overviewRes] = await Promise.all([
          fetch('/api/subscription'),
          fetch('/api/payment/history'),
          fetch('/api/analytics/overview'),
        ])

        if (subRes.ok) {
          const subData = await subRes.json()
          setSubscription(subData.subscription)
          setStore(subData.store)
        }

        if (payRes.ok) {
          const payData = await payRes.json()
          setPayments(payData.payments || [])
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

    fetchData()
  }, [])

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

  const currentPlanKey = (subscription?.plan || 'starter').toLowerCase() as PlanKey
  const normalizedKey = Object.keys(PLANS).find(k => PLANS[k].id === currentPlanKey) as PlanKey || 'STARTER'
  const currentPlan = PLANS[normalizedKey] || PLANS.STARTER
  const isEnterprise = currentPlanKey === 'enterprise'
  const cartsUsed = totalRecoveredCarts
  const freeCartsRemaining = Math.max(0, FREE_CARTS_THRESHOLD - cartsUsed)
  const revShareCarts = Math.max(0, cartsUsed - FREE_CARTS_THRESHOLD)
  const avgCartValue = monthlyRecoveredRevenue > 0 && cartsUsed > 0 ? Math.round(monthlyRecoveredRevenue / cartsUsed) : 1000
  const estimatedRevShare = revShareCarts * avgCartValue * (REVENUE_SHARE_PERCENT / 100)

  const handlePurchase = async (planKey: PlanKey) => {
    if (!razorpayLoaded) return
    setProcessing(planKey)

    try {
      const plan = PLANS[planKey]
      if (!plan || plan.price === 0) return

      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.id, amount: plan.price }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create order')

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'CartGain',
        description: `${plan.name} Plan`,
        order_id: data.orderId,
        handler: () => { window.location.reload() },
        prefill: { name: '', email: '', contact: '' },
        theme: { color: '#22D3EE' },
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
              <h2 className="text-lg font-semibold text-white">{currentPlan.name}</h2>
              <p className="text-sm text-blue-300/60">
                {`₹${currentPlan.price.toLocaleString('en-IN')}/mo`}
                {subscription?.currentPeriodEnd && (
                  <> &middot; Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}</>
                )}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${
            subscription?.status === 'active'
              ? 'bg-emerald-600/40 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-600/40 text-blue-300 border-blue-700/30'
          }`}>
            {subscription?.status === 'active' ? 'Active' : 'Pending'}
          </span>
        </div>

        {/* Free Carts Progress */}
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
              ? `${freeCartsRemaining} more carts recovered at 0% revenue share — then ${REVENUE_SHARE_PERCENT}% applies`
              : `50 free carts used. ${REVENUE_SHARE_PERCENT}% revenue share is now active on recovered revenue.`}
          </p>
        </div>

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
            <p className="text-xs text-blue-300/60">Est. Revenue Share</p>
            <p className="text-xl font-bold text-cyan-400 mt-1">₹{Math.round(estimatedRevShare).toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

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
                <span>After that, just <strong className="text-white">{REVENUE_SHARE_PERCENT}%</strong> of revenue recovered. We only make more when you do.</span>
              </p>
              <p className="flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>No hidden fees, no per-message charges, no setup costs</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Comparison */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">Choose your plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.values(PLANS).filter(p => p.id !== 'enterprise').map((plan) => {
            const isCurrent = currentPlan.id === plan.id
            const isGrowth = plan.recommended

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

                <div className="mb-4">
                  <span className="text-3xl font-bold text-white">₹{plan.price.toLocaleString('en-IN')}</span>
                  <span className="text-base text-blue-300/60 ml-1">/mo</span>
                </div>

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

      {/* Enterprise */}
      <div className="bg-gradient-to-r from-slate-800/50 to-purple-900/20 border border-purple-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Enterprise Plan</h3>
            <p className="text-sm text-blue-300/80 mt-1">
              Processing more than 15,000 carts per month? We have a custom plan for you.
            </p>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-blue-300/60">
              <li className="flex items-center"><Check className="w-3 h-3 text-emerald-400 mr-1.5" /> Unlimited carts</li>
              <li className="flex items-center"><Check className="w-3 h-3 text-emerald-400 mr-1.5" /> On-premise option</li>
              <li className="flex items-center"><Check className="w-3 h-3 text-emerald-400 mr-1.5" /> Volume discount</li>
            </ul>
          </div>
          <a href="mailto:sales@cartgain.com" className="px-6 py-3 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all whitespace-nowrap text-sm">
            Contact Sales
          </a>
        </div>
      </div>

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center space-x-2 mb-6">
            <History className="w-5 h-5 text-blue-300" />
            <h2 className="text-lg font-semibold text-white">Payment History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-700/30">
                  <th className="text-left py-3 px-4 text-blue-300/60 font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-blue-300/60 font-medium">Plan</th>
                  <th className="text-left py-3 px-4 text-blue-300/60 font-medium">Amount</th>
                  <th className="text-left py-3 px-4 text-blue-300/60 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-blue-700/20 hover:bg-slate-700/30">
                    <td className="py-3 px-4 text-blue-200">
                      {new Date(payment.createdAt).toLocaleDateString('en-IN', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-blue-200 capitalize">{payment.plan}</td>
                    <td className="py-3 px-4 text-blue-200">₹{payment.amount}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        payment.status === 'completed' || payment.status === 'captured'
                          ? 'bg-emerald-600/30 text-emerald-300'
                          : 'bg-yellow-600/30 text-yellow-300'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
