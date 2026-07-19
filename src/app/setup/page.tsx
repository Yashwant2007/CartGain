'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Zap, Mail, Lock, User, ArrowRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-blue-300/60 text-sm">Loading...</div>
      </div>
    }>
      <SetupContent />
    </Suspense>
  )
}

function SetupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requirePassword = searchParams.get('requirePassword') === '1'
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [storeExists, setStoreExists] = useState(false)
  const [formData, setFormData] = useState({
    storeName: '',
    storeDomain: '',
    password: '',
    confirmPassword: '',
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    if (status !== 'authenticated') return

    const checkStore = async () => {
      try {
        const res = await fetch('/api/stores/current')
        if (res.ok) {
          const data = await res.json()
          if (data?.hasPassword && !requirePassword) {
            router.replace('/dashboard')
            return
          }
          if (data?.store) {
            setStoreExists(true)
            setFormData(prev => ({
              ...prev,
              storeName: data.store.name || '',
              storeDomain: data.store.domain || '',
            }))
          }
        }
      } catch {
        // Show setup form
      }
      setChecking(false)
    }
    checkStore()
  }, [status, router, requirePassword])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.password.length > 0 && formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!storeExists && !formData.storeDomain) {
      setError('Please enter a store domain')
      return
    }

    setIsLoading(true)
    try {
      // Update store name + domain only if store does not yet exist
      if (!storeExists) {
        const storeRes = await fetch('/api/stores/current', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.storeName,
            domain: formData.storeDomain,
          }),
        })
        if (!storeRes.ok) {
          const err = await storeRes.json()
          throw new Error(err.message || 'Failed to update store')
        }
      }

      // Set password for the user account
      if (formData.password && session?.user?.email) {
        const pwRes = await fetch('/api/auth/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: session.user.email,
            password: formData.password,
          }),
        })
        if (!pwRes.ok) {
          const err = await pwRes.json()
          throw new Error(err.message || 'Failed to set password')
        }
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  if (checking || status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-blue-300/60 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center space-x-2 mb-8 group">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:shadow-lg group-hover:shadow-primary-600/50 transition-all">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white group-hover:text-blue-200 transition">CartGain</span>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            {requirePassword ? 'Set a password' : 'Complete your setup'}
          </h1>
          <p className="text-sm sm:text-base text-blue-200">
            Signed in as <span className="text-blue-300 font-medium">{session?.user?.email}</span>
          </p>
          <p className="text-xs sm:text-sm text-blue-300/80 mt-2">
            This password will be required to access your account or make changes. You can also sign in with Google anytime.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 sm:p-4 bg-red-900/20 border border-red-700/40 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!storeExists && (
            <>
              <div>
                <label htmlFor="storeName" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">Store Name</label>
                <input
                  id="storeName"
                  type="text"
                  required
                  disabled={isLoading}
                  className="input w-full bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base rounded-lg px-4 py-3"
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
                  className="input w-full bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base rounded-lg px-4 py-3"
                  placeholder="mystore.com"
                  value={formData.storeDomain}
                  onChange={(e) => setFormData({ ...formData, storeDomain: e.target.value })}
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">
              Create a strong password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 pointer-events-none" />
              <input
                id="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
                className="input w-full pl-10 bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base rounded-lg px-4 py-3"
                placeholder="At least 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value, confirmPassword: '' })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs sm:text-sm font-medium text-blue-200 mb-2">
              Confirm password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-blue-400 flex-shrink-0 pointer-events-none" />
              <input
                id="confirmPassword"
                type="password"
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
                className="input w-full pl-10 bg-slate-800/40 border border-blue-700/50 text-white placeholder-blue-400/50 focus:border-blue-500/70 text-sm sm:text-base rounded-lg px-4 py-3"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              />
            </div>
            {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
            {formData.password && formData.confirmPassword && formData.password === formData.confirmPassword && formData.password.length >= 8 && (
              <p className="text-xs text-green-400 mt-1">Passwords match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 sm:py-3.5 bg-primary-600 text-white text-sm sm:text-base font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition active:scale-95 flex items-center justify-center gap-2 min-h-12"
          >
            {isLoading ? 'Saving...' : (requirePassword ? 'Set Password' : 'Complete Setup')}
            {!isLoading && <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </form>
      </div>
    </div>
  )
}
