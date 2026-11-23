import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Shopify Sign-In | CartGain',
  description: 'Continue secure Shopify sign-in for your CartGain merchant account.',
  path: '/shopify-auth-start',
})

export default function ShopifyAuthStartLayout({ children }: { children: ReactNode }) {
  return children
}
