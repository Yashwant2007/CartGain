'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, CheckCircle2, Zap, MessageSquare, Mail, BarChart3, TrendingUp,
  Sparkles, ArrowUpRight, X, Shield, UsersRound, Handshake, Wallet, Lock,
  ShieldCheck, ShoppingCart, Store, Workflow, Menu, ChevronDown, BadgeCheck,
  Smartphone, ShoppingBag, Package, Settings, Link2,
} from 'lucide-react'
import ROICalculator from '@/components/ROICalculator'
import CartGainAnimatic from '@/components/CartGainAnimatic'
import HeroNegotiationDemo from '@/components/HeroNegotiationDemo'
import DashboardPreview from '@/components/DashboardPreview'
import { Button } from '@/components/Button'
import Badge from '@/components/Badge'
import FeatureCard from '@/components/FeatureCard'
import { useState, useEffect } from 'react'
import { PLANS, FREE_CARTS_THRESHOLD } from '@/lib/payment'

// Integration modal data
const INTEGRATION_DETAILS = {
  shopify: {
    title: 'Shopify Integration',
    description: 'Connect your Shopify store in minutes with our one-click integration.',
    features: [
      'One-click Shopify connection',
      'Automatic cart tracking via webhooks',
      'Real-time sync with your store',
      'Works with all Shopify plans',
      'App Store distribution ready',
      '24/7 monitoring and alerts',
    ],
    setup: 'Just enter your Shopify store domain and authorize CartGain to access your store data.',
  },
  woocommerce: {
    title: 'WooCommerce Integration',
    description: 'API and webhook-based integration for WooCommerce stores — actively on our roadmap.',
    features: [
      'REST API + webhook support',
      'Automatic webhook configuration',
      'Works with any WooCommerce theme',
      'No coding skills needed',
      'Onboarding support from our team',
      'Regular updates',
    ],
    setup: 'WooCommerce is on our roadmap. Contact us to join the early-access list.',
  },
  magento: {
    title: 'Magento Integration',
    description: 'Enterprise-grade integration for Magento stores — actively on our roadmap.',
    features: [
      'REST API + webhook support',
      'Custom configuration support',
      'Dedicated technical assistance',
      'Enterprise security standards',
      'Scalable for high-volume stores',
      'Multi-store support',
    ],
    setup: 'Magento is on our roadmap. Contact us to discuss your timeline and requirements.',
  },
  custom: {
    title: 'Custom Platform Integration',
    description: 'Connect any e-commerce platform using our flexible API.',
    features: [
      'Comprehensive REST API',
      'Webhook support for real-time updates',
      'Detailed API documentation',
      'SDK for popular languages',
      'Developer support team',
      'Sandbox environment for testing',
    ],
    setup: 'Use our API documentation and SDKs to build a custom integration.',
  },
}

const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee', code: 'INR' },
}

const PIPELINE_STEPS = [
  {
    icon: ShoppingCart,
    title: 'Abandoned',
    desc: 'A shopper leaves the product at checkout. Revenue starts slipping away.',
  },
  {
    icon: MessageSquare,
    title: 'Re-engage',
    desc: 'WhatsApp or Email nudges them back — Live, fast, with product images.',
  },
  {
    icon: Handshake,
    title: 'Negotiate',
    desc: 'The AI shopkeeper settles a price objection your margins protect.',
  },
  {
    icon: TrendingUp,
    title: 'Recover',
    desc: 'The deal becomes an order — one-use code, tracked to your dashboard.',
  },
]

const VALUE_STRIP = [
  { icon: ShoppingCart, title: 'Recover lost carts', desc: 'WhatsApp + Email bring them back' },
  { icon: Sparkles, title: 'AI-powered negotiation', desc: 'Settles the “too expensive” objection' },
  { icon: Shield, title: 'Protect your margins', desc: 'Your floor price, enforced by the engine' },
  { icon: BarChart3, title: 'Track recovered revenue', desc: 'Attributable, dashboard-visible, day one' },
]

const FAQS = [
  {
    q: 'Why not just use email for cart recovery?',
    a: 'Email alone typically recovers 3-5% of abandoned carts. CartGain layers WhatsApp (industry-average ~85% open rate) on top, plus a live AI negotiator that settles price objections a static email cannot — and SMS is arriving soon. Multi-channel recovery is benchmarked at 18-25%.',
  },
  {
    q: 'How do you handle customer data & privacy?',
    a: 'All customer data is encrypted at rest and in transit. We only process the cart-abandonment data needed for recovery, nothing more. No data is shared with third parties, and opt-outs are honored across every channel. Our practices follow India\'s DPDP Act 2023 and GDPR principles.',
  },
  {
    q: 'What if my platform isn\'t Shopify?',
    a: 'Today CartGain ships a direct Shopify integration. WooCommerce, Magento, and other platforms are on our roadmap and available via REST API + webhooks. Contact us and we\'ll walk you through the best path for your store.',
  },
  {
    q: 'When do I see results?',
    a: 'Setup typically takes 3-7 days. Recovery volume depends on your traffic, cart value, and customer base — the dashboard shows live, attributable numbers from day one, so you always know exactly what CartGain recovered.',
  },
  {
    q: 'How does the revenue share work?',
    a: 'You pay a fixed monthly subscription, plus a small revenue share only on carts CartGain recovers — an order placed within the 72-hour window after one of our recovery messages. If CartGain didn\'t recover it, you don\'t pay revenue share on it. Your first 50 recovered carts are free.',
  },
  {
    q: 'Do you handle WhatsApp integration?',
    a: 'Yes. We connect to the WhatsApp Business API to send recovery messages and manage template approval, delivery, and compliance. You bring a WhatsApp Business Account; we handle the rest.',
  },
  {
    q: 'Can I protect my minimum price?',
    a: 'Yes — that\'s core to the product. You set a floor price per product (or rule). The negotiation engine enforces it: the AI cannot offer below your floor, at the engine level, not just by instruction.',
  },
  {
    q: 'Can I customize recovery messages?',
    a: 'Absolutely. You control all copy for WhatsApp and Email (SMS when it launches). We provide templates you can brand yourself, adjust urgency on, and personalize per segment.',
  },
]

