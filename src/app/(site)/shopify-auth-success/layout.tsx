import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Shopify Sign-In Complete | CartGain',
  description: 'Complete secure Shopify sign-in for your CartGain merchant account.',
  path: '/shopify-auth-success',
})

export default function ShopifyAuthSuccessLayout({ children }: { children: ReactNode }) {
  return children
}
