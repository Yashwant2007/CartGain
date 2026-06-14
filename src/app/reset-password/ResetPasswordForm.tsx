'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Zap, Lock, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [valid, setValid] = useState(true)

  useEffect(() => {
    if (!token || !email) {
      setValid(false)
      setError('Invalid reset link. Please request a new one.')
    }
  }, [token, email])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      })

      const data = await res.json()

      if (res.ok) {
        setSuccess(true)
        setTimeout(() => router.push('/login'), 3000)
      } else {
        setError(data.message || 'Failed to reset password')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-slate-800/40 border border-red-700/30 rounded-xl p-8">
            <h1 className="text-xl font-bold text-white mb-4">Invalid Reset Link</h1>
            <p className="text-blue-200 mb-6">{error}</p>
            <Link href="/forgot-password" className="text-cyan-400 hover:text-cyan-300 font-medium">
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    )
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

        {success ? (
          <div className="bg-slate-800/40 border border-green-700/30 rounded-xl p-6 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">Password reset successfully!</h2>
            <p className="text-sm text-blue-200 mb-6">Redirecting you to sign in...</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white mb-2">Set new password</h1>
              <p className="text-sm text-blue-200">Choose a strong password for your account.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-blue-200 mb-2">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    disabled={loading}
                    className="input pl-10 w-full bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-blue-200 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    disabled={loading}
                    className="input pl-10 w-full bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-all"
              >
                {loading ? 'Resetting...' : 'Reset password'}
              </button>

              <p className="text-center text-sm text-blue-300">
                <Link href="/login" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
                  <ArrowLeft className="w-3 h-3" />
                  Back to sign in
                </Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