export default function HomePage() {
  const currency = 'INR'
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [activeModal, setActiveModal] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const openModal = (platform: string) => setActiveModal(platform)
  const closeModal = () => setActiveModal(null)

  // Close the integration modal and mobile menu on Escape
  useEffect(() => {
    if (!activeModal && !mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal()
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeModal, mobileOpen])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      {/* Skip link for keyboard users */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-slate-800 focus:text-white focus:rounded-lg focus:text-sm"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav aria-label="Main" className="fixed top-0 w-full bg-slate-900/80 dark:bg-slate-950/90 backdrop-blur-lg border-b border-blue-800/30 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 min-h-12">
            <Link href="/" className="flex items-center space-x-2 group flex-shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded-md" aria-label="CartGain home">
              <Image
                src="/favicon-32x32.png"
                alt=""
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg flex-shrink-0"
                priority
              />
              <span className="text-base sm:text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center space-x-1">
              <Link href="#what" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Why CartGain
              </Link>
              <Link href="#how-it-works" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                How It Works
              </Link>
              <Link href="#bargain" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                AI Negotiator
              </Link>
              <Link href="#pricing" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Pricing
              </Link>
            </div>

            {/* Desktop CTA */}
            <Link
              href="/signup"
              className="hidden md:inline-flex px-4 py-2 bg-primary-600 hover:bg-primary-700 text-sm font-semibold rounded-lg transition active:scale-95 min-h-11 items-center"
            >
              Start Free
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden p-2 rounded-lg text-blue-200 hover:bg-blue-600/10 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-blue-800/30 bg-slate-900/95 backdrop-blur-lg px-4 py-4 space-y-1">
            <Link href="#what" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-medium text-blue-200 hover:bg-blue-600/10 rounded-md">Why CartGain</Link>
            <Link href="#how-it-works" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-medium text-blue-200 hover:bg-blue-600/10 rounded-md">How It Works</Link>
            <Link href="#bargain" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-medium text-blue-200 hover:bg-blue-600/10 rounded-md">AI Negotiator</Link>
            <Link href="#pricing" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-medium text-blue-200 hover:bg-blue-600/10 rounded-md">Pricing</Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg text-center mt-2">
              Start Free
            </Link>
          </div>
        )}
      </nav>

      <main id="main">
        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="relative pt-24 sm:pt-28 md:pt-32 lg:pt-36 pb-14 sm:pb-16 md:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden" aria-labelledby="hero-heading">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 sm:w-96 sm:h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 left-4 sm:left-20 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl"></div>
          </div>

          <div className="w-full max-w-5xl mx-auto">
            <div className="flex justify-center mb-6 sm:mb-8">
              <Badge variant="default" size="md">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-cyan-300 mr-2 flex-shrink-0" />
                <span>Built for D2C Beauty Brands</span>
              </Badge>
            </div>

            <h1 id="hero-heading" className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white text-center mb-4 sm:mb-6 leading-tight tracking-tight">
              Recover Your <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">Lost Revenue</span>
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-blue-100 text-center mb-4 sm:mb-6 max-w-3xl mx-auto leading-relaxed px-2">
              Turn abandoned carts into confirmed sales with AI-powered WhatsApp &amp; Email recovery — with SMS coming soon. Built specifically for beauty founders.
            </p>

            <p className="text-sm sm:text-base text-cyan-200 text-center mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed px-2">
              Meet the AI shopkeeper: a real-time negotiator at your checkout that closes the deal — without ever dropping below the floor price you set.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-12 sm:mb-16 px-2">
              <Button
                isLink
                href="/signup"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                aria-label="Start recovering revenue with CartGain"
              >
                Start Recovering Revenue
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <Button
                isLink
                href="#how-it-works"
                variant="accent"
                size="lg"
                className="w-full sm:w-auto border-2 border-cyan-400"
                aria-label="See how CartGain works"
              >
                See How It Works
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 text-xs sm:text-sm text-blue-100 flex-wrap px-2 mb-12">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
                <span><strong>AI negotiation</strong> at checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
                <span><strong>Your floor price</strong> always protected</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
                <span><strong>18-25%</strong> multi-channel recovery benchmark</span>
              </div>
            </div>

            {/* AI negotiation demo — the visual centerpiece */}
            <HeroNegotiationDemo />
          </div>
        </section>

        {/* ── VALUE PROPOSITION STRIP ─────────────────────────── */}
        <section aria-label="Core benefits" className="py-10 sm:py-12 px-4 sm:px-6 lg:px-8 border-y border-blue-800/20 bg-slate-950/40">
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {VALUE_STRIP.map((v) => (
              <div key={v.title} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-cyan-600/15 border border-cyan-500/25 rounded-lg flex items-center justify-center flex-shrink-0">
                  <v.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm sm:text-base">{v.title}</p>
                  <p className="text-xs text-blue-300/70 mt-0.5">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT CARTGAIN DOES ───────────────────────────────── */}
        <section id="what" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8" aria-labelledby="what-heading">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
              {/* Left - Problem */}
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-semibold uppercase tracking-wider mb-4">
                  The Real Cost
                </span>
                <h2 id="what-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
                  You&apos;re Leaving <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600">₹50L+</span> on the Table
                </h2>
                <p className="text-lg sm:text-xl text-blue-100 mb-8">
                  Every week, your customers add products to their cart, then leave without buying. That&apos;s not a problem with your product — it&apos;s a <strong>recovery problem</strong>. And most of it starts with one word: <strong>price</strong>.
                </p>
                <ul className="space-y-4">
                  <li className="flex gap-3">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-white text-sm sm:text-base">30% Abandonment Rate</p>
                      <p className="text-blue-200 text-xs sm:text-sm">Standard for D2C skincare</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-white text-sm sm:text-base">₹50-100L Annual Loss</p>
                      <p className="text-blue-200 text-xs sm:text-sm">For brands doing ₹2-5 Cr/year</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 flex-shrink-0 mt-1" />
                    <div>
                      <p className="font-semibold text-white text-sm sm:text-base">Email Only = Missed Chance</p>
                      <p className="text-blue-200 text-xs sm:text-sm">Email gets just 20% open rate — and can&apos;t fix a price objection</p>
                    </div>
                  </li>
                </ul>
              </div>

              {/* Right - What CartGain does */}
              <div className="relative">
                <div className="relative rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-blue-950/60 to-slate-900 overflow-hidden">
                  <div className="absolute -top-16 -right-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl"></div>
                  <div className="relative p-6 sm:p-8">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-6">
                      <Sparkles className="w-3.5 h-3.5" /> What CartGain Does
                    </span>
                    <div className="space-y-5">
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-cyan-600/20 border border-cyan-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Zap className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">Sells the moment it hurts</p>
                          <p className="text-blue-200 text-xs sm:text-sm">An AI negotiator closes price objections at checkout — before the customer ever walks away.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-cyan-600/20 border border-cyan-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">WhatsApp-first recovery</p>
                          <p className="text-blue-200 text-xs sm:text-sm">85% industry-average open rates vs 20% for email bring back what still leaves — with product images, instantly.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-cyan-600/20 border border-cyan-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Shield className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">Margins, hard-protected</p>
                          <p className="text-blue-200 text-xs sm:text-sm">Your floor price is enforced at the engine level — the AI cannot sell below it.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-cyan-600/20 border border-cyan-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Lock className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">Compliance built in</p>
                          <p className="text-blue-200 text-xs sm:text-sm">DPDP Act &amp; GDPR aligned, opt-out honored on every channel — privacy that scales with you.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-cyan-600/20 border border-cyan-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <BarChart3 className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">18–25% recovery benchmark</p>
                          <p className="text-blue-200 text-xs sm:text-sm">Engineered results, not promises — versus 3–5% for email-only recovery stacks.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-9 h-9 bg-cyan-600/20 border border-cyan-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Wallet className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm sm:text-base">We earn when you do</p>
                          <p className="text-blue-200 text-xs sm:text-sm">Revenue-share pricing — no setup fees, first 50 recovered carts free, no lock-in.</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-7 pt-6 border-t border-cyan-500/20">
                      <Button isLink href="/pricing" variant="primary" className="w-full sm:w-auto" aria-label="See CartGain pricing">
                        See plans &amp; pricing
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS / RECOVERY PIPELINE ─────────────────── */}
        <section id="how-it-works" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-900/20 to-slate-950" aria-labelledby="how-heading">
          <div className="w-full max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-14">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/40 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-4">
                <Workflow className="w-3.5 h-3.5" /> How It Works
              </span>
              <h2 id="how-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">A complete recovery in four steps</h2>
              <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">
                Abandoned → Re-engage → Negotiate → Recover. The whole loop, understood in under ten seconds.
              </p>
            </div>

            {/* Pipeline steps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
              {PIPELINE_STEPS.map((s, i) => (
                <div key={s.title} className="relative">
                  <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-5 sm:p-6 h-full hover:border-blue-600/50 transition">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 flex items-center justify-center mb-3">
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300/60 mb-1">Step {i + 1}</p>
                    <h3 className="text-lg font-bold text-white mb-1">{s.title}</h3>
                    <p className="text-sm text-blue-200/80">{s.desc}</p>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ArrowRight className="hidden lg:block absolute top-1/2 -right-5 w-4 h-4 text-cyan-400/70 z-10 pipeline-arrow" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>

            {/* Channel cards */}
            <h3 className="text-center text-xl sm:text-2xl font-bold text-white mb-8">The channels that bring them back</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-10">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-green-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
                <div className="relative bg-slate-800/50 border border-green-600/30 rounded-2xl p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-block bg-green-600/20 border border-green-600/40 rounded-lg px-3 py-1 text-xs">
                        <span className="font-semibold text-green-300">Hour 1</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-[10px] font-semibold text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> LIVE
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-green-400" /> WhatsApp
                    </h3>
                    <p className="text-blue-100 text-sm mb-4">Instant notification with product images</p>
                    <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 mb-4">
                      <p className="text-xs text-green-300 font-mono">
                        &ldquo;Hi Riya, your brightening serum is still waiting. Come back — we&apos;ll find you a deal you can&apos;t refuse.&rdquo;
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-green-400">
                    <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="text-sm font-semibold">85% industry-avg open rate</span>
                  </div>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
                <div className="relative bg-slate-800/50 border border-blue-600/30 rounded-2xl p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-block bg-blue-600/20 border border-blue-600/40 rounded-lg px-3 py-1 text-xs">
                        <span className="font-semibold text-blue-300">Hour 3</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-600/40 text-[10px] font-semibold text-amber-300">
                        <Smartphone className="w-3 h-3" /> COMING SOON
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-blue-400" /> SMS
                    </h3>
                    <p className="text-blue-100 text-sm mb-4">Quick nudge on the fastest channel</p>
                    <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 mb-4">
                      <p className="text-xs text-blue-300 font-mono">
                        &ldquo;Lumina Beauty: your cart is still here. Reply 1 for 10% off — or 2 to negotiate the price.&rdquo;
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-blue-400">
                    <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="text-sm font-semibold">On the roadmap</span>
                  </div>
                </div>
              </div>

              <div className="relative group sm:col-span-2 lg:col-span-1">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-purple-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
                <div className="relative bg-slate-800/50 border border-purple-600/30 rounded-2xl p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-block bg-purple-600/20 border border-purple-600/40 rounded-lg px-3 py-1 text-xs">
                        <span className="font-semibold text-purple-300">Day 1</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-[10px] font-semibold text-emerald-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> LIVE
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 flex items-center gap-2">
                      <Mail className="w-5 h-5 text-purple-400" /> Email
                    </h3>
                    <p className="text-blue-100 text-sm mb-4">Brand story that builds trust</p>
                    <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg p-3 mb-4">
                      <p className="text-xs text-purple-300 font-mono">
                        &ldquo;Still thinking it over? We&apos;d rather strike a deal than lose you. Hit reply — let&apos;s talk price.&rdquo;
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-purple-400">
                    <Mail className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="text-sm font-semibold">Converts warm leads</span>
                  </div>
                </div>
              </div>
            </div>

            {/* The Bargain Tab */}
            <div className="relative rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-blue-950/60 to-slate-900 overflow-hidden">
              <div className="absolute -top-16 -right-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl"></div>
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 sm:p-8">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-4">
                    <Handshake className="w-3.5 h-3.5" /> The Negotiation Tab
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    When they come back, let them negotiate — instead of leaving again
                  </h3>
                  <p className="text-sm sm:text-base text-blue-100 mb-5">
                    Every recovery nudge brings a customer back. The AI shopkeeper makes sure they actually stay — reading their tactic, countering the lowball, and finding a deal your margin protects. It&apos;s the difference between a reminder and a sale.
                  </p>
                  <Button isLink href="/demo" variant="primary" className="w-full sm:w-auto" aria-label="Watch the AI negotiator live">
                    Watch it negotiate
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 self-center">
                  <div className="bg-slate-800/50 border border-cyan-500/20 rounded-xl p-4">
                    <Sparkles className="w-5 h-5 text-cyan-400 mb-2" />
                    <p className="text-sm font-semibold text-white mb-1">Real negotiation, not a chatbot</p>
                    <p className="text-xs text-blue-100">A trained negotiator with 3 shopkeeper personas counters every tactic.</p>
                  </div>
                  <div className="bg-slate-800/50 border border-cyan-500/20 rounded-xl p-4">
                    <Shield className="w-5 h-5 text-cyan-400 mb-2" />
                    <p className="text-sm font-semibold text-white mb-1">Margin stays protected</p>
                    <p className="text-xs text-blue-100">You set the floor price; the engine enforces it. It can never go below.</p>
                  </div>
                  <div className="bg-slate-800/50 border border-cyan-500/20 rounded-xl p-4">
                    <ArrowUpRight className="w-5 h-5 text-cyan-400 mb-2" />
                    <p className="text-sm font-semibold text-white mb-1">Walkout retention</p>
                    <p className="text-xs text-blue-100">&ldquo;Found it cheaper?&rdquo; The shopkeeper pulls them back and matches the offer.</p>
                  </div>
                  <div className="bg-slate-800/50 border border-cyan-500/20 rounded-xl p-4">
                    <Zap className="w-5 h-5 text-cyan-400 mb-2" />
                    <p className="text-sm font-semibold text-white mb-1">Deal becomes a sale</p>
                    <p className="text-xs text-blue-100">Accepted deals auto-generate a one-use code bound to that cart.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Result */}
            <div className="mt-10 bg-gradient-to-r from-green-900/30 via-cyan-900/30 to-green-900/30 border border-green-700/40 rounded-2xl p-6 sm:p-8 md:p-10 text-center">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">The result</h3>
              <p className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent mb-4">Cart Recovered</p>
              <p className="text-base sm:text-lg text-blue-100 max-w-2xl mx-auto">
                The negotiated deal becomes a one-use, 24-hour code — and the order closes at checkout, tracked back to CartGain on your dashboard.
              </p>
            </div>
          </div>
        </section>

        {/* ── Benchmarks strip ─────────────────────────────────── */}
        <section aria-label="Benchmarks and typical figures" className="py-10 sm:py-14 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-900/20 to-slate-950">
          <div className="w-full max-w-7xl mx-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 md:gap-8">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">18-25%</div>
                <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">Recovery Rate</div>
                <p className="text-xs text-blue-400/70 mt-1">Industry benchmark for multi-channel vs 3-5% email only</p>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">85%</div>
                <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">WhatsApp Open Rate</div>
                <p className="text-xs text-blue-400/70 mt-1">Industry average for WhatsApp Business</p>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">₹3-5K</div>
                <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">Typical Cart Value</div>
                <p className="text-xs text-blue-400/70 mt-1">Representative for D2C beauty SKUs</p>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">30%</div>
                <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">Abandonment Rate</div>
                <p className="text-xs text-blue-400/70 mt-1">Standard across D2C e-commerce</p>
              </div>
            </div>
            <p className="text-center text-[11px] text-blue-400/50 mt-6">Benchmark and industry-average figures shown for context — not a guarantee of your results.</p>
          </div>
        </section>

        {/* ── AI NEGOTIATOR (the differentiator) ───────────────── */}
        <section id="bargain" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/60" aria-labelledby="bargain-heading">
          <div className="max-w-7xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-blue-950/80 to-slate-900 p-8 sm:p-12 md:p-16 shadow-2xl shadow-cyan-500/10">
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl"></div>
              <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-5">
                    <Sparkles className="w-3.5 h-3.5" /> The AI Negotiator — Our Core
                  </span>
                  <h2 id="bargain-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                    The AI shopkeeper built to turn <span className="text-cyan-400">price objections into sales.</span>
                  </h2>
                  <p className="text-lg text-blue-100 max-w-xl mb-8">
                    Bargain hunters walk away when they can&apos;t get a deal. CartGain embeds an AI negotiator at your checkout that reads your customer&apos;s tactics, adapts its strategy in real time, and closes deals a human shopkeeper would — while your margin stays protected.
                  </p>
                  <ul className="space-y-3 mb-8">
                    {[
                      'Not a chatbot — a trained negotiation agent with real-world psychology running on OpenAI',
                      'Reads 15+ customer behavioral patterns and adapts its strategy mid-conversation',
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
              <FeatureCard
                className="h-full"
                icon={<MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />}
                title="Real-World Negotiation Psychology"
                description="The AI is trained on how real humans haggle — not canned discount scripts."
                features={[
                  'Anchoring, reciprocity, loss aversion & scarcity',
                  'Concession patterns that signal your floor without revealing it',
                  'Silence handling, round-number & split-the-difference plays',
                  'Fluid adaptation to customer emotional state',
                ]}
              />
              <FeatureCard
                className="h-full"
                icon={<Shield className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />}
                title="Margin Safety by Design"
                description="Protection isn&apos;t a prompt — it&apos;s enforced at the engine level."
                features={[
                  'Your floor price is a hard constraint, never a suggestion',
                  'Accept decisions below the floor are downgraded automatically',
                  'Bulk orders unlock controlled, merchant-defined discounts',
                  'Never reveals the floor, margin or internal pricing',
                ]}
              />
              <FeatureCard
                className="h-full"
                icon={<UsersRound className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />}
                title="Abuse & Brand Protection"
                description="The AI stays professional through the worst humans throw at it."
                features={[
                  '6-layer abuse firewall: profanity, threats, harassment',
                  'Multi-layer protection against common prompt-injection attempts',
                  'Toxic users get graceful, dignified responses',
                  'Flooding & spam don&apos;t burn your customer&apos;s attempts',
                ]}
              />
              <FeatureCard
                className="h-full"
                icon={<Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />}
                title="Turns Negotiations Into Sales"
                description="Every hard-won agreement becomes revenue — fully automated."
                features={[
                  'Accepted deal auto-generates a Shopify discount code',
                  'Codes bound to that customer + that cart — no sharing',
                  'Walkout retention saves customers who threaten to leave',
                  'Memory of returning customers rewards loyalty',
                ]}
              />
            </div>

            {/* Personas */}
            <div className="mt-12 sm:mt-16 relative rounded-3xl overflow-hidden border border-blue-700/30 bg-slate-900/60 p-8 sm:p-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/40 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-5">
                    <UsersRound className="w-3.5 h-3.5" /> Three Shopkeeper Personas
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">Choose the voice that fits your brand.</h3>
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
                    <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" /> Handles every real-world bargaining scenario
                    </h3>
                    <p className="text-sm text-blue-200 mb-4">The behavioral engine reads intent — not just words — and adapts mid-conversation. It&apos;s trained to recognize and respond to:</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
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
                    ].map((item) => (
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

        {/* ── MEDIA / WALKTHROUGH ──────────────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="media-heading">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-14">
              <h2 id="media-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">See it in motion</h2>
              <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">
                A 60-second walkthrough of how a sale gets recovered — plus the full negotiation flow.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-4 sm:p-6 backdrop-blur-sm">
                <h3 className="text-base sm:text-lg font-bold text-white mb-2">See the Logic</h3>
                <p className="text-blue-300 text-xs sm:text-sm mb-4">An animated rundown of the recovery cycle in 23 seconds.</p>
                <CartGainAnimatic />
              </div>
              <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-4 sm:p-6 backdrop-blur-sm flex flex-col justify-center">
                <h3 className="text-base sm:text-lg font-bold text-white mb-2">Full Technical Demo</h3>
                <p className="text-blue-300 text-xs sm:text-sm mb-4">Watch the actual product in action.</p>
                <div className="relative bg-slate-700 rounded-lg overflow-hidden">
                  <video
                    src="/videos/demo.mp4"
                    controls
                    controlsList="nodownload"
                    preload="none"
                    poster="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=600&fit=crop"
                    className="rounded-lg w-full h-auto border border-blue-700/30"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=600&fit=crop"
                      alt="Dashboard demo preview"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </video>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── REVENUE DASHBOARD ────────────────────────────────── */}
        <section id="dashboard" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-950/40 to-slate-950" aria-labelledby="dashboard-heading">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-14">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/40 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-4">
                <BarChart3 className="w-3.5 h-3.5" /> Revenue Dashboard
              </span>
              <h2 id="dashboard-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Know exactly what CartGain recovered</h2>
              <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">
                Attribution-first analytics: every rupee, order, and channel shown live — no guessed numbers.
              </p>
            </div>

            <DashboardPreview />

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mt-10">
              <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">Recovered revenue</h3>
                </div>
                <p className="text-blue-300/80 text-sm">Every order tracked back to the exact recovery message that caused it.</p>
              </div>
              <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Transparent attribution</h3>
                </div>
                <p className="text-blue-300/80 text-sm">72-hour window from message to order. If we didn&apos;t drive it, we don&apos;t bill it.</p>
              </div>
              <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">Channel breakdown</h3>
                </div>
                <p className="text-blue-300/80 text-sm">WhatsApp vs Email performance side by side, updated in real time.</p>
              </div>
              <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Handshake className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-bold text-white">AI bargain conversions</h3>
                </div>
                <p className="text-blue-300/80 text-sm">Deals accepted by the negotiator — and the discounts each one cost you.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── ROI CALCULATOR ───────────────────────────────────── */}
        <section id="calculator" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-blue-950/30" aria-labelledby="calculator-heading">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-4">
                <TrendingUp className="w-3.5 h-3.5" /> Estimate Your Potential
              </span>
              <h2 id="calculator-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">What could CartGain recover for you?</h2>
              <p className="text-base sm:text-lg text-blue-100 max-w-2xl mx-auto">
                Plug in your numbers for a rough estimate. Results are projections based on your inputs — not guaranteed revenue.
              </p>
            </div>
            <div className="bg-slate-800/40 rounded-2xl p-6 sm:p-8 border border-blue-700/40">
              <ROICalculator isLoggedIn={false} />
            </div>
          </div>
        </section>

        {/* ── KLAVIYO / COMPLEMENTARY ──────────────────────────── */}
        <section id="complementary" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="klaviyo-heading">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/40 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-4">
                  <Store className="w-3.5 h-3.5" /> Already using Klaviyo? Keep it.
                </span>
                <h2 id="klaviyo-heading" className="text-3xl sm:text-4xl font-bold text-white mb-4">
                  Add the negotiation layer your marketing automation can&apos;t do.
                </h2>
                <p className="text-lg text-blue-100 mb-6">
                  Klaviyo is excellent at email flows and segmentation. CartGain focuses on the revenue it leaves behind: live price negotiation at checkout, WhatsApp recovery, and margin-protected discounts. They don&apos;t overlap — they compound.
                </p>
                <div className="flex items-center gap-2 text-sm text-blue-200/80 mb-8">
                  <BadgeCheck className="w-4 h-4 text-emerald-400" />
                  Many merchants run both. CartGain sits inside your checkout and recovery — where Klaviyo&apos;s email sequences can&apos;t reach.
                </div>
              </div>

              <div className="rounded-2xl border border-blue-700/30 bg-slate-900/60 overflow-hidden">
                <div className="px-6 py-4 border-b border-blue-800/30 grid grid-cols-3 text-xs font-semibold uppercase tracking-wider text-blue-300/60">
                  <span>Capability</span>
                  <span className="text-center">Klaviyo</span>
                  <span className="text-center text-cyan-300">CartGain</span>
                </div>
                {[
                  { label: 'Email automation & lifecycle flows', a: '●', b: '— complements' },
                  { label: 'Segmentation & analytics', a: '●', b: '— complements' },
                  { label: 'WhatsApp recovery', a: '—', b: '●' },
                  { label: 'Live AI price negotiation', a: '—', b: '●' },
                  { label: 'Merchant-defined price floors', a: '—', b: '●' },
                  { label: 'Recovery-focused attribution', a: '—', b: '●' },
                ].map((row) => (
                  <div key={row.label} className="px-6 py-3.5 border-b border-blue-800/20 grid grid-cols-3 items-center text-sm">
                    <span className="text-blue-100">{row.label}</span>
                    <span className="text-center text-blue-300/80">{row.a}</span>
                    <span className="text-center text-cyan-300">{row.b}</span>
                  </div>
                ))}
                <div className="px-6 py-4 text-xs text-blue-300/50 leading-relaxed">
                  Feature markers show where each tool leads today. CartGain integrates alongside your existing stack — no rip-and-replace.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── BUILT FOR E-COMMERCE TEAMS + SETUP ───────────────── */}
        <section className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-950/30 to-slate-950" aria-labelledby="teams-heading">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-14">
              <h2 id="teams-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Built for modern e-commerce teams</h2>
              <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">
                Purpose-built for D2C stores that live or die on margins, price sensitivity, and repeat purchase.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16">
              {[
                { icon: ShoppingBag, title: 'Beauty & skincare', desc: 'High AOV, image-rich WhatsApp recovery and price-sensitive buyers.' },
                { icon: ShoppingBag, title: 'Apparel & footwear', desc: 'Seasonal, discount-driven shoppers who shamelessly bargain.' },
                { icon: Sparkles, title: 'Electronics & gadgets', desc: 'Comparison shoppers who will walk for ₹200 elsewhere.' },
              ].map((c) => (
                <div key={c.title} className="bg-slate-800/40 border border-blue-700/30 rounded-2xl p-6">
                  <div className="w-11 h-11 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/25 rounded-xl flex items-center justify-center mb-4">
                    <c.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{c.title}</h3>
                  <p className="text-sm text-blue-200/80">{c.desc}</p>
                </div>
              ))}
            </div>

            {/* Setup steps */}
            <div className="relative rounded-3xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-blue-950/60 to-slate-900 p-8 sm:p-12">
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl"></div>
              <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { icon: ShoppingCart, step: '01', title: 'Connect your store', desc: 'Authorize Shopify in minutes. Carts start syncing automatically via webhooks.' },
                  { icon: ShieldCheck, step: '02', title: 'Set your floor prices', desc: 'One rule or per-product. The engine hard-enforces every floor.' },
                  { icon: TrendingUp, step: '03', title: 'Watch revenue recover', desc: 'Recovery starts flowing — with live, attributable numbers on your dashboard.' },
                ].map((s) => (
                  <div key={s.step}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
                        <s.icon className="w-5 h-5 text-cyan-400" />
                      </div>
                      <span className="text-xs font-bold text-cyan-300/70">{s.step}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{s.title}</h3>
                    <p className="text-sm text-blue-200/80">{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-10 text-center">
                <Button isLink href="/signup" variant="primary" size="lg" aria-label="Start free to recover your first 50 carts">
                  Start Free — first 50 carts <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── INTEGRATIONS ─────────────────────────────────────── */}
        <section id="integrations" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-950" aria-labelledby="integrations-heading">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <h2 id="integrations-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Works with your platform</h2>
              <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">
                Shopify today. Everything else via API & webhooks — with WooCommerce and Magento on the roadmap.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-3xl mx-auto mb-8 sm:mb-12">
              <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-br from-green-600/20 to-green-700/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                    <ShoppingBag className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-600/40 text-[10px] font-semibold text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> LIVE
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Shopify</h3>
                <p className="text-blue-200 text-xs sm:text-sm mb-4">Direct integration. Automatic cart sync. Simple setup.</p>
                <button onClick={() => openModal('shopify')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-br from-purple-600/20 to-purple-700/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                    <Package className="w-7 h-7 sm:w-8 sm:h-8 text-purple-400" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-600/40 text-[10px] font-semibold text-amber-300">ROADMAP</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">WooCommerce</h3>
                <p className="text-blue-200 text-xs sm:text-sm mb-4">API &amp; webhook-based. On our roadmap — join the waitlist.</p>
                <button onClick={() => openModal('woocommerce')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gradient-to-br from-orange-600/20 to-orange-700/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                    <Settings className="w-7 h-7 sm:w-8 sm:h-8 text-orange-400" />
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-600/40 text-[10px] font-semibold text-amber-300">ROADMAP</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Magento</h3>
                <p className="text-blue-200 text-xs sm:text-sm mb-4">Enterprise API integration. On our roadmap.</p>
                <button onClick={() => openModal('magento')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
                <div className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform flex-shrink-0">
                  <Link2 className="w-7 h-7 sm:w-8 sm:h-8 text-blue-400" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Custom Platform</h3>
                <p className="text-blue-200 text-xs sm:text-sm mb-4">REST API. Webhook support. Technical docs included.</p>
                <button onClick={() => openModal('custom')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
              </div>
            </div>

            <div className="text-center py-6 sm:py-8 border-t border-blue-700/30">
              <p className="text-blue-200 mb-4 text-xs sm:text-sm">Any platform with webhook support can connect today. Not sure? Ask us.</p>
              <a href="https://wa.me/918708718426" target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-2 sm:py-3 border border-emerald-500 text-emerald-400 rounded-lg hover:bg-emerald-600/10 transition font-medium text-xs sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
                <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
                Contact Us
              </a>
            </div>
          </div>
        </section>

        {/* ── PRICING ──────────────────────────────────────────── */}
        <section id="pricing" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="pricing-heading">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 id="pricing-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
              <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">
                A fixed monthly subscription based on cart volume, plus revenue share only on CartGain-recovered revenue. First {FREE_CARTS_THRESHOLD} recovered carts free.
              </p>
            </div>

            {/* Billing Toggle */}
            <div className="flex justify-center mb-8">
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

            {/* Free Plan Hero Banner */}
            <div className="max-w-3xl mx-auto mb-12 bg-gradient-to-r from-emerald-900/30 via-slate-800/50 to-blue-900/30 border border-emerald-500/30 rounded-2xl p-8 backdrop-blur-sm text-center">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Start Free — {FREE_CARTS_THRESHOLD} Recovered Carts, ₹0</h3>
              <p className="text-blue-300/70 mb-6 max-w-xl mx-auto text-sm">
                No credit card required. Recover your first {FREE_CARTS_THRESHOLD} abandoned carts completely free.
                WhatsApp &amp; Email included today — SMS arrives soon. Upgrade when you grow.
              </p>
              <div className="flex items-center justify-center gap-6 text-sm text-emerald-300/80 mb-6 flex-wrap">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> WhatsApp &amp; Email (LIVE)</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> AI-powered negotiation</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Analytics dashboard</span>
              </div>
              <Link
                href="/signup"
                className="inline-block px-8 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/50 transition-all"
              >
                Start Free Trial →
              </Link>
            </div>

            {/* Paid Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
              {Object.values(PLANS).filter(p => p.price > 0 && p.id !== 'enterprise').map((plan) => {
                const isGrowth = plan.recommended
                const displayPrice = billing === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.price
                const period = billing === 'yearly' ? '/mo billed yearly' : '/mo'

                const theme = isGrowth
                  ? { border: 'border-amber-500/50', glow: 'shadow-amber-500/20', gradient: 'from-amber-500 to-orange-500', bg: 'bg-gradient-to-br from-amber-900/20 to-amber-800/10', badge: 'from-amber-500 to-orange-500', accent: 'amber' }
                  : { border: 'border-violet-500/40', glow: 'shadow-violet-500/20', gradient: 'from-violet-500 to-purple-500', bg: 'bg-gradient-to-br from-violet-900/20 to-purple-900/10', badge: 'from-violet-500 to-purple-500', accent: 'violet' }

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-6 sm:p-8 flex flex-col ${theme.bg} border-2 ${theme.border} hover:shadow-xl ${theme.glow} transition-all duration-300 h-full group`}
                  >
                    {isGrowth && (
                      <span className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full shadow-lg shadow-amber-500/30">
                        Recommended
                      </span>
                    )}

                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">{plan.name}</h3>
                    <p className={`text-sm ${theme.accent === 'cyan' ? 'text-cyan-300/80' : theme.accent === 'violet' ? 'text-violet-300/80' : 'text-amber-300/80'} mb-4`}>
                      Up to {plan.maxCarts === Infinity ? 'unlimited' : plan.maxCarts.toLocaleString('en-IN')} recovered carts/mo
                    </p>

                    <div className="mb-1">
                      <span className="text-3xl sm:text-4xl font-bold text-white">₹{displayPrice.toLocaleString('en-IN')}</span>
                      <span className="text-base text-blue-300/60 ml-1">{period}</span>
                    </div>
                    <p className="text-xs text-emerald-400/80 mb-1">
                      Est. additional recovery ₹{plan.estimatedRecovery.min.toLocaleString('en-IN')}-{plan.estimatedRecovery.max.toLocaleString('en-IN')}/mo
                    </p>
                    <p className="text-xs text-blue-300/40 mb-5">
                      + {plan.revSharePercent}% revenue share on CartGain-attributed recoveries (capped at ₹{plan.revShareCap.toLocaleString('en-IN')}/mo), after the first {FREE_CARTS_THRESHOLD}
                    </p>

                    {/* Bargain meters — the CartGain USP, surfaced per plan */}
                    <div className="mb-6 grid grid-cols-2 gap-2 text-center">
                      <div className="bg-slate-900/50 border border-blue-700/30 rounded-lg py-2.5">
                        <div className="text-lg font-bold text-emerald-400">{plan.bargainSessions === Infinity ? '∞' : plan.bargainSessions.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] uppercase tracking-wide text-blue-300/50">Bargain sessions</div>
                      </div>
                      <div className="bg-slate-900/50 border border-blue-700/30 rounded-lg py-2.5">
                        <div className="text-lg font-bold text-emerald-400">{plan.bargainDeals === Infinity ? '∞' : plan.bargainDeals.toLocaleString('en-IN')}{plan.bargainOverageDealPrice > 0 ? '+' : ''}</div>
                        <div className="text-[10px] uppercase tracking-wide text-blue-300/50">Accepted deals</div>
                        {plan.bargainOverageDealPrice > 0 && (
                          <div className="text-[10px] text-amber-300/70 mt-0.5">then ₹{plan.bargainOverageDealPrice}/extra</div>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8 flex-grow">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-blue-100 text-sm sm:text-base">
                          <CheckCircle2 className={`w-4 h-4 sm:w-5 sm:h-5 mt-0.5 flex-shrink-0 ${
                            theme.accent === 'amber' ? 'text-amber-400' : theme.accent === 'violet' ? 'text-violet-400' : 'text-cyan-400'
                          }`} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href="/signup"
                      className={`w-full py-3 rounded-lg font-semibold text-center text-sm sm:text-base min-h-12 inline-flex items-center justify-center transition-all bg-gradient-to-r ${theme.gradient} text-white hover:shadow-lg group-hover:scale-[1.02] ${
                        isGrowth ? 'hover:shadow-amber-500/50' : 'hover:shadow-violet-500/50'
                      }`}
                    >
                      {billing === 'yearly' ? 'Choose Plan' : 'Subscribe Now'}
                    </Link>
                  </div>
                )
              })}
            </div>

            {/* How Pricing Works */}
            <div className="max-w-5xl mx-auto bg-gradient-to-r from-slate-800/50 to-blue-900/30 border border-blue-700/30 rounded-xl p-6 sm:p-8 backdrop-blur-sm">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">%</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Simple, transparent pricing</h3>
                  <div className="space-y-2 text-sm text-blue-300/80">
                    <p className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Fixed monthly subscription based on your recovered-cart volume</span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>First <strong className="text-white">{FREE_CARTS_THRESHOLD} recovered carts</strong> — zero revenue share. We prove our value first.</span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Revenue share: <strong className="text-white">{PLANS.GROWTH.revSharePercent}% Growth</strong> (capped at ₹{PLANS.GROWTH.revShareCap.toLocaleString('en-IN')}/mo) / <strong className="text-white">{PLANS.PRO.revSharePercent}% Pro</strong> (capped at ₹{PLANS.PRO.revShareCap.toLocaleString('en-IN')}/mo).</span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Restricted to <strong className="text-white">CartGain-attributed recoveries</strong> — an order placed within 72 hours of one of our recovery messages. If we didn&apos;t recover it, you don&apos;t pay share on it.</span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Campaign limits per plan — <strong className="text-white">{PLANS.FREE.maxCampaigns} Free</strong> / <strong className="text-white">{PLANS.GROWTH.maxCampaigns} Growth</strong> / <strong className="text-white">{PLANS.PRO.maxCampaigns} Pro</strong> active campaigns</span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <span>Per-customer message caps: <strong className="text-white">{PLANS.FREE.maxMessagesPerCustomer.email} Free</strong> / <strong className="text-white">{PLANS.GROWTH.maxMessagesPerCustomer.email} Growth</strong> / <strong className="text-white">{PLANS.PRO.maxMessagesPerCustomer.email} Pro</strong> per channel. Paid overage billing if you need more.</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Worked Example */}
            <div className="max-w-5xl mx-auto mt-6 bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-700/30 rounded-xl p-6 sm:p-8">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-lg">₹</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Example: What do I actually pay?</h3>
                  <p className="text-sm text-blue-300/80 mb-3">On <strong className="text-white">Growth plan</strong> (₹{PLANS.GROWTH.price.toLocaleString('en-IN')}/mo) with <strong className="text-white">₹5,00,000/mo</strong> in CartGain-attributed recovered revenue:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <p className="text-blue-400/60 text-xs mb-1">Subscription</p>
                      <p className="text-white font-semibold">₹{PLANS.GROWTH.price.toLocaleString('en-IN')}/mo</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <p className="text-blue-400/60 text-xs mb-1">Revenue share ({PLANS.GROWTH.revSharePercent}% of ₹5L, capped at ₹{PLANS.GROWTH.revShareCap.toLocaleString('en-IN')})</p>
                      <p className="text-white font-semibold">₹{PLANS.GROWTH.revShareCap.toLocaleString('en-IN')}/mo</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <p className="text-blue-400/60 text-xs mb-1">Total monthly cost</p>
                      <p className="text-white font-bold text-base">₹{(PLANS.GROWTH.price + PLANS.GROWTH.revShareCap).toLocaleString('en-IN')}/mo</p>
                    </div>
                  </div>
                  <p className="text-xs text-blue-400/60 mt-3">First {FREE_CARTS_THRESHOLD} recovered carts are free — no revenue share until we prove our value.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section id="faq" className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="faq-heading">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 id="faq-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Frequently Asked Questions</h2>
              <p className="text-base sm:text-lg text-blue-100">Straight answers about recovery, margins, and pricing.</p>
            </div>

            <div className="space-y-3">
              {FAQS.map((faq, i) => {
                const open = openFaq === i
                return (
                  <div key={i} className={`bg-slate-800/40 border rounded-xl transition-colors ${open ? 'border-cyan-600/50' : 'border-blue-700/30 hover:border-blue-600/60'}`}>
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-button-${i}`}
                      className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded-xl"
                    >
                      <h3 className="text-base sm:text-lg font-semibold text-white">{faq.q}</h3>
                      <ChevronDown className={`w-5 h-5 text-cyan-400 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {open && (
                      <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} className="px-5 sm:px-6 pb-5">
                        <p className="text-sm text-blue-100 leading-relaxed">{faq.a}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-12 bg-gradient-to-r from-blue-900/40 to-cyan-900/40 border border-blue-700/40 rounded-xl p-8 text-center">
              <p className="text-white font-semibold mb-4">Didn&apos;t find your answer?</p>
              <a href="https://wa.me/918708718426" target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:shadow-lg hover:shadow-emerald-500/50 transition font-medium">
                <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
                Contact Us — We&apos;ll Explain Everything
              </a>
              <p className="text-blue-300/60 text-xs mt-4">Or email us at <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────────── */}
        <section className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-blue-950/80" aria-labelledby="cta-heading">
          <div className="max-w-4xl mx-auto text-center">
            <h2 id="cta-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Stop leaving revenue behind.</h2>
            <p className="text-base sm:text-lg md:text-xl text-blue-200 mb-8 sm:mb-12">
              Let CartGain recover the sales your store is already missing.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-2">
              <Link href="/signup" className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-blue-100 transition shadow-lg min-h-12 inline-flex items-center justify-center text-center">
                Start Recovering Revenue
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 border-2 border-blue-300 text-white font-semibold rounded-lg hover:bg-white/10 transition min-h-12 inline-flex items-center justify-center gap-2 text-center">
                See How It Works
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 sm:py-16 md:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 mb-8 sm:mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Image
                  src="/favicon-32x32.png"
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-md flex-shrink-0"
                />
                <span className="text-base sm:text-lg font-bold">CartGain</span>
              </div>
              <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                AI revenue recovery and negotiation for e-commerce. Recover abandoned carts, settle price objections, and protect your margins — all in one place.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm sm:text-base">Product</h4>
              <ul className="space-y-2 text-gray-400 text-xs sm:text-sm">
                <li><Link href="#what" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Why CartGain</Link></li>
                <li><Link href="#bargain" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">AI Negotiator</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Pricing</Link></li>
                <li><Link href="/demo" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Live Demo</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm sm:text-base">How It Works</h4>
              <ul className="space-y-2 text-gray-400 text-xs sm:text-sm">
                <li><Link href="#how-it-works" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Recovery pipeline</Link></li>
                <li><Link href="#dashboard" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Revenue dashboard</Link></li>
                <li><Link href="#calculator" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">ROI calculator</Link></li>
                <li><Link href="#integrations" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm sm:text-base">Legal &amp; Contact</h4>
              <ul className="space-y-2 text-gray-400 text-xs sm:text-sm">
                <li><Link href="/privacy" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Terms of Service</Link></li>
                <li><Link href="/dpa" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">DPA</Link></li>
                <li><Link href="/security-policy" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Security</Link></li>
                <li><a href="mailto:support@cart-gain.com" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Email Us</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 sm:pt-12 text-center text-gray-400 text-xs sm:text-sm">
            © 2026 CartGain. AI revenue recovery &amp; negotiation for e-commerce. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Integration Modal */}
      {activeModal && INTEGRATION_DETAILS[activeModal as keyof typeof INTEGRATION_DETAILS] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="integration-modal-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div className="bg-slate-800 border border-blue-700/50 rounded-2xl p-6 sm:p-8 max-w-lg w-full relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-blue-300 hover:text-white transition p-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 id="integration-modal-title" className="text-2xl font-bold text-white mb-2">
                {INTEGRATION_DETAILS[activeModal as keyof typeof INTEGRATION_DETAILS].title}
              </h3>
              <p className="text-blue-200">
                {INTEGRATION_DETAILS[activeModal as keyof typeof INTEGRATION_DETAILS].description}
              </p>
            </div>

            <div className="mb-6">
              <h4 className="font-semibold text-white mb-3">Key Features:</h4>
              <ul className="space-y-2">
                {INTEGRATION_DETAILS[activeModal as keyof typeof INTEGRATION_DETAILS].features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-blue-100 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-200">
                <span className="font-semibold text-cyan-300">Setup:</span> {INTEGRATION_DETAILS[activeModal as keyof typeof INTEGRATION_DETAILS].setup}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/signup"
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition text-center"
                onClick={closeModal}
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}