import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
}

export const metadata: Metadata = {
  title: 'CartGain | Abandoned Cart Recovery for D2C Brands',
  description: 'Recover abandoned carts with WhatsApp, SMS, and Email. Industry benchmarks show 18-25% recovery rates for multi-channel recovery. Free setup. No credit card required.',
  keywords: [
    'abandoned cart recovery',
    'cart recovery software',
    'WhatsApp marketing platform',
    'SMS marketing tools',
    'e-commerce recovery',
    'D2C tools',
    'conversion rate optimization',
    'revenue recovery',
    'beauty brand tools',
    'Shopify apps',
    'cart abandonment recovery',
    'multichannel messaging',
  ],
  openGraph: {
    title: 'CartGain | Recover Lost Revenue from Abandoned Carts',
    description: 'Recover more abandoned carts with AI-powered WhatsApp, SMS, and Email recovery — industry benchmarks show 18-25% recovery rates.',
    url: 'https://cart-gain.com',
    type: 'website',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=630&fit=crop',
        width: 1200,
        height: 630,
        alt: 'CartGain - Abandoned Cart Recovery Platform',
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: 'https://cart-gain.com',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#1e293b" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="apple-mobile-web-app-capable" content="true" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CartGain" />
        
        {/* Schema.org Structured Data for SEO */}
        <Script
          id="schema-organization"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'CartGain',
              description: 'Abandoned cart recovery platform for D2C beauty brands using WhatsApp, SMS, and Email',
              url: 'https://cart-gain.com',
              logo: 'https://cart-gain.com/logo.png',
              sameAs: [
                'https://twitter.com/cartgain',
                'https://linkedin.com/company/cartgain',
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'Customer Support',
                email: 'support@cart-gain.com',
              },
            }),
          }}
        />
        
        <Script
          id="schema-service"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: 'Cart Recovery Software',
              description: 'AI-powered abandoned cart recovery using WhatsApp, SMS, and Email for e-commerce businesses',
              provider: {
                '@type': 'Organization',
                name: 'CartGain',
                url: 'https://cart-gain.com',
              },
              areaServed: 'IN',
              availableChannel: [
                { '@type': 'ServiceChannel', serviceName: 'WhatsApp Recovery', 'availabilityRestriction': '24/7' },
                { '@type': 'ServiceChannel', serviceName: 'SMS Recovery', 'availabilityRestriction': '24/7' },
                { '@type': 'ServiceChannel', serviceName: 'Email Recovery', 'availabilityRestriction': '24/7' },
              ],
            }),
          }}
        />

        <Script
          id="schema-faq"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: [
                {
                  '@type': 'Question',
                  name: 'Why not just use email for cart recovery?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Email alone only recovers 3-5% of abandoned carts. WhatsApp (85% open rate) + SMS (45% CTR) + Email creates multiple touchpoints. Industry benchmarks show 18-25% recovery with multi-channel vs 3-5% with email alone.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'How do you handle customer data and privacy?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'All customer data is encrypted at rest and in transit. We only process cart abandonment data needed for recovery. No data is shared with third parties. Our data practices follow India\'s DPDP Act 2023 guidelines.',
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body className="font-sans bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        {children}
      </body>
    </html>
  )
}
