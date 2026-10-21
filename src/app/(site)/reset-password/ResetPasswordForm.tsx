'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains uppercase', met: /[A-Z]/.test(password) },
  ]
  if (!password) return null
  const passed = checks.filter(c => c.met).length
  const color = passed === 3 ? 'bg-emerald-500' : passed >= 1 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="mt-2 space-y-1">
      <div className="h-1 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${(passed / 3) * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map(c => (
          <span key={c.label} className={`text-xs ${c.met ? 'text-emerald-400' : 'text-slate-500'}`}>
            {c.met ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const email = searchParams.get('email')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [valid, setValid] = useState(true)
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token || !email) {
      setValid(false)
      setError('Invalid reset link. Please request a new one.')
    }
  }, [token, email])

  useEffect(() => {
    return () => { if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current) }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!/[A-Z]/.test(password)) { setError('Password must include an uppercase letter.'); return }
    if (!/\d/.test(password)) { setError('Password must include a number.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

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
        redirectTimerRef.current = setTimeout(() => router.push('/login?passwordReset=true'), 3000)
      } else {
        setError(data.message || 'Failed to reset password.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full py-3 px-4 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition text-sm'

  if (!valid) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] text-center">
          <Link href="/" className="flex items-center gap-2.5 mb-10 justify-center group">
            <Image src="/favicon-32x32.png" alt="CartGain" width={32} height={32} className="w-8 h-8 rounded-lg" priority />
            <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
          </Link>
          <div className="w-16 h-16 bg-red-600/20 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Invalid reset link</h1>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <Link href="/forgot-password" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Request a new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="flex items-center gap-2.5 mb-10 group">
          <Image src="/favicon-32x32.png" alt="CartGain" width={32} height={32} className="w-8 h-8 rounded-lg" priority />
          <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
        </Link>

        {success ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Password updated</h2>
            <p className="text-sm text-slate-400 mb-6">Redirecting you to sign in...</p>
            <Link href="/login?passwordReset=true" className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition">
              Continue to sign in <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1.5">Create a new password</h1>
              <p className="text-sm text-slate-400">Choose a strong password for <span className="text-white">{email}</span>.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="p-3 bg-red-900/30 border border-red-500/40 rounded-lg flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">New password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} required autoFocus disabled={loading} className={`${inputCls} pr-11`} placeholder="Create a strong password" value={password} onChange={e => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-medium text-slate-400 mb-1.5">Confirm password</label>
                <input id="confirmPassword" type={showPassword ? 'text' : 'password'} required disabled={loading} className={inputCls} placeholder="Re-enter your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              <button type="submit" disabled={loading || !password || !confirmPassword} className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98] flex items-center justify-center gap-2 min-h-12">
                {loading ? 'Resetting...' : 'Reset password'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>

              <div className="text-center pt-2">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white transition">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
