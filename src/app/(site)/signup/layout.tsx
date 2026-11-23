import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Create an Account | CartGain',
  description: 'Create your CartGain merchant account to start configuring AI bargaining and cart recovery.',
  path: '/signup',
})

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children
}
