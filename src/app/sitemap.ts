import { statSync } from 'fs'
import path from 'path'
import type { MetadataRoute } from 'next'
import { PUBLIC_PAGE_PATHS, canonicalUrl } from '@/lib/seo'
import type { PublicPagePath } from '@/lib/seo'

const PAGE_FILES: Record<PublicPagePath, string> = {
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

function lastModifiedFor(page: PublicPagePath): Date | undefined {
  try {
    return statSync(path.join(process.cwd(), PAGE_FILES[page])).mtime
  } catch {
    return undefined
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGE_PATHS.map((page) => {
    const lastModified = lastModifiedFor(page)
    return {
      url: canonicalUrl(page),
      ...(lastModified ? { lastModified } : {}),
    }
  })
}
