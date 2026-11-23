import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Authentication Error | CartGain',
  description: 'Review a sign-in issue with your CartGain merchant account.',
  path: '/auth/error',
})

export default function AuthErrorLayout({ children }: { children: ReactNode }) {
  return children
}
