'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Zap, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

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
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.message || 'Something went wrong')
      }
    } catch {
      setError('Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-2 mb-8 group">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center group-hover:shadow-lg group-hover:shadow-primary-600/50 transition-all">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Reset your password</h1>
          <p className="text-sm text-blue-200">Enter your email and we&apos;ll send you a reset link.</p>
        </div>

        {sent ? (
          <div className="bg-slate-800/40 border border-green-700/30 rounded-xl p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
            <p className="text-sm text-blue-200 mb-6">If an account exists for {email}, you&apos;ll receive a reset link shortly.</p>
            <Link href="/login" className="text-cyan-400 hover:text-cyan-300 text-sm font-medium">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-blue-200 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  disabled={loading}
                  className="input pl-10 w-full bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-all"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>

            <p className="text-center text-sm text-blue-300">
              <Link href="/login" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                <ArrowLeft className="w-3 h-3" />
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
