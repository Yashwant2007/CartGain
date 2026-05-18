'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Settings, RefreshCw } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type IntegrationItem = {
  id: string
  name: string
  description: string
  icon: string
  connected: boolean
  status: string
  storeName?: string
  lastSync?: string
  credits?: number
}

type IntegrationStatus = {
  store: {
    id: string
    name: string
    domain: string
    platform: string
    connected: boolean
    lastSync: string
  }
  integrations: IntegrationItem[]
  messagingServices: IntegrationItem[]
}

export default function IntegrationsPage() {
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadStatus = async () => {
      if (!storeId) {
        return
      }

      try {
        setLoadingData(true)
        setLoadError(null)

        const response = await fetch('/api/integrations/status')
        if (!response.ok) {
          throw new Error('Failed to load integrations')
        }

        const data = await response.json()
        if (!cancelled) {
          setStatus(data)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load integrations')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    loadStatus()

    return () => {
      cancelled = true
    }
  }, [storeId])

  const integrations = status?.integrations ?? []
  const messagingServices = status?.messagingServices ?? []
  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-blue-300/80 mt-1">
          {status?.store
            ? `Connected store: ${status.store.name} (${status.store.platform})`
            : 'Connect your store and messaging services'}
        </p>
      </div>

      {isLoading && <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading integrations...</div>}
      {error && <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>}

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">E-commerce Platforms</h2>
        <div className="grid gap-4">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConnect={() => undefined}
              onDisconnect={() => undefined}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Messaging Services</h2>
        <div className="grid gap-4">
          {messagingServices.map((service) => (
            <IntegrationCard
              key={service.id}
              integration={service}
              onConnect={() => undefined}
              onDisconnect={() => undefined}
              isMessaging
            />
          ))}
        </div>
      </section>

      <section className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-4">API Access</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg hover:border-blue-700/60 transition-all">
            <div>
              <h3 className="font-medium text-white">REST API</h3>
              <p className="text-sm text-blue-300/60">Programmatic access to CartGain</p>
            </div>
            <button className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all">View Documentation</button>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg hover:border-blue-700/60 transition-all">
            <div>
              <h3 className="font-medium text-white">Webhook Endpoints</h3>
              <p className="text-sm text-blue-300/60">Receive real-time events</p>
            </div>
            <button className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all">Manage Webhooks</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  isMessaging = false,
}: {
  integration: IntegrationItem
  onConnect: () => void
  onDisconnect: () => void
  isMessaging?: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)

  const handleConnect = async () => {
    setIsLoading(true)
    await onConnect()
    setIsLoading(false)
  }

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="text-4xl">{integration.icon}</div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-white">{integration.name}</h3>
              {integration.connected ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-blue-300/40" />
              )}
            </div>
            <p className="text-sm text-blue-300/80 mt-1">{integration.description}</p>
            {integration.connected && integration.storeName && (
              <p className="text-sm text-green-400 mt-2">Connected to: {integration.storeName}</p>
            )}
            {integration.connected && integration.lastSync && (
              <p className="text-xs text-blue-300/60 mt-1">Last sync: {integration.lastSync}</p>
            )}
            {isMessaging && integration.credits !== undefined && (
              <p className="text-sm text-cyan-400 mt-2">
                Available credits: {integration.credits.toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          {integration.connected ? (
            <>
              <button
                onClick={onDisconnect}
                className="px-4 py-2 text-sm text-red-400 hover:bg-red-600/20 rounded-lg transition-colors"
              >
                Disconnect
              </button>
              <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                <Settings className="w-4 h-4 text-blue-300/80" />
              </button>
            </>
          ) : (
            <button onClick={handleConnect} disabled={isLoading} className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all">
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
