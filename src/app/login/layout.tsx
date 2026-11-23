import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Sign In | CartGain',
  description: 'Sign in to your CartGain merchant account to manage cart recovery and AI bargaining.',
  path: '/login',
})

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
