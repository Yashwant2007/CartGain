'use client'

import { useEffect, useState } from 'react'

type SystemStatus = 'loading' | 'live' | 'partial' | 'inactive'

export default function StatusBadge() {
  const [status, setStatus] = useState<SystemStatus>('loading')

  useEffect(() => {
    fetch('/api/integrations/status')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) {
          setStatus('inactive')
          return
        }
        const integrationsConnected = data.integrations?.some((i: any) => i.connected)
        const messagingConnected = data.messagingServices?.some((m: any) => m.connected)
        if (integrationsConnected && messagingConnected) {
          setStatus('live')
        } else if (integrationsConnected || messagingConnected) {
          setStatus('partial')
        } else {
          setStatus('inactive')
        }
      })
      .catch(() => setStatus('inactive'))
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex items-center space-x-2 bg-slate-700/30 text-blue-300/50 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm border border-slate-600/30">
        <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
          <span className="relative inline-flex rounded-full h-full w-full bg-slate-500"></span>
        </span>
        <span className="font-medium">Checking...</span>
      </div>
    )
  }

  if (status === 'live') {
    return (
      <div className="flex items-center space-x-2 bg-emerald-100/10 text-emerald-300 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm border border-emerald-500/20">
        <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
        </span>
        <span className="font-medium">Live</span>
      </div>
    )
  }

  if (status === 'partial') {
    return (
      <div className="flex items-center space-x-2 bg-amber-100/10 text-amber-300 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm border border-amber-500/20">
        <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
          <span className="relative inline-flex rounded-full h-full w-full bg-amber-400"></span>
        </span>
        <span className="font-medium">Partial</span>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-2 bg-red-100/10 text-red-300 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm border border-red-500/20">
      <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
        <span className="relative inline-flex rounded-full h-full w-full bg-red-400"></span>
      </span>
      <span className="font-medium">Inactive</span>
    </div>
  )
}
