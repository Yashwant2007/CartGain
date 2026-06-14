'use client'

import { useState } from 'react'
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
  Home
} from 'lucide-react'

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
          <div className="flex items-center space-x-2 bg-emerald-100/10 text-emerald-300 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm border border-emerald-500/20">
            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
            </span>
            <span className="font-medium">Live</span>
          </div>
        </header>

        {/* Page content - with responsive padding */}
        <main className="p-3 sm:p-4 md:p-6 lg:p-8 min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}
