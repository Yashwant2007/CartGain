'use client'

import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  const tiers = [
    {
      name: 'Starter',
      description: 'Perfect for new D2C brands',
      icon: '🚀',
      monthlyPrice: 2999,
      yearlyPrice: 29990,
      features: [
        'Up to 1,000 abandoned carts/month',
        'SMS + Email channels',
        'Basic campaign templates',
        'Email support',
        'Dashboard analytics',
        'Up to 2 team members',
        'Rate-limited messaging (100/hour)',
      ],
      cta: 'Get Started',
      highlight: false,
    },
    {
      name: 'Growth',
      description: 'For scaling beauty brands',
      icon: '📈',
      monthlyPrice: 7999,
      yearlyPrice: 79990,
      features: [
        'Up to 10,000 abandoned carts/month',
        'SMS + WhatsApp + Email',
        'AI-optimized send times',
        'Priority email support',
        'Advanced analytics & ROI tracking',
        'Up to 5 team members',
        'Standard messaging (500/hour)',
        'Custom discount codes',
        'A/B testing',
        'Multi-campaign management',
      ],
      cta: 'Try Free for 7 Days',
      highlight: true,
    },
    {
      name: 'Enterprise',
      description: 'For large-scale operations',
      icon: '👑',
      monthlyPrice: 24999,
      yearlyPrice: 249990,
      features: [
        'Unlimited abandoned carts',
        'SMS + WhatsApp + Email + Push',
        'AI-powered personalization',
        'Phone + Slack support',
        'Real-time analytics dashboard',
        'Unlimited team members',
        'Premium messaging (2,000/hour)',
        'Dynamic pricing optimization',
        'Advanced segmentation',
        'Webhook integrations',
        'Custom integrations support',
        'Dedicated account manager',
      ],
      cta: 'Contact Sales',
      highlight: false,
    },
  ]

  const faqs = [
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards, net banking, and UPI via Razorpay. We also offer annual billing with 15% discount.',
    },
    {
      question: 'Is there a free trial?',
      answer:
        'Yes! Growth tier includes 7 days free. Starter tier gets 3 days free. Setup takes less than 5 minutes with Shopify integration.',
    },
    {
      question: 'Can I switch tiers anytime?',
      answer: 'Absolutely. Upgrade or downgrade anytime. Changes take effect at your next billing cycle. No lock-in contracts.',
    },
    {
      question: 'What about message costs?',
      answer:
        'Message limits are included. SMS costs ₹0.50-2 per message (included up to limits). WhatsApp messages are free. Additional messages charged separately.',
    },
    {
      question: 'Do you offer discounts for annual billing?',
      answer: 'Yes, 15% discount on annual plans. Enterprise customers get custom pricing based on volume.',
    },
    {
      question: 'What if I exceed my cart/message limits?',
      answer:
        'You can upgrade anytime or purchase additional messages at ₹1 per SMS, free for WhatsApp. No surprises, transparent pricing.',
    },
  ]

  return (
    <div className="space-y-16 pb-16">
      {/* Hero */}
      <div className="text-center space-y-4 pt-12">
        <h1 className="text-4xl md:text-5xl font-bold text-white">Simple, Transparent Pricing</h1>
        <p className="text-lg text-blue-300/80 max-w-2xl mx-auto">
          Choose the perfect plan for your D2C beauty brand. Scale as you grow. No hidden fees.
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-4 bg-slate-800/50 border border-blue-700/30 p-1 rounded-full">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              billingCycle === 'monthly'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50'
                : 'text-blue-300/80 hover:text-blue-300'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              billingCycle === 'yearly'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50'
                : 'text-blue-300/80 hover:text-blue-300'
            }`}
          >
            Yearly
            <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">Save 15%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {tiers.map((tier, idx) => {
          const price = billingCycle === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice
          const pricePerMonth =
            billingCycle === 'monthly' ? price : Math.floor(price / 12)

          return (
            <div
              key={idx}
              className={`relative rounded-2xl transition-all ${
                tier.highlight
                  ? 'md:scale-105 bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-cyan-500/50 shadow-2xl shadow-cyan-500/30'
                  : 'bg-slate-800/50 border border-blue-700/30 hover:border-blue-700/60'
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    ⭐ Most Popular
                  </span>
                </div>
              )}

              <div className="p-8 space-y-6">
                {/* Header */}
                <div>
                  <div className="text-4xl mb-2">{tier.icon}</div>
                  <h3 className="text-2xl font-bold text-white">{tier.name}</h3>
                  <p className="text-sm text-blue-300/60 mt-1">{tier.description}</p>
                </div>

                {/* Price */}
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-cyan-300">₹{pricePerMonth.toLocaleString()}</span>
                    <span className="text-blue-300/60">/month</span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-sm text-blue-300/60 mt-2">
                      ₹{price.toLocaleString()} billed yearly • Save ₹{((price * 0.15) / 1).toFixed(0)}
                    </p>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                    tier.highlight
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                      : 'bg-blue-600/20 text-blue-300 border border-blue-500/50 hover:bg-blue-600/30'
                  }`}
                >
                  {tier.cta}
                  <ArrowRight className="w-4 h-4" />
                </button>

                {/* Features */}
                <div className="space-y-3 border-t border-blue-700/30 pt-6">
                  {tier.features.map((feature, featureIdx) => (
                    <div key={featureIdx} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-blue-300/80">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* What's Included */}
      <div className="max-w-4xl mx-auto space-y-8">
        <h2 className="text-3xl font-bold text-white text-center">What&apos;s Included in Every Plan</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              icon: '🛒',
              title: 'Shopify Integration',
              description: 'Connect your Shopify store in minutes. Auto-sync abandoned carts.',
            },
            {
              icon: '📊',
              title: 'Real-time Analytics',
              description: 'Track ROI, recovery rates, and revenue in real-time.',
            },
            {
              icon: '🤖',
              title: 'Smart Automation',
              description: 'Automatic cart recovery flows with customizable sequences.',
            },
            {
              icon: '🔐',
              title: 'Bank-level Security',
              description: 'SOC 2 compliant. Your data is encrypted and safe.',
            },
            {
              icon: '🌍',
              title: 'Multi-language Support',
              description: 'Send messages in Hindi, English, and regional languages.',
            },
            {
              icon: '📱',
              title: 'Mobile-First Design',
              description: 'Perfect customer experience on all devices.',
            },
          ].map((item, idx) => (
            <div key={idx} className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 space-y-2">
              <div className="text-3xl mb-2">{item.icon}</div>
              <h4 className="font-semibold text-white">{item.title}</h4>
              <p className="text-sm text-blue-300/60">{item.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div className="max-w-3xl mx-auto space-y-8">
        <h2 className="text-3xl font-bold text-white text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <details
              key={idx}
              className="group bg-slate-800/50 border border-blue-700/30 rounded-lg p-6 cursor-pointer"
            >
              <summary className="font-semibold text-white flex items-center justify-between">
                {faq.question}
                <span className="transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="text-blue-300/80 mt-4">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-cyan-500/30 rounded-2xl p-12 text-center space-y-6">
        <h2 className="text-3xl font-bold text-white">Ready to Recover More Carts?</h2>
        <p className="text-blue-300/80 max-w-2xl mx-auto">
          Join 500+ D2C beauty brands already using CartGain. Average cart recovery rate: 22%. Average revenue per brand:
          ₹50,000/month.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
          >
            Start Free Trial
          </Link>
          <button className="px-8 py-3 border border-blue-500/50 text-blue-300 font-semibold rounded-lg hover:bg-blue-500/10 transition-all">
            Schedule Demo
          </button>
        </div>
        <p className="text-xs text-blue-300/60">No credit card required. Setup takes 5 minutes.</p>
      </div>
    </div>
  )
}
