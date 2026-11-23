import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Shopify Connected | CartGain',
  description: 'Shopify connection status for your CartGain merchant account.',
  path: '/shopify-connected',
})

export default function ShopifyConnectedLayout({ children }: { children: ReactNode }) {
  return children
}
