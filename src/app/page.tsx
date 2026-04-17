import Link from 'next/link'
import { ArrowRight, CheckCircle2, Zap, Target, BarChart3, Shield, Globe, MessageSquare, Mail, Bell } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Zap className="w-8 h-8 text-primary-600" />
              <span className="text-xl font-bold gradient-text">RecoverFlow</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="#features" className="text-gray-600 hover:text-gray-900">Features</Link>
              <Link href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</Link>
              <Link href="#testimonials" className="text-gray-600 hover:text-gray-900">Testimonials</Link>
              <Link href="#faq" className="text-gray-600 hover:text-gray-900">FAQ</Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-600 hover:text-gray-900 font-medium">
                Login
              </Link>
              <Link href="/signup" className="btn-primary">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 bg-gradient-to-br from-primary-50 via-white to-accent-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
              </span>
              Recover 3x More Carts Than Email Alone
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Turn Abandoned Carts Into{' '}
              <span className="gradient-text">Recovered Revenue</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Multi-channel cart recovery with SMS, WhatsApp, Email & Push notifications.
              AI-optimized sequences that recover up to 18% of abandoned carts.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link href="/signup" className="btn-primary text-lg px-8 py-4">
                Start Recovering Carts
                <ArrowRight className="inline ml-2 w-5 h-5" />
              </Link>
              <Link href="#demo" className="btn-secondary text-lg px-8 py-4">
                Watch Demo
              </Link>
            </div>
            <div className="flex items-center justify-center space-x-8 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>First cart recovered free</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span>2-minute setup</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">$7M+</div>
              <div className="text-gray-600">Revenue Recovered</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">500+</div>
              <div className="text-gray-600">Active Stores</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">18%</div>
              <div className="text-gray-600">Avg Recovery Rate</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold gradient-text mb-2">99%</div>
              <div className="text-gray-600">SMS Open Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Why RecoverFlow Beats Email-Only Recovery
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Email gets 20% open rates. Our multi-channel approach gets 99%.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={<MessageSquare className="w-8 h-8 text-primary-600" />}
              title="SMS Recovery"
              description="99% open rate, 50% click-through. Recover carts within minutes of abandonment."
            />
            <FeatureCard
              icon={<Globe className="w-8 h-8 text-accent-600" />}
              title="WhatsApp Messages"
              description="Rich media messages with product images. Perfect for international customers."
            />
            <FeatureCard
              icon={<Mail className="w-8 h-8 text-primary-600" />}
              title="Email Sequences"
              description="Beautiful, personalized emails with dynamic discount codes and product recommendations."
            />
            <FeatureCard
              icon={<Bell className="w-8 h-8 text-accent-600" />}
              title="Push Notifications"
              description="Browser and mobile push for customers who opted in. Free, instant delivery."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Recover Carts in 3 Simple Steps
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            <StepCard
              number="01"
              title="Connect Your Store"
              description="One-click integration with Shopify, WooCommerce, or any platform via API."
            />
            <StepCard
              number="02"
              title="Configure Your Campaign"
              description="Set up multi-channel sequences with AI-optimized timing and messaging."
            />
            <StepCard
              number="03"
              title="Watch Revenue Roll In"
              description="Real-time dashboard shows recovered carts and revenue attribution."
            />
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              RecoverFlow vs. The Rest
            </h2>
          </div>
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-primary-600">RecoverFlow</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-500">CartBoss</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-500">Klaviyo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <TableRow feature="SMS Recovery" us={true} them={true} other={false} />
                <TableRow feature="WhatsApp Recovery" us={true} them={false} other={false} />
                <TableRow feature="Email Recovery" us={true} them={false} other={true} />
                <TableRow feature="Push Notifications" us={true} them={false} other={false} />
                <TableRow feature="AI Optimization" us={true} them={false} other={false} />
                <TableRow feature="Multi-Platform" us={true} them={true} other={true} />
                <TableRow feature="Pay-As-You-Go" us={true} them={true} other={false} />
                <TableRow feature="Starting Price" us="$0.02/SMS" them="$0.025/SMS" other="$20/mo" />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Pay only for what you use. No monthly minimums.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <PricingCard
              name="Free"
              price="$0"
              period="forever"
              description="Perfect for testing the waters"
              features={[
                'First cart recovered free',
                'Email recovery only',
                'Up to 50 carts/month',
                'Basic analytics',
                'Shopify integration',
              ]}
              cta="Start Free"
              popular={false}
            />
            <PricingCard
              name="Pay-As-You-Go"
              price="$0.02"
              period="per SMS"
              description="For growing stores"
              features={[
                'SMS + WhatsApp + Email + Push',
                'AI-optimized timing',
                'Unlimited carts',
                'Advanced analytics',
                'All integrations',
                'A/B testing',
                'Discount code generation',
              ]}
              cta="Get Started"
              popular={true}
            />
            <PricingCard
              name="Pro"
              price="$99"
              period="per month"
              description="For high-volume stores"
              features={[
                'Everything in Pay-As-You-Go',
                'Priority support',
                'Dedicated account manager',
                'Custom integrations',
                'White-label reports',
                'API access',
                '99.9% SLA',
              ]}
              cta="Contact Sales"
              popular={false}
            />
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Loved by 500+ E-commerce Stores
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="Recovered $12k in the first week. The AI timing is insane - messages hit exactly when customers are most likely to buy."
              author="Sarah Chen"
              role="Founder, Bloom Boutique"
              revenue="$12,000 recovered"
            />
            <TestimonialCard
              quote="We switched from CartBoss and saw 40% more recoveries. WhatsApp is a game-changer for our international customers."
              author="Marcus Rodriguez"
              role="CEO, TechGear Pro"
              revenue="40% increase"
            />
            <TestimonialCard
              quote="The multi-channel approach is brilliant. SMS for urgency, email for details, WhatsApp for international. Perfect."
              author="Emma Thompson"
              role="Owner, Artisan Home"
              revenue="18% recovery rate"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-accent-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Recover Lost Revenue?
          </h2>
          <p className="text-xl text-white/80 mb-8">
            Join 500+ stores recovering 3x more carts with multi-channel sequences.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="bg-white text-primary-600 hover:bg-gray-100 font-semibold py-4 px-8 rounded-lg transition-all duration-200 shadow-lg">
              Start Your Free Trial
            </Link>
            <Link href="/contact" className="border-2 border-white text-white hover:bg-white/10 font-semibold py-4 px-8 rounded-lg transition-all duration-200">
              Talk to Sales
            </Link>
          </div>
          <p className="text-white/60 mt-6 text-sm">
            No credit card required • First cart free • 2-minute setup
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Zap className="w-6 h-6 text-primary-400" />
                <span className="text-lg font-bold">RecoverFlow</span>
              </div>
              <p className="text-gray-400 text-sm">
                Multi-channel cart recovery that actually works.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="#features" className="hover:text-white">Features</Link></li>
                <li><Link href="#pricing" className="hover:text-white">Pricing</Link></li>
                <li><Link href="/integrations" className="hover:text-white">Integrations</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/about" className="hover:text-white">About</Link></li>
                <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
                <li><Link href="/dpa" className="hover:text-white">DPA</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400 text-sm">
            © 2026 RecoverFlow. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gradient-bg text-white text-2xl font-bold mb-6">
        {number}
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-3">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

