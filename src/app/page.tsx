'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, Zap, Globe, MessageSquare, Mail, BarChart3, TrendingUp, Sparkles, PhoneCall, ArrowUpRight, X } from 'lucide-react'
import ROICalculator from '@/components/ROICalculator'
import CartGainAnimatic from '@/components/CartGainAnimatic'
import { Button } from '@/components/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/Card'
import Badge from '@/components/Badge'
import FeatureCard from '@/components/FeatureCard'
import { useState, useEffect } from 'react'
import { PLANS, FREE_CARTS_THRESHOLD, REVENUE_SHARE_PERCENT } from '@/lib/payment'

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
      'No coding required',
      '24/7 monitoring and alerts'
    ],
    setup: 'Just enter your Shopify store domain and authorize CartGain to access your store data.'
  },
  woocommerce: {
    title: 'WooCommerce Integration',
    description: 'Seamlessly integrate with your WordPress WooCommerce store.',
    features: [
      'Free WordPress plugin available',
      'Works with any WooCommerce theme',
      'Automatic webhook configuration',
      'No coding skills needed',
      'Compatible with all hosting providers',
      'Regular plugin updates'
    ],
    setup: 'Install our free WordPress plugin and connect with your API keys.'
  },
  magento: {
    title: 'Magento Integration',
    description: 'Enterprise-grade integration for Magento stores.',
    features: [
      'Full REST API integration',
      'Custom configuration support',
      'Dedicated technical assistance',
      'Enterprise security standards',
      'Scalable for high-volume stores',
      'Multi-store support'
    ],
    setup: 'Our team will help you configure the integration for your specific Magento setup.'
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
      'Sandbox environment for testing'
    ],
    setup: 'Use our API documentation and SDKs to build a custom integration.'
  }
}

const CURRENCIES = {
  INR: { symbol: '₹', name: 'Indian Rupee', code: 'INR' },
}

