import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { headers } from 'next/headers'
import './globals.css'
import Providers from './providers'
import { ClientErrorBoundary } from './components/ClientErrorBoundary'
import EmbeddedAuthBootstrap from '@/components/EmbeddedAuthBootstrap'
import {
  APP_BRIDGE_CDN_SRC,
  getShopifyApiKey,
  isShopifyEmbedRequest,
} from '@/lib/shopify-app-bridge'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Only requests that come from the Shopify admin iframe get the App Bridge
  // runtime. The CDN bundle aborts without a shop domain and redirects
  // top-level visitors into the admin, so loading it on the public marketing
  // site would break the site itself.
  //
  // Reading a request header makes the whole tree dynamic, so the public
  // routes opt back into static rendering with `dynamic = 'force-static'`
  // (their headers come back empty, which is exactly what we want there).
  let embedRequest = false
  try {
    embedRequest = isShopifyEmbedRequest(await headers())
  } catch {
    embedRequest = false
  }

  const shopifyApiKey = embedRequest ? getShopifyApiKey() : undefined

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {shopifyApiKey ? (
          <>
            {/* App Bridge (Next) reads its configuration from these tags.
                The script must be a plain, blocking <script> — the CDN bundle
                aborts itself when the tag is async/defer/module. */}
            <meta name="shopify-api-key" content={shopifyApiKey} />
            {/* eslint-disable-next-line @next/next/no-sync-scripts -- Shopify's
                App Bridge bundle refuses to initialise unless the tag is a
                plain, synchronous script tag. */}
            <script src={APP_BRIDGE_CDN_SRC} />
          </>
        ) : null}
        <meta name="theme-color" content="#1e293b" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="true" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CartGain" />
        
        <link rel="canonical" href="https://cart-gain.com" />
        <meta name="author" content="CartGain" />
        <meta name="publisher" content="CartGain" />
        
        {/* Schema.org Structured Data for SEO */}
        <Script
          id="schema-organization"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'CartGain',
              alternateName: 'CartGain AI',
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
                availableLanguage: ['English'],
              },
              foundingDate: '2024',
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
                    text: 'Email alone only recovers 3-5% of abandoned carts. WhatsApp (85% open rate) + Email creates multiple touchpoints. Industry benchmarks show 18-25% recovery with multi-channel vs 3-5% with email alone.',
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
                {
                  '@type': 'Question',
                  name: 'What is CartGain?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'CartGain is an AI-powered cart recovery and negotiation platform for e-commerce stores. It recovers abandoned carts via WhatsApp and Email, and uses AI to negotiate with price-sensitive shoppers while respecting your minimum margin.',
                  },
                },
                {
                  '@type': 'Question',
                  name: 'Is CartGain for Shopify?',
                  acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'CartGain integrates with Shopify stores to recover abandoned checkouts via WhatsApp and Email, and offers a storefront AI negotiation widget.',
                  },
                },
              ],
            }),
          }}
        />
        <Script
          id="schema-software"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'CartGain',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
                description: 'First 50 recovered carts free',
              },
              provider: {
                '@type': 'Organization',
                name: 'CartGain',
              },
              url: 'https://cart-gain.com',
              description: 'AI negotiation and abandoned cart recovery platform for e-commerce stores',
            }),
          }}
        />
      </head>
      <body className="font-sans bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
        <ClientErrorBoundary>
          <Providers>
            <EmbeddedAuthBootstrap />
            {children}
          </Providers>
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
