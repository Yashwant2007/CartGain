'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  Settings,
  Plug,
  CreditCard,
  LogOut,
  Zap,
  Menu,
  X,
  Home,
  AlertTriangle,
  XCircle,
  BrainCircuit,
  ShoppingCart,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import StatusBadge from '@/components/dashboard/StatusBadge'
import { PAID_PLAN_IDS, FREE_CARTS_THRESHOLD } from '@/lib/plan-constants'
import { getShopifyEmbedParams } from '@/lib/shopify-embed'

function DashboardLayoutInner({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [embedParams, setEmbedParams] = useState<{ shop?: string; host?: string }>({})

  useEffect(() => {
    setEmbedParams(getShopifyEmbedParams())
  }, [])

  const [subStatus, setSubStatus] = useState<{ isFree: boolean; isExhausted: boolean; cartsUsed: number; cartsRemaining: number } | null>(null)
  const [subLoading, setSubLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const controller = new AbortController()
    shopifySessionFetch('/api/subscription', { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.subscription) {
          const sub = data.subscription
          const processed = data.store?.cartsProcessed ?? 0
          const plan = typeof sub.plan === 'string'
            ? (sub.plan === 'starter' ? 'growth' : sub.plan)
            : 'free'
          const isFree = !PAID_PLAN_IDS.includes(plan)
          setSubStatus({
            isFree,
            isExhausted: isFree && processed >= FREE_CARTS_THRESHOLD,
            cartsUsed: processed,
            cartsRemaining: Math.max(0, FREE_CARTS_THRESHOLD - processed),
          })
        }
        if (!controller.signal.aborted) setSubLoading(false)
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        setSubLoading(false)
      })
    return () => controller.abort()
  }, [status])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-blue-300/60 text-sm animate-pulse">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Campaigns', href: '/dashboard/campaigns', icon: Megaphone },
    { name: 'Bargain', href: '/dashboard/bargain', icon: Sparkles },
    { name: 'Carts', href: '/dashboard/carts', icon: ShoppingCart },
    { name: 'AI Insights', href: '/dashboard/ai', icon: BrainCircuit },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { name: 'Data & Privacy', href: '/dashboard/data', icon: ShieldCheck },
    { name: 'Subscription', href: '/dashboard/subscription', icon: CreditCard },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ]

  const closeSidebar = () => setSidebarOpen(false)

  const embedHref = (href: string) => {
    if (!embedParams.shop && !embedParams.host) return href
    const params = new URLSearchParams()
    if (embedParams.shop) params.set('shop', embedParams.shop)
    if (embedParams.host) params.set('host', embedParams.host)
    const qs = params.toString()
    return qs ? `${href}${href.includes('?') ? '&' : '?'}${qs}` : href
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={closeSidebar}
          role="presentation"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/98 border-r border-blue-800/30 transform transition-transform duration-200 ease-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 border-b border-blue-800/30">
            <Link href={embedHref('/dashboard')} className="flex items-center space-x-2 group min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded" onClick={closeSidebar}>
              <Image
                src="/favicon-32x32.png"
                alt="CartGain"
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg flex-shrink-0 group-hover:shadow-lg group-hover:shadow-cyan-500/50 transition-shadow duration-150"
              />
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">CartGain</span>
            </Link>
            <button
              onClick={closeSidebar}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-800/60 transition-colors min-h-10 min-w-10 flex items-center justify-center"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5 text-blue-200" />
            </button>
          </div>

          <nav className="flex-1 px-3 sm:px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={embedHref(item.href)}
                  onClick={closeSidebar}
                  className={`flex items-center px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-colors duration-150 min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-300 border border-cyan-500/40'
                      : 'text-blue-200 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <item.icon className={`mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${isActive ? 'text-cyan-400' : 'text-blue-400'}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          <div className="p-3 sm:p-4 border-t border-blue-800/30 space-y-2">
            <Link
              href={embedHref('/')}
              className="flex items-center px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium text-blue-200 rounded-lg hover:bg-slate-800/60 transition-colors duration-150 min-h-10"
            >
              <Home className="mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              Back to Home
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full flex items-center px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium text-blue-200 rounded-lg hover:bg-red-900/20 hover:text-red-300 transition-colors duration-150 min-h-10"
            >
              <LogOut className="mr-2.5 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-slate-900/80 backdrop-blur-sm border-b border-blue-800/30 sticky top-0 z-30">
          <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6">
            <
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-slate-800/60 transition-colors duration-150 min-h-10 min-w-10 flex items-center justify-center"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5 text-blue-200" />
              </button>
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                <h2 className="text-sm sm:text-lg font-semibold text-white truncate">
                  {navigation.find(item => item.href === pathname)?.name || 'Dashboard'}
                </h2>
                <StatusBadge />
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {subLoading ? null : subStatus?.isFree ? (
                subStatus.isExhausted ? (
                  <Link
                    href={embedHref('/dashboard/subscription')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-gradient-to-r from-red-500 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/30 transition-shadow duration-150 flex-shrink-0"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Limit Reached - Upgrade</span>
                    <span className="sm:hidden">Upgrade</span>
                  </Link>
                ) : (
                  <Link
                    href={embedHref('/dashboard/subscription')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/30 transition-shadow duration-150 flex-shrink-0"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{subStatus.cartsRemaining} free cart{subStatus.cartsRemaining === 1 ? '' : 's'} left</span>
                    <span className="sm:hidden">{subStatus.cartsRemaining} left</span>
                  </Link>
                )
              ) : (
                <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-300 border border-cyan-500/40">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Pro Plan</span>
                </div>
              )}
              <div className="text-xs sm:text-sm text-blue-200 truncate max-w-[100px] sm:max-w-[200px]">
                {session?.user?.name || session?.user?.email}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-blue-300/60 text-sm animate-pulse">Loading...</div>
      </div>
    }>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  )
}
