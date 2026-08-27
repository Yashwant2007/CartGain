import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import Providers from './providers'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
}

export const metadata: Metadata = {
  title: 'CartGain | AI Negotiation & Cart Recovery for E-commerce',
  description:
    'Recover abandoned carts with AI-powered WhatsApp and Email recovery — plus an AI negotiator that turns "Too Expensive" into sold orders without cutting below your floor price. First 50 recovered carts free.',
  keywords: [
    'AI cart recovery',
    'abandoned cart recovery',
    'Shopify abandoned cart recovery',
    'AI e-commerce negotiation',
    'WhatsApp cart recovery',
    'recover lost e-commerce revenue',
    'AI discount negotiation',
    'cart recovery software',
    'WhatsApp marketing platform',
    'e-commerce revenue recovery',
    'D2C tools',
    'conversion rate optimization',
    'Shopify apps',
    'cart abandonment recovery',
  ],
  openGraph: {
    title: 'CartGain | Turn "Too Expensive" Into Sold',
    description:
      'AI negotiation engine for e-commerce. CartGain recovers abandoned carts over WhatsApp and Email, negotiates with price-sensitive shoppers, and hits your floor — first 50 recovered carts free.',
    url: 'https://cart-gain.com',
    type: 'website',
    siteName: 'CartGain',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=630&fit=crop',
        width: 1200,
        height: 630,
        alt: 'CartGain - AI negotiation and abandoned cart recovery platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CartGain | Turn "Too Expensive" Into Sold',
    description:
      'AI negotiation engine for e-commerce. Recover abandoned carts over WhatsApp and Email, negotiate without killing margin, track revenue recovered.',
    images: ['https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=630&fit=crop'],
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
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#1e293b" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
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
              description: 'AI negotiation and abandoned cart recovery platform for e-commerce brands, using WhatsApp and Email',
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
              name: 'AI Cart Recovery Software',
              description: 'AI-powered abandoned cart recovery with negotiation over WhatsApp and Email for e-commerce businesses',
              provider: {
                '@type': 'Organization',
                name: 'CartGain',
                url: 'https://cart-gain.com',
              },
              areaServed: 'IN',
              availableChannel: [
                { '@type': 'ServiceChannel', serviceName: 'WhatsApp Recovery', 'availabilityRestriction': '24/7' },
                { '@type': 'ServiceChannel', serviceName: 'AI Price Negotiation', 'availabilityRestriction': '24/7' },
                { '@type': 'ServiceChannel', serviceName: 'Email Recovery', 'availabilityRestriction': '24/7' },
                { '@type': 'ServiceChannel', serviceName: 'SMS Recovery', 'availabilityRestriction': 'Coming soon' },
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
                  name: 'How does the AI negotiate without hurting my margin?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'You set a floor price per product or for your whole store. The AI negotiates within the range you define — from your asking price down to your floor — and never offers below it. Accepted deals generate a one-use, time-limited discount code bound to that cart.',
                  },
                },
              ],
            }),
          }}
        />
      </head>
      <body className="font-sans bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
