import type { MetadataRoute } from 'next'

const CANONICAL_ORIGIN = 'https://cart-gain.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/api/', '/r/'],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
  }
}
