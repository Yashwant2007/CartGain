import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Forgot Password | CartGain',
  description: 'Request a password reset link for your CartGain merchant account.',
  path: '/forgot-password',
})

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children
}
