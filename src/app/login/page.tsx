'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import {
  ArrowRight, CheckCircle2, Eye, EyeOff, AlertTriangle, X, ShieldCheck,
} from 'lucide-react'
import {
  isInShopifyEmbed,
  getEmbedAwareRedirectUrl,
  openGoogleAuthPopup,
  redirectTopForAuth,
  googleAuthErrorMessage,
  shouldFallbackToTopOutcome,
} from '@/lib/shopify-embed'

type AuthStep =
  | 'email'
  | 'password'
  | 'google_only'
  | 'create_account'
  | 'verify_email'

function Toast({ message, type, onClose }: { message: string; type: 'error' | 'success'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div
      className={`fixed top-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl shadow-2xl border backdrop-blur-md transition-all animate-slide-in ${
        type === 'error'
          ? 'bg-red-900/90 border-red-500/50'
          : 'bg-emerald-900/90 border-emerald-500/50'
      }`}
    >
      {type === 'error' ? (
        <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="w-5 h-5 text-emerald-300 mt-0.5 flex-shrink-0" />
      )}
      <p className="text-sm text-white/90 max-w-sm">{message}</p>
      <button onClick={onClose} aria-label="Close" className="p-0.5 hover:bg-white/10 rounded transition">
        <X className="w-4 h-4 text-white/60" />
      </button>
    </div>
  )
}

function TermsModal({ onClose, onAccept }: { onClose: () => void; onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-blue-800/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-900/50 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Agreement Required</h3>
            <p className="text-sm text-blue-300/70 mt-1">Please accept our terms to continue.</p>
          </div>
        </div>
        <p className="text-sm text-blue-200/80 leading-relaxed mb-6">
          You need to agree to CartGain&apos;s{' '}
          <Link href="/terms" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">Terms of Service</Link>,{' '}
          <Link href="/privacy" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">Privacy Policy</Link>, and{' '}
          <Link href="/dpa" className="text-blue-400 underline underline-offset-2 hover:text-blue-300">Data Processing Agreement</Link>{' '}
          before creating an account.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 px-4 bg-slate-800 border border-slate-700 text-white/80 text-sm font-medium rounded-lg hover:bg-slate-700 transition">
            Cancel
          </button>
          <button onClick={onAccept} className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:from-blue-500 hover:to-cyan-500 transition">
            I Agree
          </button>
        </div>
      </div>
    </div>
  )
}

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

