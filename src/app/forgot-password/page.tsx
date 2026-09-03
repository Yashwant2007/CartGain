'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.message || 'Something went wrong.')
      }
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full py-3 px-4 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition text-sm'

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="flex items-center gap-2.5 mb-10 group">
          <Image src="/favicon-32x32.png" alt="CartGain" width={32} height={32} className="w-8 h-8 rounded-lg" priority />
          <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1.5">Reset your password</h1>
          <p className="text-sm text-slate-400">Enter the email associated with your account and we&apos;ll send you a reset link.</p>
        </div>

        {sent ? (
          <div className="text-center py-2">
            <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
            <p className="text-sm text-slate-400 mb-2">
              If an account exists for <span className="text-white font-medium">{email}</span>, you&apos;ll receive a reset link shortly.
            </p>
            <p className="text-xs text-slate-600 mb-6">
              Check your spam or promotions folder if you don&apos;t see it.
            </p>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-500/40 rounded-lg flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                disabled={loading}
                className={inputCls}
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading || !email.trim()} className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98] flex items-center justify-center gap-2 min-h-12">
              {loading ? 'Sending...' : 'Send reset link'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="text-center pt-2">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
