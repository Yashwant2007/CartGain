'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function SplashScreen() {
  const [show, setShow] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setFadeOut(true)
    }, 1800)

    const timer2 = setTimeout(() => {
      setShow(false)
    }, 2200)

    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [])

  if (!show) return null

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 transition-opacity duration-400 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative animate-[splash-scale_1.2s_ease-out]">
          <div className="absolute inset-0 animate-ping rounded-full bg-indigo-500/20" />
          <Image
            src="/logo.png"
            alt="CartGain"
            width={120}
            height={120}
            className="relative rounded-2xl shadow-2xl shadow-indigo-500/40"
            priority
          />
        </div>
        <div className="flex flex-col items-center gap-2 animate-[splash-fade-up_1s_ease-out_0.4s_both]">
          <h1 className="text-3xl font-bold tracking-tight text-white">CartGain</h1>
          <p className="text-sm text-indigo-200/80">Your AI Recovery Agent</p>
        </div>
      </div>
      <style jsx>{`
        @keyframes splash-scale {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes splash-fade-up {
          0% {
            transform: translateY(10px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
