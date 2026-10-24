'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

interface BrandIntroProps {
  onComplete?: () => void
  minDuration?: number
  maxDuration?: number
}

export default function BrandIntro({ onComplete, minDuration = 900, maxDuration = 1400 }: BrandIntroProps) {
  const [stage, setStage] = useState<'logo' | 'expand' | 'tagline' | 'exit'>('logo')
  const [show, setShow] = useState(true)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const completeIntro = useCallback(() => {
    setStage('exit')
    setTimeout(() => {
      setShow(false)
      onComplete?.()
    }, 200)
  }, [onComplete])

  useEffect(() => {
    if (prefersReducedMotion) {
      // For reduced motion, show static version briefly then exit
      const timer = setTimeout(completeIntro, 400)
      return () => clearTimeout(timer)
    }

    // Stage 1: Logo appears (250-350ms)
    const timer1 = setTimeout(() => {
      setStage('expand')
    }, 300)

    // Stage 2: Expand to wordmark (350-500ms more, total ~650-800ms)
    const timer2 = setTimeout(() => {
      setStage('tagline')
    }, 750)

    // Stage 3: Tagline revealed, then exit (200-300ms more)
    const timer3 = setTimeout(() => {
      completeIntro()
    }, minDuration)

    // Safety timeout
    const safetyTimer = setTimeout(() => {
      completeIntro()
    }, maxDuration)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(safetyTimer)
    }
  }, [prefersReducedMotion, completeIntro, minDuration, maxDuration])

  if (!show) return null

  if (prefersReducedMotion) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950"
        role="status"
        aria-live="polite"
        aria-label="Loading CartGain"
      >
        <div className="flex items-center gap-4 px-6">
          <Image
            src="/logo.png"
            alt="CartGain logo"
            width={64}
            height={64}
            className="rounded-xl"
            priority
          />
          <span className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            CartGain
          </span>
        </div>
        <p className="mt-4 text-sm text-blue-200/80">Recover More Carts. Close More Sales.</p>
      </div>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 transition-opacity duration-200 ${
        stage === 'exit' ? 'opacity-0' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
      aria-label="CartGain loading"
    >
      <div className="relative flex flex-col items-center justify-center px-4 w-full max-w-md">
        <div className="flex items-center justify-center">
          <div
            className={`relative transition-all duration-500 ease-out ${
              stage === 'logo' 
                ? 'scale-90 opacity-0' 
                : stage === 'exit'
                  ? 'scale-95 opacity-0'
                  : 'scale-100 opacity-100'
            }`}
          >
            <Image
              src="/logo.png"
              alt="CartGain CG logo"
              width={80}
              height={80}
              className="rounded-2xl shadow-2xl shadow-blue-500/30 sm:w-[90px] sm:h-[90px]"
              priority
            />
          </div>
          
          <div
            className={`overflow-hidden transition-all duration-500 ease-out ${
              stage === 'logo'
                ? 'max-w-0 opacity-0 ml-0'
                : stage === 'expand' || stage === 'tagline' || stage === 'exit'
                  ? 'max-w-[200px] opacity-100 ml-3 sm:ml-4'
                  : 'max-w-0 opacity-0 ml-0'
            }`}
          >
            <span
              className={`text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white whitespace-nowrap block transition-transform duration-500 ease-out ${
                stage === 'logo'
                  ? '-translate-x-4'
                  : '-translate-x-0'
              }`}
            >
              CartGain
            </span>
          </div>
        </div>

        <div
          className={`mt-6 text-center transition-all duration-400 ease-out ${
            stage === 'tagline' || stage === 'exit'
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2'
          }`}
        >
          <p className="text-base sm:text-lg font-medium text-white">
            Recover More Carts. Close More Sales.
          </p>
          <p className="mt-1 text-xs sm:text-sm text-blue-200/70 px-4">
            AI-powered WhatsApp recovery and smarter bargaining for Shopify stores
          </p>
        </div>
      </div>

      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  )
}
