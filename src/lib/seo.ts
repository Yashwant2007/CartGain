import type { Metadata } from 'next'

export const CANONICAL_ORIGIN = 'https://cart-gain.com'
export const SOCIAL_IMAGE_URL =
  'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=630&fit=crop'

export const PUBLIC_PAGE_SEO = {
  '/': {
    title: 'CartGain | AI Bargaining & Abandoned Cart Recovery',
    description:
      'CartGain combines AI bargaining and abandoned cart recovery for Shopify and WooCommerce merchants, turning price objections into sales while protecting margins.',
  },
  '/pricing': {
    title: 'CartGain Pricing | AI Bargaining & Cart Recovery Plans',
    description:
      'Compare CartGain plans for AI bargaining, abandoned cart recovery, WhatsApp automation, and merchant controls. Choose the right plan for your store.',
  },
  '/bargain': {
    title: 'AI Bargaining for Shopify & WooCommerce | CartGain',
    description:
      'Let CartGain negotiate price objections with shoppers across Shopify and WooCommerce, using AI bargaining that protects your minimum price and margin.',
  },
  '/contact': {
    title: 'Contact CartGain | Support for E-commerce Merchants',
    description:
      'Contact CartGain for help with AI bargaining, abandoned cart recovery, Shopify and WooCommerce setup, billing questions, and merchant support.',
  },
  '/privacy': {
    title: 'Privacy Policy | How CartGain Protects Merchant Data',
    description:
      'Read how CartGain collects, uses, and protects merchant and shopper data, including consent, retention, integrations, and your privacy rights.',
  },
  '/terms': {
    title: 'Terms of Service | CartGain Merchant Terms and Conditions',
    description:
      'Review the CartGain terms for using our AI bargaining and cart recovery platform, including subscriptions, merchant responsibilities, and acceptable use.',
  },
  '/dpa': {
    title: 'Data Processing Agreement | CartGain Data Processing Terms',
    description:
      "Understand CartGain's data processing agreement, including GDPR commitments, sub-processors, security measures, and merchant data protection duties.",
  },
  '/security-policy': {
    title: 'Security Policy | CartGain Commerce Platform Security',
    description:
      'Learn how CartGain protects merchant and shopper data with platform security controls, access management, encryption, and incident response practices.',
  },
  '/cookies': {
    title: 'Cookie Policy | CartGain Cookies and Site Tracking',
    description:
      'Read how CartGain uses cookies and similar technologies for security, analytics, and site performance, and how merchants can manage their preferences.',
  },
  '/docs/api': {
    title: 'API Documentation | CartGain Merchant API Reference',
    description:
      'Explore the CartGain merchant API reference for storefront integrations, recovery events, bargain experiences, endpoints, and authentication details.',
  },
} as const

export type PublicPagePath = keyof typeof PUBLIC_PAGE_SEO

export const PUBLIC_PAGE_PATHS = Object.keys(PUBLIC_PAGE_SEO) as PublicPagePath[]

export function canonicalUrl(path: PublicPagePath | string): string {
  return path === '/' ? CANONICAL_ORIGIN : `${CANONICAL_ORIGIN}${path}`
}

export function createPageMetadata(path: PublicPagePath): Metadata {
  const { title, description } = PUBLIC_PAGE_SEO[path]
  const url = canonicalUrl(path)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'CartGain',
      images: [
        {
          url: SOCIAL_IMAGE_URL,
          width: 1200,
          height: 630,
          alt: `${title} - CartGain`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SOCIAL_IMAGE_URL],
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
  }
}

export function createNoIndexMetadata({
  title,
  description,
  path = null,
}: {
  title: string
  description: string
  path?: string | null
}): Metadata {
  const url = path ? canonicalUrl(path) : null

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      ...(url ? { url } : {}),
      type: 'website',
      siteName: 'CartGain',
      images: [],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [],
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        'max-image-preview': 'none',
      },
    },
  }
}
