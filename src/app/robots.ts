import type { MetadataRoute } from 'next'
import { CANONICAL_ORIGIN } from '@/lib/seo'

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
