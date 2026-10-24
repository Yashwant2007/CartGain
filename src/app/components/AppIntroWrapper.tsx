'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import BrandIntro from './BrandIntro'

const INTRO_SEEN_KEY = 'cartgain_intro_seen'

export default function AppIntroWrapper({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Don't show intro on certain routes
    if (pathname?.startsWith('/bargain/embed') || pathname?.startsWith('/s/bargain')) {
      setShowIntro(false)
      setIsReady(true)
      return
    }

    // Check if intro was already seen in this session
    try {
      const seen = sessionStorage.getItem(INTRO_SEEN_KEY)
      if (seen) {
        setShowIntro(false)
        setIsReady(true)
        return
      }
    } catch {
      // If sessionStorage fails, still show intro
    }

    setShowIntro(true)
  }, [pathname])

  const handleIntroComplete = () => {
    try {
      sessionStorage.setItem(INTRO_SEEN_KEY, '1')
    } catch {
      // Ignore storage errors
    }
    setShowIntro(false)
    setIsReady(true)
  }

  if (showIntro) {
    return <BrandIntro onComplete={handleIntroComplete} />
  }

  return <>{children}</>
}
