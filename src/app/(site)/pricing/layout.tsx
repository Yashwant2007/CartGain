import type { ReactNode } from 'react'
import { createPageMetadata } from '@/lib/seo'

export const metadata = createPageMetadata('/pricing')

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children
}
