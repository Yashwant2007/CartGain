import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Verify Email | CartGain',
  description: 'Verify your email address to secure your CartGain merchant account.',
  path: '/verify-email',
})

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return children
}
