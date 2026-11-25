import nextConfig from '../../../next.config.js'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import {
  CANONICAL_ORIGIN,
  PUBLIC_PAGE_PATHS,
  PUBLIC_PAGE_SEO,
  SOCIAL_IMAGE_URL,
  canonicalUrl,
  createNoIndexMetadata,
  createPageMetadata,
} from '@/lib/seo'

describe('public SEO metadata', () => {
  it('emits only verified public canonical URLs', () => {
    const entries = sitemap()
    const urls = entries.map((entry) => String(entry.url))
    const expectedUrls = PUBLIC_PAGE_PATHS.map((path) => canonicalUrl(path))

    expect(urls).toEqual(expectedUrls)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.every((url) => url.startsWith(`${CANONICAL_ORIGIN}/`) || url === CANONICAL_ORIGIN)).toBe(true)

    for (const privatePath of [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/dashboard',
      '/demo',
      '/bargain/embed',
    ]) {
      expect(urls.some((url) => url.includes(privatePath))).toBe(false)
    }
  })

  it('uses route file modification dates without ranking hints', () => {
    for (const entry of sitemap()) {
      expect(entry.lastModified).toBeTruthy()
      expect(typeof (entry.lastModified as Date).toISOString).toBe('function')
      expect(entry).not.toHaveProperty('changeFrequency')
      expect(entry).not.toHaveProperty('priority')
    }
  })

  it('preserves the robots rules and canonical sitemap URL', () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/api/', '/r/'],
      },
      sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    })
  })

  it('writes unique titles and descriptions for every public page', () => {
    const entries = PUBLIC_PAGE_PATHS.map((path) => PUBLIC_PAGE_SEO[path])
    const titles = entries.map((entry) => entry.title)
    const descriptions = entries.map((entry) => entry.description)

    expect(new Set(titles).size).toBe(titles.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)

    for (const entry of entries) {
      expect(entry.title.length).toBeGreaterThanOrEqual(50)
      expect(entry.title.length).toBeLessThanOrEqual(60)
      expect(entry.description.length).toBeGreaterThanOrEqual(140)
      expect(entry.description.length).toBeLessThanOrEqual(160)
    }
  })

  it('builds canonical, Open Graph, Twitter, and indexable metadata for every public page', () => {
    for (const path of PUBLIC_PAGE_PATHS) {
      const seo = PUBLIC_PAGE_SEO[path]
      const metadata = createPageMetadata(path)
      const url = canonicalUrl(path)

      expect(metadata.title).toBe(seo.title)
      expect(metadata.description).toBe(seo.description)
      expect(metadata.alternates?.canonical).toBe(url)
      expect(metadata.openGraph).toMatchObject({
        title: seo.title,
        description: seo.description,
        url,
        type: 'website',
        siteName: 'CartGain',
        images: [{ url: SOCIAL_IMAGE_URL, width: 1200, height: 630 }],
      })
      expect(metadata.twitter).toMatchObject({
        card: 'summary_large_image',
        title: seo.title,
        description: seo.description,
        images: [SOCIAL_IMAGE_URL],
      })
      expect(metadata.robots).toMatchObject({
        index: true,
        follow: true,
        googleBot: { index: true, follow: true },
      })
    }
  })

  it('builds no-index metadata without inheriting the homepage canonical', () => {
    const metered = createNoIndexMetadata({
      title: 'Private Page | CartGain',
      description: 'A private CartGain route that must not be indexed.',
      path: '/login',
    })
    expect(metered.alternates?.canonical).toBe(`${CANONICAL_ORIGIN}/login`)
    expect(metered.openGraph).toMatchObject({ images: [] })
    expect(metered.twitter).toMatchObject({ card: 'summary', images: [] })
    expect(metered.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false, 'max-image-preview': 'none' },
    })

    const dynamic = createNoIndexMetadata({
      title: 'Private Detail | CartGain',
      description: 'A private CartGain detail route that must not be indexed.',
    })
    expect(dynamic.alternates?.canonical).toBeNull()
    expect(dynamic.robots).toMatchObject({ index: false, follow: false })
  })

  it('marks both web manifests noindex instead of treating them as pages', async () => {
    const headers = await nextConfig.headers()

    for (const source of ['/manifest.webmanifest', '/site.webmanifest']) {
      const entry = headers.find((header: { source: string }) => header.source === source)
      expect(entry?.headers).toContainEqual({
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow',
      })
    }
  })
})