/* ─── Main Component ─────────────────────────────────────────────── */
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const sp = useSearchParams()

  /* ── Step state ────────────────────────────────────────── */
  const [step, setStep] = useState<AuthStep>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [pendingTermsAction, setPendingTermsAction] = useState<'register' | 'google' | null>(null)
  const [acceptedPolicies, setAcceptedPolicies] = useState(false)
  const [emailVerifiedNotice, setEmailVerifiedNotice] = useState(false)
  const [passwordResetNotice, setPasswordResetNotice] = useState(false)
  const [justRegistered, setJustRegistered] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [googleLoading, setGoogleLoading] = useState(false)

  /* ── Read URL params once ──────────────────────────────── */
  useEffect(() => {
    if (sp.get('verified') === 'true') setEmailVerifiedNotice(true)
    if (sp.get('registered') === 'true') setJustRegistered(true)
    if (sp.get('passwordReset') === 'true') setPasswordResetNotice(true)

    const err = sp.get('error')
    if (err) {
      const msg: Record<string, string> = {
        OAuthAccountNotLinked: 'An account with this Google email already exists. Please sign in with your email and password instead.',
        OAuthCallback: 'Google sign-in was interrupted. Please try again.',
        NoAccount: 'No account found with this email. Please create one.',
        GoogleOnly: 'This account uses Google sign-in. Continue with Google below.',
        WrongPassword: 'Incorrect password. Please try again.',
        Default: 'Sign-in failed. Please try again.',
      }
      setError(msg[err] ?? msg.Default)
      // If Google-only, show the right step
      if (err === 'GoogleOnly') {
        setStep('google_only')
      }
    }

    // If URL has ?email= prefill
    const qEmail = sp.get('email')
    if (qEmail) setEmail(qEmail)
  }, [sp]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Resend cooldown timer ─────────────────────────────── */
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  function safeCallbackUrl(param: string | null): string {
    if (param && param.startsWith('/') && !param.startsWith('//')) return param
    return '/dashboard'
  }

  /* ── Step 1: Email submission ──────────────────────────── */
  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      if (!res.ok) {
        setError('Something went wrong. Please try again.')
        setIsLoading(false)
        return
      }
      const data = await res.json()

      if (!data.exists) {
        setStep('create_account')
      } else if (!data.hasPassword && data.hasGoogle) {
        setStep('google_only')
      } else {
        setStep('password')
      }
    } catch {
      setError('Could not connect. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email])

  /* ── Step 2: Password login ────────────────────────────── */
  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      })
      if (result?.error) {
        if (result.error === 'WrongPassword') setError('Incorrect password. Please try again.')
        else if (result.error === 'NoAccount') {
          setError('No account found with this email.')
          setStep('create_account')
        }
        else if (result.error === 'GoogleOnly') {
          setError('This account uses Google sign-in. Continue with Google below.')
          setStep('google_only')
        }
        else setError('The email or password doesn\'t match. Please try again.')
      } else if (result?.ok) {
        const dest = safeCallbackUrl(sp.get('callbackUrl'))
        router.push(getEmbedAwareRedirectUrl(dest))
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email, password, router, sp])

  /* ── Google sign-in ────────────────────────────────────── */
  const handleGoogle = useCallback(async (intent: 'signin' | 'signup') => {
    setGoogleLoading(true)
    setError(null)
    try {
      if (isInShopifyEmbed()) {
        const callbackUrl = getEmbedAwareRedirectUrl('/shopify-auth-success')
        const outcome = await openGoogleAuthPopup({ callbackUrl, intent })
        if (outcome.status === 'blocked') { redirectTopForAuth(); return }
        try {
          const sess = await fetch('/api/auth/session', { cache: 'no-store' }).then(r => r.json())
          if (sess?.user) {
            const dest = sess.user.requirePassword
              ? getEmbedAwareRedirectUrl('/setup?requirePassword=1')
              : getEmbedAwareRedirectUrl(safeCallbackUrl(sp.get('callbackUrl')))
            router.push(dest)
            router.refresh()
            return
          }
        } catch { /* fall through */ }
        if (outcome.status === 'error') {
          if (shouldFallbackToTopOutcome(outcome.error)) { redirectTopForAuth(); return }
          setError(googleAuthErrorMessage(outcome.error))
          return
        }
        redirectTopForAuth()
        return
      }
      // Normal (non-embed) flow
      const target = intent === 'signup'
        ? '/setup'
        : safeCallbackUrl(sp.get('callbackUrl'))
      await signIn('google', { callbackUrl: getEmbedAwareRedirectUrl(target) })
    } catch {
      setError('Google sign-in failed. Please try again.')
    } finally {
      setGoogleLoading(false)
      setIsLoading(false)
    }
  }, [router, sp])

  /* ── Registration ──────────────────────────────────────── */
  const handleRegister = useCallback(async () => {
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!/[A-Z]/.test(password)) { setError('Password must include an uppercase letter.'); return }
    if (!/\d/.test(password)) { setError('Password must include a number.'); return }
    if (name.trim().length < 2) { setError('Please enter your name.'); return }
    if (storeName.trim().length < 2) { setError('Please enter a store name.'); return }

    setIsLoading(true)
    try {
      // Derive a domain from storeName if needed (placeholder for onboarding)
      const domain = `${storeName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')}.myshopify.com`
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          storeName: storeName.trim(),
          storeDomain: domain,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setStep('verify_email')
        setResendCooldown(60)
      } else {
        setError(data.message || 'Registration failed. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [email, password, name, storeName])

  const handleSubmitTerms = () => {
    setAcceptedPolicies(true)
    setShowTerms(false)
    if (pendingTermsAction === 'register') {
      setPendingTermsAction(null)
      handleRegister()
    } else if (pendingTermsAction === 'google') {
      setPendingTermsAction(null)
      handleGoogle('signup')
    }
  }

  const handleResendVerification = useCallback(async () => {
    if (resendCooldown > 0) return
    setError(null)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      setResendCooldown(60)
      setToast({ message: 'Verification email resent. Check your inbox.', type: 'success' })
    } catch {
      setError('Could not resend. Please try again.')
    }
  }, [email, resendCooldown])

  /* ── Shared input styles ───────────────────────────────── */
  const inputCls = 'w-full py-3 px-4 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition text-sm'
  const btnPrimary = 'w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition active:scale-[0.98] flex items-center justify-center gap-2 min-h-12'

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showTerms && (
        <TermsModal onClose={() => { setShowTerms(false); setPendingTermsAction(null) }} onAccept={handleSubmitTerms} />
      )}

      <div className="w-full max-w-[420px]">
        {/* ── Logo ─────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5 mb-10 group">
          <Image src="/favicon-32x32.png" alt="CartGain" width={32} height={32} className="w-8 h-8 rounded-lg" priority />
          <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
        </Link>

        {/* ── Headline ─────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1.5">Welcome to CartGain</h1>
          <p className="text-sm text-slate-400">Recover more carts. Convert more customers.</p>
        </div>

        {/* ── Notices ──────────────────────────────────────── */}
        {emailVerifiedNotice && (
          <div className="mb-5 p-3 bg-emerald-900/30 border border-emerald-500/40 rounded-lg flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-300">Email verified successfully. Sign in to continue.</p>
          </div>
        )}
        {passwordResetNotice && (
          <div className="mb-5 p-3 bg-emerald-900/30 border border-emerald-500/40 rounded-lg flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-300">Password updated successfully. Sign in with your new password.</p>
          </div>
        )}
        {justRegistered && (
          <div className="mb-5 p-3 bg-emerald-900/30 border border-emerald-500/40 rounded-lg flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-300">Account created! Please verify your email to continue.</p>
          </div>
        )}
        {error && (
          <div className="mb-5 p-3 bg-red-900/30 border border-red-500/40 rounded-lg flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* ── STEP: Email ──────────────────────────────────── */}
        {step === 'email' && (
          <>
            {/* Google button */}
            <button
              onClick={() => {
                if (!acceptedPolicies) { setShowTerms(true); setPendingTermsAction('google'); return }
                handleGoogle('signin')
              }}
              disabled={isLoading || googleLoading}
              className="w-full py-3 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 disabled:opacity-50 transition active:scale-[0.98] flex items-center justify-center gap-2.5 min-h-12"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-slate-950 text-slate-500">OR</span>
              </div>
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  disabled={isLoading}
                  className={inputCls}
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" disabled={isLoading || !email.trim()} className={btnPrimary}>
                {isLoading ? 'Checking...' : 'Continue'}
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          </>
        )}

        {/* ── STEP: Password (existing account) ────────────── */}
        {step === 'password' && (
          <>
            <button
              onClick={() => handleGoogle('signin')}
              disabled={googleLoading}
              className="w-full py-3 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 disabled:opacity-50 transition active:scale-[0.98] flex items-center justify-center gap-2.5 min-h-12 mb-6"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-slate-950 text-slate-500">OR</span>
              </div>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input id="email" type="email" readOnly value={email} className={`${inputCls} bg-slate-800/60 cursor-default`} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-medium text-slate-400">Password</label>
                  <button type="button" onClick={() => setStep('email')} className="text-xs text-slate-500 hover:text-slate-300 transition">Change email</button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    autoComplete="current-password"
                    disabled={isLoading}
                    className={`${inputCls} pr-11`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isLoading || !password} className={btnPrimary}>
                {isLoading ? 'Signing in...' : 'Sign in'}
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>

              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-xs text-slate-500 hover:text-slate-300 transition">Forgot password?</Link>
              </div>
            </form>
          </>
        )}

        {/* ── STEP: Google-only account ────────────────────── */}
        {step === 'google_only' && (
          <>
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg mb-6">
              <p className="text-sm text-blue-200">
                This account was created with Google. Please sign in with Google to continue.
              </p>
            </div>

            <button
              onClick={() => handleGoogle('signin')}
              disabled={googleLoading}
              className="w-full py-3 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-100 disabled:opacity-50 transition active:scale-[0.98] flex items-center justify-center gap-2.5 min-h-12"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <button onClick={() => { setStep('email'); setPassword(''); setError(null) }} className="w-full mt-3 py-2.5 text-sm text-slate-400 hover:text-white transition">
              ← Use a different email
            </button>
          </>
        )}

        {/* ── STEP: Create account ─────────────────────────── */}
        {step === 'create_account' && (
          <form onSubmit={e => { e.preventDefault(); if (!acceptedPolicies) { setShowTerms(true); setPendingTermsAction('register'); return } handleRegister() }} className="space-y-3">
            <button type="button" onClick={() => { setStep('email'); setError(null) }} className="text-xs text-slate-500 hover:text-slate-300 transition mb-2 block">
              ← Use a different email
            </button>

            <div>
              <label htmlFor="name" className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
              <input id="name" type="text" required autoFocus autoComplete="name" disabled={isLoading} className={inputCls} placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input id="email" type="email" readOnly value={email} className={`${inputCls} bg-slate-800/60 cursor-default`} />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                  className={`${inputCls} pr-11`}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div>
              <label htmlFor="storeName" className="block text-xs font-medium text-slate-400 mb-1.5">Store name</label>
              <input id="storeName" type="text" required disabled={isLoading} className={inputCls} placeholder="My Store" value={storeName} onChange={e => setStoreName(e.target.value)} />
              <p className="text-xs text-slate-600 mt-1">You can update this during onboarding.</p>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-400 leading-relaxed cursor-pointer pt-1">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/50"
                checked={acceptedPolicies}
                onChange={e => setAcceptedPolicies(e.target.checked)}
                disabled={isLoading}
              />
              <span>
                I agree to CartGain&apos;s{' '}
                <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline underline-offset-2" onClick={e => e.stopPropagation()}>Terms</Link>,{' '}
                <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline underline-offset-2" onClick={e => e.stopPropagation()}>Privacy</Link>, and{' '}
                <Link href="/dpa" className="text-blue-400 hover:text-blue-300 underline underline-offset-2" onClick={e => e.stopPropagation()}>DPA</Link>.
              </span>
            </label>

            <button type="submit" disabled={isLoading || !acceptedPolicies} className={btnPrimary}>
              {isLoading ? 'Creating account...' : 'Create account'}
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        )}

        {/* ── STEP: Verify email ───────────────────────────── */}
        {step === 'verify_email' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
            <p className="text-sm text-slate-400 mb-6 max-w-xs mx-auto">
              We&apos;ve sent a verification link to <span className="text-white font-medium">{email}</span>. Click the link to verify your account.
            </p>
            <button
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className="text-sm text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed transition"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
            </button>
            <div className="mt-8 pt-6 border-t border-slate-800">
              <button onClick={() => { setStep('email'); setEmail(''); setPassword(''); setName(''); setStoreName(''); setError(null) }} className="text-sm text-slate-500 hover:text-white transition">
                ← Back to sign in
              </button>
            </div>
          </div>
        )}

        {/* ── Footer links ─────────────────────────────────── */}
        {step === 'email' && (
          <p className="text-center text-xs text-slate-600 mt-8">
            By continuing you agree to our{' '}
            <Link href="/terms" className="text-slate-500 hover:text-slate-300 transition">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-slate-500 hover:text-slate-300 transition">Privacy Policy</Link>
          </p>
        )}
      </div>
    </div>
  )
}
