'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, XCircle, Loader2, ArrowLeft, ArrowRight } from 'lucide-react'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}

function VerifyContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('')

  const token = searchParams.get('token')
  const email = searchParams.get('email')

  useEffect(() => {
    if (!token || !email) {
      setStatus('error')
      setMessage('This verification link is invalid.')
      return
    }

    const controller = new AbortController()

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`, {
      signal: controller.signal,
    })
      .then(res => {
        if (res.redirected) {
          window.location.href = res.url
          return
        }
        if (res.ok) {
          setStatus('success')
        } else {
          setStatus('error')
          setMessage('This verification link has expired or has already been used.')
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
      })

    return () => controller.abort()
  }, [token, email])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] text-center">
        <Link href="/" className="flex items-center gap-2.5 mb-10 justify-center group">
          <Image src="/favicon-32x32.png" alt="CartGain" width={32} height={32} className="w-8 h-8 rounded-lg" priority />
          <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
        </Link>

        {status === 'verifying' && (
          <>
            <Loader2 className="w-10 h-10 text-blue-400 mx-auto mb-5 animate-spin" />
            <h1 className="text-lg font-semibold text-white mb-2">Verifying your email...</h1>
            <p className="text-sm text-slate-400">This won&apos;t take long.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-lg font-semibold text-white mb-2">Email verified</h1>
            <p className="text-sm text-slate-400 mb-6">Your account is ready. Sign in to get started.</p>
            <Link href="/login?verified=true" className="inline-flex items-center gap-1.5 px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 transition active:scale-[0.98]">
              Sign in <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-600/20 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-lg font-semibold text-white mb-2">Verification link expired</h1>
            <p className="text-sm text-slate-400 mb-6">{message || 'This link is no longer valid. Please request a new one.'}</p>
            <div className="flex flex-col gap-3">
              <Link href="/login" className="inline-flex items-center justify-center gap-1.5 px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 transition active:scale-[0.98]">
                Back to sign in <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/forgot-password" className="inline-flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-white transition">
                <ArrowLeft className="w-3.5 h-3.5" /> Request new verification email
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
