import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Account Setup | CartGain',
  description: 'Complete your CartGain merchant account setup to connect your store and configure recovery.',
  path: '/setup',
})

export default function SetupLayout({ children }: { children: ReactNode }) {
  return children
}
