import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

const CANONICAL_ORIGIN = 'https://cart-gain.com'

const EXPECTED_URLS = [
  CANONICAL_ORIGIN,
  `${CANONICAL_ORIGIN}/pricing`,
  `${CANONICAL_ORIGIN}/bargain`,
  `${CANONICAL_ORIGIN}/contact`,
  `${CANONICAL_ORIGIN}/privacy`,
  `${CANONICAL_ORIGIN}/terms`,
  `${CANONICAL_ORIGIN}/dpa`,
  `${CANONICAL_ORIGIN}/security-policy`,
  `${CANONICAL_ORIGIN}/cookies`,
  `${CANONICAL_ORIGIN}/docs/api`,
]

describe('public SEO metadata', () => {
  it('emits only verified public canonical URLs', () => {
    const entries = sitemap()
    const urls = entries.map((entry) => String(entry.url))

    expect(urls).toEqual(EXPECTED_URLS)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.every((url) => url.startsWith(`${CANONICAL_ORIGIN}/`) || url === CANONICAL_ORIGIN)).toBe(true)

    for (const privatePath of ['/login', '/signup', '/forgot-password', '/dashboard']) {
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
})