function TableRow({ feature, us, them, other }: { feature: string; us: boolean | string; them: boolean | string; other: boolean | string }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 text-sm text-gray-900">{feature}</td>
      <td className="px-6 py-4 text-center">
        {typeof us === 'boolean' ? (
          us ? <CheckCircle2 className="w-5 h-5 text-green-500 inline" /> : <span className="text-gray-300">—</span>
        ) : (
          <span className="text-sm font-medium text-gray-900">{us}</span>
        )}
      </td>
      <td className="px-6 py-4 text-center">
        {typeof them === 'boolean' ? (
          them ? <CheckCircle2 className="w-5 h-5 text-green-500 inline" /> : <span className="text-gray-300">—</span>
        ) : (
          <span className="text-sm text-gray-500">{them}</span>
        )}
      </td>
      <td className="px-6 py-4 text-center">
        {typeof other === 'boolean' ? (
          other ? <CheckCircle2 className="w-5 h-5 text-green-500 inline" /> : <span className="text-gray-300">—</span>
        ) : (
          <span className="text-sm text-gray-500">{other}</span>
        )}
      </td>
    </tr>
  )
}

function PricingCard({ name, price, period, description, features, cta, popular }: {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  popular: boolean
}) {
  return (
    <div className={`rounded-2xl p-8 ${popular ? 'bg-gradient-to-br from-primary-600 to-accent-600 text-white shadow-2xl scale-105' : 'bg-white border border-gray-200 shadow-md'}`}>
      {popular && (
        <div className="inline-block bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium mb-4">
          Most Popular
        </div>
      )}
      <h3 className={`text-2xl font-bold mb-2 ${popular ? 'text-white' : 'text-gray-900'}`}>{name}</h3>
      <div className="mb-4">
        <span className={`text-4xl font-bold ${popular ? 'text-white' : 'text-gray-900'}`}>{price}</span>
        <span className={popular ? 'text-white/80' : 'text-gray-500'}>/{period}</span>
      </div>
      <p className={`mb-6 ${popular ? 'text-white/80' : 'text-gray-600'}`}>{description}</p>
      <ul className="space-y-3 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start">
            <CheckCircle2 className={`w-5 h-5 mr-3 flex-shrink-0 ${popular ? 'text-white' : 'text-green-500'}`} />
            <span className={popular ? 'text-white/90' : 'text-gray-600'}>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className={`block text-center py-3 px-6 rounded-lg font-semibold transition-all ${popular ? 'bg-white text-primary-600 hover:bg-gray-100' : 'btn-primary'}`}
      >
        {cta}
      </Link>
    </div>
  )
}

function TestimonialCard({ quote, author, role, revenue }: {
  quote: string
  author: string
  role: string
  revenue: string
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-md">
      <div className="flex items-center mb-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <p className="text-gray-700 mb-6 italic">"{quote}"</p>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">{author}</div>
          <div className="text-sm text-gray-500">{role}</div>
        </div>
        <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
          {revenue}
        </div>
      </div>
    </div>
  )
}