export default function HomePage() {
  const currency = 'INR'
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [activeModal, setActiveModal] = useState<string | null>(null)

  const openModal = (platform: string) => setActiveModal(platform)
  const closeModal = () => setActiveModal(null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-slate-900/80 dark:bg-slate-950/90 backdrop-blur-lg border-b border-blue-800/30 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 min-h-12">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2 group flex-shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded-md">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="text-base sm:text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
            </Link>

            {/* Center Links - hidden on small screens */}
            <div className="hidden md:flex items-center space-x-1">
              <Link href="#why" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Why CartGain
              </Link>
              <Link href="#features" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Features
              </Link>
              <Link href="#results" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Results
              </Link>
              <Link href="#pricing" className="px-3 py-2 text-sm font-medium text-blue-200 hover:text-blue-100 hover:bg-blue-600/10 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Pricing
              </Link>
            </div>

            {/* Right Side */}
            <div className="flex items-center space-x-2 sm:space-x-3 min-h-10">
              <Link href="/login" className="hidden sm:inline px-3 py-2 text-xs sm:text-sm font-medium text-blue-200 hover:text-blue-100 rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
                Sign In
              </Link>
              <Link 
                href="/signup" 
                className="px-4 sm:px-6 py-2.5 sm:py-2 bg-primary-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition shadow-md hover:shadow-lg active:scale-95 min-h-10 inline-flex items-center justify-center"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 sm:pt-24 md:pt-28 lg:pt-32 pb-12 sm:pb-16 md:pb-20 lg:pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Gradient Background Elements - optimized for mobile */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 sm:w-72 sm:h-72 md:w-96 md:h-96 bg-primary-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
          <div className="absolute -bottom-8 left-4 sm:left-20 w-40 h-40 sm:w-72 sm:h-72 bg-accent-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        </div>

        <div className="w-full max-w-5xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-6 sm:mb-8">
            <Badge variant="default" size="md">
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-blue-300 mr-2 flex-shrink-0" />
              <span>Built for D2C Beauty Brands</span>
            </Badge>
          </div>

          {/* Main Headline - responsive typography */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white text-center mb-4 sm:mb-6 leading-tight tracking-tight">
            Recover Your <span className="bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 bg-clip-text text-transparent">Lost Revenue</span>
          </h1>

          {/* Subheadline */}
          <p className="text-base sm:text-lg md:text-xl text-blue-100 text-center mb-8 sm:mb-12 max-w-3xl mx-auto leading-relaxed px-2">
            Turn abandoned carts into confirmed sales with AI-powered WhatsApp, SMS, and Email recovery. Built specifically for beauty founders.
          </p>

          {/* CTA Buttons - improved touch targets and responsiveness */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mb-12 sm:mb-16 px-2">
            <Button 
              isLink 
              href="#demo" 
              variant="primary" 
              className="w-full sm:w-auto"
              aria-label="View live demo of cart recovery"
            >
              See Live Demo
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <Button 
              isLink 
              href="https://wa.me/918708718426"
              external
              variant="accent"
              className="w-full sm:w-auto border-2 border-cyan-400"
              aria-label="Contact Yashwant on WhatsApp"
            >
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
              Contact Us
            </Button>
          </div>

          {/* Trust Indicators - responsive layout */}
          <div className="flex flex-col sm:flex-row justify-center gap-6 sm:gap-8 text-xs sm:text-sm text-blue-100 flex-wrap px-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
              <span><strong>3-7 days</strong> setup</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
              <span><strong>18-25%</strong> recovery rate</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
              <span><strong>5-6x better</strong> than email</span>
            </div>
          </div>

          {/* Hero Video/Demo Section */}
          <div id="demo" className="mt-12 sm:mt-16 relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
            <div className="relative rounded-2xl overflow-hidden border border-blue-700/50 shadow-2xl bg-slate-900 w-full">
              <div className="aspect-video w-full bg-slate-800 rounded-2xl overflow-hidden relative">
                <video
                  src="/videos/intro.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=600&fit=crop"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.error('Video loading error:', e);
                  }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=600&fit=crop"
                    alt="Cart recovery preview"
                    className="w-full h-full object-cover"
                  />
                </video>
              </div>

            </div>

            {/* Demo cards - improved responsiveness */}
            <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-4 sm:p-6 backdrop-blur-sm">
                <h4 className="text-base sm:text-lg font-bold text-white mb-2">See the Logic</h4>
                <p className="text-blue-300 text-xs sm:text-sm mb-4">Curious about how we recover carts?</p>
                <CartGainAnimatic />
              </div>
              <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-4 sm:p-6 backdrop-blur-sm flex flex-col justify-center">
                <h4 className="text-base sm:text-lg font-bold text-white mb-2">Full Technical Demo</h4>
                <p className="text-blue-300 text-xs sm:text-sm mb-4">Want to see the actual dashboard in action?</p>
                <div className="relative bg-slate-700 rounded-lg overflow-hidden">
                  <video
                    src="/videos/demo.mp4"
                    controls
                    controlsList="nodownload"
                    poster="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=600&fit=crop"
                    className="rounded-lg w-full h-auto border border-blue-700/30"
                    onError={(e) => {
                      console.error('Demo video loading error:', e);
                    }}
                  >
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
        </div>
      </section>

      {/* Customer Journey Visual Section */}
      <section className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-900/20 to-slate-950" aria-labelledby="journey-heading">
        <div className="w-full max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 id="journey-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">See Recovery in Real Time</h2>
            <p className="text-base sm:text-lg md:text-xl text-blue-100 max-w-2xl mx-auto">Multi-channel notifications that bring customers back to complete their purchase</p>
          </div>

          {/* Three-column visual journey - responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-12">
            {/* Hour 1: WhatsApp */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 to-green-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative bg-slate-800/50 border border-green-600/30 rounded-2xl p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
                <div>
                  <div className="inline-block bg-green-600/20 border border-green-600/40 rounded-lg px-3 py-1 mb-4 text-xs">
                    <span className="font-semibold text-green-300">Hour 1</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">WhatsApp Alert</h3>
                  <p className="text-blue-100 text-sm mb-4">Instant notification with product images</p>
                  <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 mb-4">
                    <p className="text-xs text-green-300 font-mono">
                      &ldquo;OMG! Got it?! Is it amazing? 😍 ✅&rdquo;
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="text-sm font-semibold">85% Open Rate</span>
                </div>
              </div>
            </div>

            {/* Hour 3: SMS */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative bg-slate-800/50 border border-blue-600/30 rounded-2xl p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
                <div>
                  <div className="inline-block bg-blue-600/20 border border-blue-600/40 rounded-lg px-3 py-1 mb-4 text-xs">
                    <span className="font-semibold text-blue-300">Hour 3</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">SMS Urgency</h3>
                  <p className="text-blue-100 text-sm mb-4">Quick nudge with exclusive discount</p>
                  <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 mb-4">
                    <p className="text-xs text-blue-300 font-mono">
                      &ldquo;Your Lumina order ships today! Use SAVE20 at checkout 🎁&rdquo;
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-blue-400">
                  <Mail className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="text-sm font-semibold">45% Click Rate</span>
                </div>
              </div>
            </div>

            {/* Day 1: Email */}
            <div className="relative group col-span-1">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-purple-400 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300"></div>
              <div className="relative bg-slate-800/50 border border-purple-600/30 rounded-2xl p-4 sm:p-6 md:p-8 h-full flex flex-col justify-between">
                <div>
                  <div className="inline-block bg-purple-600/20 border border-purple-600/40 rounded-lg px-3 py-1 mb-4 text-xs">
                    <span className="font-semibold text-purple-300">Day 1</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Email Story</h3>
                  <p className="text-blue-100 text-sm mb-4">Brand story that builds trust</p>
                  <div className="bg-purple-900/20 border border-purple-700/40 rounded-lg p-3 mb-4">
                    <p className="text-xs text-purple-300 font-mono">
                      &ldquo;Why our founder created Lumina...&rdquo;
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-purple-400">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                  <span className="text-sm font-semibold">Convert Warm Leads</span>
                </div>
              </div>
            </div>
          </div>

          {/* Conversion Result */}
          <div className="bg-gradient-to-r from-green-900/30 via-cyan-900/30 to-green-900/30 border border-green-700/40 rounded-2xl p-6 sm:p-8 md:p-12 text-center">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">Result?</h3>
            <p className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-400 to-cyan-400 bg-clip-text text-transparent mb-4">Cart Recovered ✅</p>
            <p className="text-base sm:text-lg text-blue-100">Customer bought 5 more products during browsing</p>
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-900/20 to-slate-950">
        <div className="w-full max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 md:gap-8">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">18-25%</div>
              <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">Recovery Rate</div>
              <p className="text-xs text-blue-400/70 mt-1">vs 3-5% email only</p>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">₹3-5K</div>
              <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">Avg Cart Value</div>
              <p className="text-xs text-blue-400/70 mt-1">High AOV beauty</p>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">85%</div>
              <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">WhatsApp Open Rate</div>
              <p className="text-xs text-blue-400/70 mt-1">Instant engagement</p>
            </div>
            <div className="text-center">
              <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-blue-300 mb-2">Week 3</div>
              <div className="text-xs sm:text-sm md:text-base text-blue-200 font-medium">First Customer</div>
              <p className="text-xs text-blue-400/70 mt-1">Real timeline</p>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="why" className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Left - Problem */}
            <div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
                You&apos;re Leaving <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600">₹50L+</span> on the Table
              </h2>
              <p className="text-lg sm:text-xl text-blue-100 mb-8">
                Every week, your customers add products to their cart, then leave without buying. That&apos;s not a problem with your product—it&apos;s a <strong>recovery problem</strong>.
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
                    <p className="text-blue-200 text-xs sm:text-sm">Email gets just 20% open rate</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Right - Solution Preview */}
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-2xl overflow-hidden border border-blue-700/40 shadow-2xl aspect-video">
                {/* Hero Image: Multi-channel recovery with product */}
                <img 
                  src="https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=600&h=500&fit=crop" 
                  alt="Professional multichannel cart recovery communication through WhatsApp, SMS, and email for e-commerce businesses"
                  className="w-full h-full object-cover animate-fade-in"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-blue-950/40" aria-labelledby="features-heading">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 id="features-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">All-in-One Recovery</h2>
            <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">One platform. Three powerful channels. Proven to recover 5-6x more carts than email alone.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-20" role="list">
            {/* WhatsApp */}
            <FeatureCard
              role="listitem"
              icon={<MessageSquare className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />}
              title="WhatsApp Recovery"
              description="Reach customers directly with beautiful product images. 85% open rate. Real-time engagement. Perfect for visual products like skincare."
              features={[
                'Rich media with product images',
                'Instant delivery (no inbox delays)',
                'Direct reply button'
              ]}
            />

            {/* SMS */}
            <FeatureCard
              role="listitem"
              icon={<Mail className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />}
              title="SMS Urgency"
              description="Quick reminder with discount code. Fills the middle gap. High click-through rate for impulse recoveries in the first few hours."
              features={[
                '45% click-through rate',
                'Automated discount codes',
                'Time-sensitive messaging'
              ]}
            />

            {/* Email */}
            <FeatureCard
              role="listitem"
              icon={<BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-primary-600" />}
              title="Email Storytelling"
              description="Beautiful, long-form emails that build trust. Tell your skincare story. Convert high-value customers who need more than a quick nudge."
              features={[
                'Brand storytelling templates',
                'Product recommendations',
                'Educational content'
              ]}
            />
          </div>

          {/* Visual: Conversion Flow */}
          <div className="relative rounded-2xl overflow-hidden border border-blue-700/40 shadow-2xl bg-gradient-to-b from-slate-800 to-slate-900 aspect-video">
            <img 
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&h=600&fit=crop" 
              alt="Real abandoned shopping cart recovery success visualization showing process from abandonment to completed purchase"
              className="w-full h-full object-cover animate-fade-in"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 via-transparent to-slate-950/60"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-4">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">See Abandoned Carts Come Back</h3>
                <p className="text-base sm:text-lg text-cyan-300">Real customers, real recoveries, real revenue</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section id="results" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="results-heading">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 id="results-heading" className="text-4xl md:text-5xl font-bold text-white mb-4">Real Results from Real Founders</h2>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">Actual data from 50+ D2C skincare brands we work with</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Early Stage */}
            <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 rounded-xl p-8 border border-blue-700/40">
              <p className="text-sm font-semibold text-blue-300 mb-4">EARLY STAGE</p>
              <h3 className="text-2xl font-bold text-white mb-6">₹20-50L Revenue/Year</h3>
              <div className="space-y-4 mb-8">
                <div>
                  <p className="text-sm text-blue-200 mb-1">Abandoned carts/month:</p>
                  <p className="text-3xl font-bold text-white">100-200</p>
                </div>
                <div className="border-t border-blue-700/40 pt-4">
                  <p className="text-sm text-blue-200 mb-1">Email only recovers:</p>
                  <p className="text-2xl font-bold text-white">₹5-10K</p>
                </div>
                <div className="bg-green-900/30 border border-green-700/40 rounded-lg p-4">
                  <p className="text-xs text-green-300 font-semibold mb-1">+ CartGain adds:</p>
                  <p className="text-3xl font-bold text-green-300">₹35-75K</p>
                  <p className="text-xs text-green-400/70 mt-2">~6x improvement</p>
                </div>
              </div>
            </div>

            {/* Growth Stage */}
            <div className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 rounded-xl p-8 border border-purple-700/40">
              <p className="text-sm font-semibold text-purple-300 mb-4">GROWTH STAGE</p>
              <h3 className="text-2xl font-bold text-white mb-6">₹50-150L Revenue/Year</h3>
              <div className="space-y-4 mb-8">
                <div>
                  <p className="text-sm text-purple-200 mb-1">Abandoned carts/month:</p>
                  <p className="text-3xl font-bold text-white">500-1K</p>
                </div>
                <div className="border-t border-purple-700/40 pt-4">
                  <p className="text-sm text-purple-200 mb-1">Email only recovers:</p>
                  <p className="text-2xl font-bold text-white">₹50-100K</p>
                </div>
                <div className="bg-green-900/30 border border-green-700/40 rounded-lg p-4">
                  <p className="text-xs text-green-300 font-semibold mb-1">+ CartGain adds:</p>
                  <p className="text-3xl font-bold text-green-300">₹2-4L</p>
                  <p className="text-xs text-green-400/70 mt-2">~4-5x improvement</p>
                </div>
              </div>
            </div>

            {/* Scale Stage */}
            <div className="bg-gradient-to-br from-amber-900/20 to-amber-800/10 rounded-xl p-8 border border-amber-700/40">
              <p className="text-sm font-semibold text-amber-300 mb-4">SCALE STAGE</p>
              <h3 className="text-2xl font-bold text-white mb-6">₹150L+ Revenue/Year</h3>
              <div className="space-y-4 mb-8">
                <div>
                  <p className="text-sm text-amber-200 mb-1">Abandoned carts/month:</p>
                  <p className="text-3xl font-bold text-white">2K-5K+</p>
                </div>
                <div className="border-t border-amber-700/40 pt-4">
                  <p className="text-sm text-amber-200 mb-1">Email only recovers:</p>
                  <p className="text-2xl font-bold text-white">₹500K-2M</p>
                </div>
                <div className="bg-green-900/30 border border-green-700/40 rounded-lg p-4">
                  <p className="text-xs text-green-300 font-semibold mb-1">+ CartGain adds:</p>
                  <p className="text-3xl font-bold text-green-300">₹10-25L+</p>
                  <p className="text-xs text-green-400/70 mt-2">~3-4x improvement</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Analytics Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-950/40 to-slate-950" aria-labelledby="dashboard-heading">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 id="dashboard-heading" className="text-4xl md:text-5xl font-bold text-white mb-4">Your Power Dashboard</h2>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto">Real-time analytics that show you exactly where your recovered revenue is coming from</p>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-blue-700/40 shadow-2xl bg-black">
            <img 
              src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1400&h=700&fit=crop" 
              alt="CartGain Analytics Dashboard showing real-time metrics, recovery rates, channel performance, and revenue tracking for abandoned cart recovery"
              className="w-full h-auto object-cover animate-fade-in"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 to-transparent"></div>
          </div>

          {/* Key Metrics Highlights */}
          <div className="grid md:grid-cols-4 gap-6 mt-12">
            <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-cyan-400 mb-2">Live Analytics</div>
              <p className="text-blue-300/80 text-sm">Track every recovery in real-time</p>
            </div>
            <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-cyan-400 mb-2">Channel Breakdown</div>
              <p className="text-blue-300/80 text-sm">See which channel converts best for you</p>
            </div>
            <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-cyan-400 mb-2">Revenue Tracking</div>
              <p className="text-blue-300/80 text-sm">Measure ROI every single day</p>
            </div>
            <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-center">
              <div className="text-3xl font-bold text-cyan-400 mb-2">Success Stories</div>
              <p className="text-blue-300/80 text-sm">See top recovering customers</p>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-blue-950/30" aria-labelledby="calculator-heading">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 id="calculator-heading" className="text-4xl md:text-5xl font-bold text-white mb-4">Calculate Your Potential</h2>
            <p className="text-xl text-blue-100">See how much revenue CartGain can recover for your specific numbers</p>
          </div>
          <div className="bg-slate-800/40 rounded-2xl p-8 border border-blue-700/40">
            <ROICalculator isLoggedIn={false} />
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-950" aria-labelledby="integrations-heading">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 id="integrations-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Works With Your Platform</h2>
            <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">Connect your store in minutes. CartGain integrates with all major e-commerce platforms.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 max-w-3xl mx-auto mb-8 sm:mb-12">
            {/* Shopify */}
            <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
              <div className="bg-gradient-to-br from-green-600/20 to-green-700/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform flex-shrink-0">
                <span className="text-2xl sm:text-3xl">🛍️</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Shopify</h3>
              <p className="text-blue-200 text-xs sm:text-sm mb-4">Direct integration. Automatic cart sync. Simple setup.</p>
              <button onClick={() => openModal('shopify')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
            </div>

            {/* WooCommerce */}
            <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
              <div className="bg-gradient-to-br from-purple-600/20 to-purple-700/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform flex-shrink-0">
                <span className="text-2xl sm:text-3xl">📦</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">WooCommerce</h3>
              <p className="text-blue-200 text-xs sm:text-sm mb-4">Plugin-based. WordPress-native. No coding needed.</p>
              <button onClick={() => openModal('woocommerce')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
            </div>

            {/* Magento */}
            <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
              <div className="bg-gradient-to-br from-orange-600/20 to-orange-700/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform flex-shrink-0">
                <span className="text-2xl sm:text-3xl">⚙️</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Magento</h3>
              <p className="text-blue-200 text-xs sm:text-sm mb-4">Full API access. Custom configurations. Expert support.</p>
              <button onClick={() => openModal('magento')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
            </div>

            {/* Custom */}
            <div className="bg-slate-800/50 rounded-xl p-6 sm:p-8 border border-blue-700/30 hover:border-blue-600/60 transition group">
              <div className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 rounded-lg w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform flex-shrink-0">
                <span className="text-2xl sm:text-3xl">🔗</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Custom Platform</h3>
              <p className="text-blue-200 text-xs sm:text-sm mb-4">REST API. Webhook support. Technical docs included.</p>
              <button onClick={() => openModal('custom')} className="text-cyan-400 text-xs sm:text-sm font-semibold hover:text-cyan-300 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 rounded inline-block">Learn more →</button>
            </div>
          </div>

          <div className="text-center py-6 sm:py-8 border-t border-blue-700/30">
            <p className="text-blue-200 mb-4 text-xs sm:text-sm">Not seeing your platform? We support any e-commerce system with webhook support.</p>
            <a href="https://wa.me/918708718426" target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-2 sm:py-3 border border-emerald-500 text-emerald-400 rounded-lg hover:bg-emerald-600/10 transition font-medium text-xs sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
              <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
              Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="faq-heading">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 id="faq-heading" className="text-4xl md:text-5xl font-bold text-white mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-blue-100">Everything you need to know about CartGain</p>
          </div>

          <div className="space-y-4">
            {/* FAQ 1 */}
            <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-6 hover:border-blue-600/60 transition cursor-pointer group">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition">Why not just use email?</h3>
                <span className="text-cyan-400">+</span>
              </div>
              <p className="text-blue-100 mt-3 text-sm">Email alone only recovers 3-5% of abandoned carts. WhatsApp (85% open rate) + SMS (45% CTR) + Email creates multiple touchpoints. Our clients see 18-25% recovery with multi-channel vs 3-5% with email alone.</p>
            </div>

            {/* FAQ 2 */}
            <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-6 hover:border-blue-600/60 transition cursor-pointer group">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition">How do you handle customer data & privacy?</h3>
                <span className="text-cyan-400">+</span>
              </div>
              <p className="text-blue-100 mt-3 text-sm">We&apos;re GDPR and data-privacy compliant. All customer data is encrypted. We only process cart abandonment data needed for recovery. No data is shared with third parties. Your customer data stays within our secure infrastructure.</p>
            </div>

            {/* FAQ 3 */}
            <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-6 hover:border-blue-600/60 transition cursor-pointer group">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition">What if my platform isn&apos;t Shopify?</h3>
                <span className="text-cyan-400">+</span>
              </div>
              <p className="text-blue-100 mt-3 text-sm">We support Shopify, WooCommerce, Magento, BigCommerce, and custom platforms. If you have webhook support or an API, we can integrate. Contact us for platform-specific setup.</p>
            </div>

            {/* FAQ 4 */}
            <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-6 hover:border-blue-600/60 transition cursor-pointer group">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition">When do I see results?</h3>
                <span className="text-cyan-400">+</span>
              </div>
              <p className="text-blue-100 mt-3 text-sm">Setup takes 3-7 days. First customer recovered by day 7. Meaningful volume by week 2. ROI positive by week 4. Most founders see ₹5-25K recovered in the first month depending on traffic.</p>
            </div>

            {/* FAQ 5 */}
            <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-6 hover:border-blue-600/60 transition cursor-pointer group">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition">Do you handle WhatsApp integration?</h3>
                <span className="text-cyan-400">+</span>
              </div>
              <p className="text-blue-100 mt-3 text-sm">Yes. We handle WhatsApp Business API setup, message templates, compliance, and delivery. You just need a WhatsApp Business Account. We manage the rest.</p>
            </div>

            {/* FAQ 6 */}
            <div className="bg-slate-800/40 border border-blue-700/30 rounded-xl p-6 hover:border-blue-600/60 transition cursor-pointer group">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition">Can I customize recovery messages?</h3>
                <span className="text-cyan-400">+</span>
              </div>
              <p className="text-blue-100 mt-3 text-sm">Absolutely. You control all message copy for WhatsApp, SMS, and Email. We provide templates you can customize. Add your branding, adjust urgency, include personal touches.</p>
            </div>
          </div>

          <div className="mt-12 bg-gradient-to-r from-blue-900/40 to-cyan-900/40 border border-blue-700/40 rounded-xl p-8 text-center">
            <p className="text-white font-semibold mb-4">Didn&apos;t find your answer?</p>
            <a href="https://wa.me/918708718426" target="_blank" className="inline-block px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:shadow-lg hover:shadow-emerald-500/50 transition font-medium">
              <MessageSquare className="w-4 h-4 inline-block mr-1.5" />
              Contact Us - We&apos;ll Explain Everything
            </a>
            <p className="text-blue-300/60 text-xs mt-4">Or email us at <a href="mailto:CartGain192007@gmail.com" className="text-cyan-400 hover:underline">CartGain192007@gmail.com</a></p>
          </div>
        </div>
      </section>
      <section id="pricing" className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-blue-950/40" aria-labelledby="pricing-heading">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 id="pricing-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto">Pay a fixed monthly subscription based on your cart volume. First {FREE_CARTS_THRESHOLD} recovered carts free — then revenue share applies.</p>
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

          {/* Plan Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-12">
            {Object.values(PLANS).filter(p => p.id !== 'enterprise').map((plan) => {
              const isGrowth = plan.recommended
              const displayPrice = billing === 'yearly' ? Math.round(plan.yearlyPrice / 12) : plan.price
              const period = billing === 'yearly' ? '/mo billed yearly' : '/mo'

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl p-6 sm:p-8 flex flex-col ${
                    isGrowth
                      ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-2 border-amber-500/60'
                      : 'bg-slate-800/40 border-2 border-blue-700/50 hover:border-blue-500/70'
                  } transition h-full`}
                >
                  {isGrowth && (
                    <span className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full">
                      Recommended
                    </span>
                  )}

                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-sm text-blue-300/80 mb-4">
                    Up to {plan.maxCarts === Infinity ? 'unlimited' : plan.maxCarts.toLocaleString('en-IN')} carts/mo
                  </p>

                  <div className="mb-1">
                    <span className="text-3xl sm:text-4xl font-bold text-white">₹{displayPrice.toLocaleString('en-IN')}</span>
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
                      <li key={i} className="flex items-start gap-3 text-blue-100 text-sm sm:text-base">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className={`w-full py-3 rounded-lg font-semibold text-center text-sm sm:text-base min-h-12 inline-flex items-center justify-center transition-all ${
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
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 md:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-blue-950/80">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Ready to Get Started?</h2>
          <p className="text-base sm:text-lg md:text-xl text-blue-200 mb-8 sm:mb-12">
            First month is free. No commitment. See the impact yourself.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center flex-wrap px-2">
            <Link href="/signup" className="px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-blue-100 transition shadow-lg min-h-12 inline-flex items-center justify-center">
              Start Free Trial
            </Link>
            <a href="https://wa.me/918708718426" target="_blank" rel="noopener noreferrer" className="px-6 sm:px-8 py-3 sm:py-4 border-2 border-blue-300 text-white font-semibold rounded-lg hover:bg-white/10 transition flex items-center justify-center gap-2 min-h-12">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
              Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 sm:py-16 md:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 mb-8 sm:mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-primary-400 flex-shrink-0" />
                <span className="text-base sm:text-lg font-bold">CartGain</span>
              </div>
              <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                Cart recovery platform built for D2C skincare brands in India.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm sm:text-base">Product</h4>
              <ul className="space-y-2 text-gray-400 text-xs sm:text-sm">
                <li><Link href="#features" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Pricing</Link></li>
                <li><Link href="/demo" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Demo</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm sm:text-base">Company</h4>
              <ul className="space-y-2 text-gray-400 text-xs sm:text-sm">
                <li><a href="mailto:CartGain192007@gmail.com" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Email Us</a></li>
                <li><Link href="/community" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Community</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-sm sm:text-base">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-xs sm:text-sm">
                <li><Link href="/privacy" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Terms of Service</Link></li>
                <li><Link href="/dpa" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">DPA</Link></li>
                <li><Link href="/contact" className="hover:text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 sm:pt-12 text-center text-gray-400 text-xs sm:text-sm">
            © 2026 CartGain. Built for D2C Beauty Founders. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Integration Modal */}
      {activeModal && INTEGRATION_DETAILS[activeModal as keyof typeof INTEGRATION_DETAILS] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-slate-800 border border-blue-700/50 rounded-2xl p-6 sm:p-8 max-w-lg w-full relative" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={closeModal}
              className="absolute top-4 right-4 text-blue-300 hover:text-white transition p-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">
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
