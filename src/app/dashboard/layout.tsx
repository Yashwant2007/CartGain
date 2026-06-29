'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
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
} from 'lucide-react'
import StatusBadge from '@/components/dashboard/StatusBadge'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Campaigns', href: '/dashboard/campaigns', icon: Megaphone },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Integrations', href: '/dashboard/integrations', icon: Plug },
    { name: 'Subscription', href: '/dashboard/subscription', icon: CreditCard },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ]

  const [subStatus, setSubStatus] = useState<{ isFree: boolean; isExhausted: boolean; cartsUsed: number; cartsRemaining: number } | null>(null)
  const [subLoading, setSubLoading] = useState(true)

  useEffect(() => {
    fetch('/api/subscription')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.subscription) {
          const sub = data.subscription
          const recovered = data.store?.cartsRecovered ?? 0
          const freeThreshold = 50
          setSubStatus({
            isFree: sub.plan === 'free' || !['starter', 'growth', 'pro'].includes(sub.plan),
            isExhausted: (sub.plan === 'free' || !['starter', 'growth', 'pro'].includes(sub.plan)) && recovered >= freeThreshold,
            cartsUsed: recovered,
            cartsRemaining: Math.max(0, freeThreshold - recovered),
          })
        }
        setSubLoading(false)
      })
      .catch(() => setSubLoading(false))
  }, [])

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeSidebar}
          role="presentation"
        />
      )}

      {/* Sidebar - hidden on mobile, shown on lg and up */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/95 border-r border-blue-800/30 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 border-b border-blue-800/30">
            <Link href="/dashboard" className="flex items-center space-x-2 group min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 rounded" onClick={closeSidebar}>
              <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:shadow-lg group-hover:shadow-primary-600/50 transition-all">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-base sm:text-lg font-bold text-white group-hover:text-blue-200 transition truncate">CartGain</span>
            </Link>
            <button
              className="lg:hidden p-1 rounded-md hover:bg-slate-800/40 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              onClick={closeSidebar}
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-blue-300" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 sm:px-4 py-4 sm:py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={closeSidebar}
                  className={`flex items-center px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                    isActive
                      ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50 shadow-md'
                      : 'text-blue-200 hover:bg-slate-800/40 hover:border hover:border-blue-700/30 active:scale-95'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <item.icon className={`w-4 h-4 sm:w-5 sm:h-5 mr-3 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-blue-400/60'}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-3 sm:p-4 border-t border-blue-800/30 space-y-2">
            <Link
              href="/"
              className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-blue-200 rounded-lg hover:bg-slate-800/40 transition-all min-h-10 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              onClick={closeSidebar}
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5 mr-3 flex-shrink-0 text-blue-400/60" />
              <span className="truncate">Back to Home</span>
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full flex items-center px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-blue-200 rounded-lg hover:bg-red-900/20 hover:text-red-300 transition-all min-h-10 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5 mr-3 flex-shrink-0" />
              <span className="truncate">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Top bar - sticky */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-slate-900/80 backdrop-blur-lg border-b border-blue-800/30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 rounded-md hover:bg-slate-800/40 transition"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-blue-300" />
          </button>
          
          {/* Spacer for desktop */}
          <div className="hidden lg:block flex-1" />
          
          {/* Status indicator */}
          <StatusBadge />
        </header>

        {/* Subscription banner */}
        {!subLoading && subStatus?.isExhausted && (
          <div className="mx-3 sm:mx-4 md:mx-6 lg:mx-8 mt-3 sm:mt-4 md:mt-6 lg:mt-8">
            <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-4 backdrop-blur-sm flex items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-200">Free trial exhausted</p>
                  <p className="text-xs text-blue-300/70 mt-0.5">Cart recovery has been paused. Choose a plan to continue recovering abandoned carts.</p>
                </div>
              </div>
              <Link
                href="/dashboard/subscription"
                className="px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap bg-gradient-to-r from-red-500 to-orange-500 text-white hover:shadow-lg hover:shadow-red-500/50 transition-all flex-shrink-0"
              >
                Upgrade Now
              </Link>
            </div>
          </div>
        )}

        {!subLoading && subStatus && !subStatus.isExhausted && subStatus.isFree && subStatus.cartsUsed > 0 && (
          <div className="mx-3 sm:mx-4 md:mx-6 lg:mx-8 mt-3 sm:mt-4 md:mt-6 lg:mt-8">
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 backdrop-blur-sm flex items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-200">Free trial — {subStatus.cartsRemaining} of 50 carts remaining</p>
                  <p className="text-xs text-blue-300/70 mt-0.5">Upgrade to a paid plan to unlock unlimited cart recovery.</p>
                </div>
              </div>
              <Link
                href="/dashboard/subscription"
                className="px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-lg hover:shadow-amber-500/50 transition-all flex-shrink-0"
              >
                View Plans
              </Link>
            </div>
          </div>
        )}

        {/* Page content - with responsive padding */}
        <main className="p-3 sm:p-4 md:p-6 lg:p-8 min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}
