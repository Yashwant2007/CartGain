'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Zap, Mail, Lock, User, ArrowRight, CheckCircle, AlertTriangle, X } from 'lucide-react'

function Toast({ message, type, onClose }: { message: string; type: 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed top-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl shadow-2xl border transition-all animate-slide-in ${
      type === 'error'
        ? 'bg-red-900/90 border-red-500/50 backdrop-blur-md'
        : 'bg-blue-900/90 border-blue-500/50 backdrop-blur-md'
    }`}>
      {type === 'error' ? (
        <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle className="w-5 h-5 text-blue-300 mt-0.5 flex-shrink-0" />
      )}
      <p className="text-sm text-white/90 max-w-sm">{message}</p>
      <button onClick={onClose} className="p-0.5 hover:bg-white/10 rounded transition">
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
            <p className="text-sm text-blue-300/70 mt-1">
              Please accept our terms to continue.
            </p>
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
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-800 border border-slate-700 text-white/80 text-sm font-medium rounded-lg hover:bg-slate-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:from-blue-500 hover:to-cyan-500 transition"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [pendingGoogleSignIn, setPendingGoogleSignIn] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    storeName: '',
    storeDomain: '',
  })
  const [acceptedPolicies, setAcceptedPolicies] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!acceptedPolicies) {
      setShowTermsModal(true)
      return
    }

    setIsLoading(true)

    try {
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters')
        setIsLoading(false)
        return
      }

      if (!formData.storeDomain.length) {
        setError('Please enter a valid store domain')
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok) {
        setToast({ message: 'Account created! Redirecting...', type: 'info' })
        // Auto-sign-in with redirect=true so NextAuth handles session + redirect natively
        await signIn('credentials', {
          email: formData.email,
          password: formData.password,
          callbackUrl: '/dashboard',
          redirect: true,
        })
        // If we reach here, sign-in silently failed — fallback to login page
        router.push('/login?registered=true')
        router.refresh()
      } else {
        setError(data.message || 'Registration failed. Please try again.')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignUp = () => {
    if (!acceptedPolicies) {
      setShowTermsModal(true)
      setPendingGoogleSignIn(true)
      return
    }
    initiateGoogleSignIn()
  }

  const initiateGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      // Tell the NextAuth signIn callback this is a sign-up intent so it
      // may create a new Google-linked account. Cleared after use.
      document.cookie = 'cg_oauth_intent=signup; path=/; max-age=600; SameSite=Lax; Secure'
      await signIn('google', { callbackUrl: '/setup' })
    } catch (err) {
      console.error('Google sign-in error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTermsAccept = () => {
    setAcceptedPolicies(true)
    setShowTermsModal(false)
    if (pendingGoogleSignIn) {
      setPendingGoogleSignIn(false)
      initiateGoogleSignIn()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex flex-col md:flex-row">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showTermsModal && (
        <TermsModal
          onClose={() => { setShowTermsModal(false); setPendingGoogleSignIn(false) }}
          onAccept={handleTermsAccept}
        />
      )}

      {/* Left Side - Form */}
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          <Link href="/" className="flex items-center space-x-2 mb-8 group">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:shadow-lg group-hover:shadow-primary-600/50 transition-all">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
          </Link>

          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Start Your Free Trial</h1>
            <p className="text-sm sm:text-base text-blue-200">No credit card required. First cart recovered free.</p>
          </div>

          {error && (
            <div className="mb-6 p-3 sm:p-4 bg-red-900/20 border border-red-700/40 rounded-lg">
              <p className="text-xs sm:text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 pointer-events-none" />
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="name"
                  disabled={isLoading}
                  className="input pl-10 bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  disabled={isLoading}
                  className="input pl-10 bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 pointer-events-none" />
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  disabled={isLoading}
                  className="input pl-10 bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <p className="text-xs text-blue-400/70 mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label htmlFor="storeName" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">Store Name</label>
              <input
                id="storeName"
                type="text"
                required
                disabled={isLoading}
                className="input bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base"
                placeholder="My Awesome Store"
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="storeDomain" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">Store Domain</label>
              <input
                id="storeDomain"
                type="text"
                required
                disabled={isLoading}
                className="input bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base"
                placeholder="mystore.com"
                value={formData.storeDomain}
                onChange={(e) => setFormData({ ...formData, storeDomain: e.target.value })}
              />
            </div>

            <label className="flex items-start gap-3 text-xs sm:text-sm text-blue-300/80 leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-blue-500/50 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                checked={acceptedPolicies}
                onChange={(e) => setAcceptedPolicies(e.target.checked)}
                disabled={isLoading}
              />
              <span>
                I agree to CartGain&apos;s{' '}
                <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Terms of Service</Link>
                ,{' '}
                <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Privacy Policy</Link>
                , and{' '}
                <Link href="/dpa" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Data Processing Agreement</Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 sm:py-3.5 bg-primary-600 text-white text-sm sm:text-base font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition active:scale-95 flex items-center justify-center gap-2 min-h-12"
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
              {!isLoading && <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            <p className="text-xs text-blue-300/70 leading-relaxed text-center px-1">
              CartGain processes only the minimum merchant and customer data needed to recover abandoned carts and deliver notifications.
            </p>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-blue-700/30"></div>
            </div>
            <div className="relative flex justify-center text-xs sm:text-sm">
              <span className="px-2 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-blue-300">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            className="w-full py-3 sm:py-3.5 bg-slate-800/40 border border-blue-700/50 text-white text-sm sm:text-base font-semibold rounded-lg hover:border-blue-500/70 hover:bg-slate-800/60 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 transition active:scale-95 flex items-center justify-center gap-2 min-h-12"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign up with Google
          </button>

          <p className="text-center text-xs sm:text-sm text-blue-300 mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 rounded transition">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side - Benefits - hidden on mobile, shown on tablet and up */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-900/40 to-blue-950/20 items-center justify-center p-8 lg:p-12">
        <div className="max-w-md text-white">
          <h2 className="text-3xl lg:text-4xl font-bold mb-8">Everything You Need</h2>
          <div className="space-y-6">
            <BenefitItem text="Multi-channel recovery (SMS, WhatsApp, Email)" />
            <BenefitItem text="AI-optimized send times" />
            <BenefitItem text="Real-time analytics" />
            <BenefitItem text="One-click integrations" />
            <BenefitItem text="Pay per recovery model" />
          </div>
        </div>
      </div>
    </div>
  )
}

function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-start space-x-3">
      <CheckCircle className="w-5 h-5 lg:w-6 lg:h-6 flex-shrink-0 text-blue-300" />
      <span className="text-sm lg:text-lg text-blue-100">{text}</span>
    </div>
  )
}
