import type { ReactNode } from 'react'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata('/docs/api')

export default function ApiDocsLayout({ children }: { children: ReactNode }) {
  return children
}
