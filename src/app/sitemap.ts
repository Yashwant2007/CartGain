import { statSync } from 'fs'
import path from 'path'
import type { MetadataRoute } from 'next'

const CANONICAL_ORIGIN = 'https://cart-gain.com'

const PUBLIC_PAGES = [
  '/',
  '/pricing',
  '/bargain',
  '/contact',
  '/privacy',
  '/terms',
  '/dpa',
  '/security-policy',
  '/cookies',
  '/docs/api',
] as const

type PublicPage = (typeof PUBLIC_PAGES)[number]

const PAGE_FILES: Record<PublicPage, string> = {
  '/': 'src/app/(site)/page.tsx',
  '/pricing': 'src/app/(site)/pricing/page.tsx',
  '/bargain': 'src/app/(site)/bargain/page.tsx',
  '/contact': 'src/app/(site)/contact/page.tsx',
  '/privacy': 'src/app/(site)/privacy/page.tsx',
  '/terms': 'src/app/(site)/terms/page.tsx',
  '/dpa': 'src/app/(site)/dpa/page.tsx',
  '/security-policy': 'src/app/(site)/security-policy/page.tsx',
  '/cookies': 'src/app/(site)/cookies/page.tsx',
  '/docs/api': 'src/app/(site)/docs/api/page.tsx',
}

function lastModifiedFor(page: PublicPage): Date | undefined {
  try {
    return statSync(path.join(process.cwd(), PAGE_FILES[page])).mtime
  } catch {
    return undefined
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => {
    const lastModified = lastModifiedFor(page)
    return {
      url: page === '/' ? CANONICAL_ORIGIN : `${CANONICAL_ORIGIN}${page}`,
      ...(lastModified ? { lastModified } : {}),
    }
  })
}
