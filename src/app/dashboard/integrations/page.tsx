'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Settings, ExternalLink, Copy, Key, Webhook, Eye, EyeOff } from 'lucide-react'
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
    apiKey?: string | null
    apiSecret?: string | null
  }
  integrations: IntegrationItem[]
  messagingServices: IntegrationItem[]
}

type CredentialModal = {
  type: 'woocommerce' | 'magento' | 'bigcommerce' | 'custom' | 'msg91' | 'whatsapp' | 'resend' | 'onesignal'
  name: string
  icon: string
} | null

export default function IntegrationsPage() {
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [credentialModal, setCredentialModal] = useState<CredentialModal>(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [shopifyModal, setShopifyModal] = useState(false)
  const [shopifyDomain, setShopifyDomain] = useState('')
  const [shopifyConnecting, setShopifyConnecting] = useState(false)
  const [shopifyInputError, setShopifyInputError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!storeId) return
    try {
      setLoadingData(true)
      setLoadError(null)
      const res = await fetch('/api/integrations/status')
      if (!res.ok) throw new Error('Failed to load integrations')
      const data = await res.json()
      setStatus(data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load integrations')
    } finally {
      setLoadingData(false)
    }
  }, [storeId])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Listen for the shopify-connected page to signal back when OAuth completes
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === 'shopify_connected') {
        setActionMsg({ type: 'success', text: 'Shopify store connected successfully!' })
        loadStatus()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [loadStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('shopify_connected') === 'true') {
      setActionMsg({ type: 'success', text: 'Shopify store connected successfully!' })
      window.history.replaceState({}, '', window.location.pathname)
      loadStatus()
    }
    if (params.get('shopify_error')) {
      setActionMsg({ type: 'error', text: decodeURIComponent(params.get('shopify_error')!) })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [loadStatus])

  // Auto-trigger Shopify OAuth if the merchant arrived from a Shopify install flow
  useEffect(() => {
    if (!status?.store || status.integrations.find(i => i.id === 'shopify')?.connected) return

    fetch('/api/shopify/pending-install')
      .then(r => r.json())
      .then(({ shop }: { shop: string | null }) => {
        if (!shop) return
        fetch('/api/shopify/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop, storeId: status.store.id }),
        })
          .then(r => r.json())
          .then(data => {
            if (!data.authUrl) return
            // Auto-install: merchant came from Shopify install flow, not inside admin iframe
            window.location.href = data.authUrl
          })
          .catch(() => {})
      })
      .catch(() => {})
  }, [status])

  const updatePlatform = async (platform: string, data: Record<string, string>) => {
    const res = await fetch('/api/stores/current', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, ...data }),
    })
    if (!res.ok) throw new Error('Failed to update store')
    await loadStatus()
  }

  const handleShopifyConnect = async (rawDomain: string) => {
    if (!status?.store) return
    setShopifyConnecting(true)
    setShopifyInputError(null)
    try {
      // Normalise: strip protocol/path, enforce .myshopify.com suffix
      let domain = rawDomain.trim().toLowerCase()
      if (domain.startsWith('http://') || domain.startsWith('https://')) {
        domain = new URL(domain).hostname
      }
      domain = domain.split('/')[0]
      domain = domain.replace(/\.myshopify\.com$/, '')
      if (!domain) throw new Error('Please enter your Shopify store name.')
      domain = `${domain}.myshopify.com`

      const res = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: domain, storeId: status.store.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to initiate connection')

      setShopifyModal(false)
      // Open OAuth in a new tab — redirecting window.top loses the Shopify admin
      // session on the cross-domain hop (admin.shopify.com → store.myshopify.com)
      // which sends the merchant to the password-protected storefront instead.
      const popup = window.open(data.authUrl, '_blank', 'noopener,noreferrer')
      if (!popup) {
        // Popup blocked — fall back to same-window redirect
        window.location.href = data.authUrl
      } else {
        setActionMsg({ type: 'success', text: 'A new tab has opened for Shopify authorization — complete the steps there, then come back here.' })
      }
    } catch (error) {
      setShopifyInputError(error instanceof Error ? error.message : 'Connection failed')
    } finally {
      setShopifyConnecting(false)
    }
  }

  const handleDisconnect = async (integration: IntegrationItem) => {
    try {
      if (integration.id === 'shopify') {
        await updatePlatform('custom', { apiKey: '', apiSecret: '' })
      } else {
        await updatePlatform('custom', { apiKey: '', apiSecret: '' })
      }
      setActionMsg({ type: 'success', text: `${integration.name} disconnected successfully` })
    } catch (error) {
      setActionMsg({ type: 'error', text: `Failed to disconnect ${integration.name}` })
    }
  }

  const handleCredentialConnect = async (platform: string, credentials: Record<string, string>) => {
    try {
      await updatePlatform(platform, credentials)
      setCredentialModal(null)
      setActionMsg({ type: 'success', text: `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully` })
    } catch (error) {
      setActionMsg({ type: 'error', text: `Failed to connect ${platform}` })
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setActionMsg({ type: 'success', text: 'Copied to clipboard' })
    } catch {
      setActionMsg({ type: 'error', text: 'Failed to copy' })
    }
  }

  const integrations = status?.integrations ?? []
  const messagingServices = status?.messagingServices ?? []
  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  const platformActions: Record<string, { onConnect: () => void; onDisconnect: () => void }> = {
    shopify: {
      onConnect: () => { setShopifyDomain(''); setShopifyInputError(null); setShopifyModal(true) },
      onDisconnect: () => handleDisconnect(integrations.find(i => i.id === 'shopify')!),
    },
    woocommerce: {
      onConnect: () => setCredentialModal({ type: 'woocommerce', name: 'WooCommerce', icon: '📦' }),
      onDisconnect: () => handleDisconnect(integrations.find(i => i.id === 'woocommerce')!),
    },
    magento: {
      onConnect: () => setCredentialModal({ type: 'magento', name: 'Magento', icon: '🔷' }),
      onDisconnect: () => handleDisconnect(integrations.find(i => i.id === 'magento')!),
    },
    bigcommerce: {
      onConnect: () => setCredentialModal({ type: 'bigcommerce', name: 'BigCommerce', icon: '🏪' }),
      onDisconnect: () => handleDisconnect(integrations.find(i => i.id === 'bigcommerce')!),
    },
    custom: {
      onConnect: () => setCredentialModal({ type: 'custom', name: 'Custom API', icon: '⚡' }),
      onDisconnect: () => handleDisconnect(integrations.find(i => i.id === 'custom')!),
    },
  }

  const messagingActions: Record<string, { onConnect: () => void }> = {
    msg91: { onConnect: () => setCredentialModal({ type: 'msg91', name: 'MSG91 SMS', icon: '💬' }) },
    whatsapp: { onConnect: () => setCredentialModal({ type: 'whatsapp', name: 'WhatsApp Business', icon: '📱' }) },
    resend: { onConnect: () => setCredentialModal({ type: 'resend', name: 'Resend', icon: '📧' }) },
    onesignal: { onConnect: () => setCredentialModal({ type: 'onesignal', name: 'OneSignal', icon: '🔔' }) },
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          actionMsg.type === 'success' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-600/20 text-red-300 border border-red-500/40'
        }`}>
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="float-right ml-4 opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

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
          {integrations.map((integration) => {
            const actions = platformActions[integration.id]
            return (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onConnect={actions?.onConnect ?? (() => {})}
                onDisconnect={actions?.onDisconnect ?? (() => {})}
              />
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Messaging Services</h2>
        <div className="grid gap-4">
          {messagingServices.map((service) => {
            const actions = messagingActions[service.id]
            return (
              <IntegrationCard
                key={service.id}
                integration={service}
                onConnect={actions?.onConnect ?? (() => {})}
                onDisconnect={() => {}}
                isMessaging
              />
            )
          })}
        </div>
      </section>

      <section className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-4">API Access</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg hover:border-blue-700/60 transition-all">
            <div className="flex items-start space-x-3">
              <Key className="w-5 h-5 text-cyan-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-white">REST API Key</h3>
                <p className="text-sm text-blue-300/60">Programmatic access to CartGain data</p>
                {status?.store.apiKey ? (
                  <div className="mt-2 flex items-center space-x-2">
                    <code className="px-2 py-1 bg-slate-900/60 rounded text-xs font-mono text-cyan-300">
                      {apiKeyVisible ? status.store.apiKey : `${status.store.apiKey.slice(0, 8)}...${status.store.apiKey.slice(-4)}`}
                    </code>
                    <button onClick={() => setApiKeyVisible(!apiKeyVisible)} className="p-1 hover:bg-slate-600/40 rounded text-blue-300/60 hover:text-blue-200">
                      {apiKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleCopy(status.store.apiKey!)} className="p-1 hover:bg-slate-600/40 rounded text-blue-300/60 hover:text-blue-200">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-blue-300/40 mt-1">Connect an e-commerce platform to generate an API key</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg hover:border-blue-700/60 transition-all">
            <div className="flex items-start space-x-3">
              <Webhook className="w-5 h-5 text-cyan-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-white">Webhook Endpoint</h3>
                <p className="text-sm text-blue-300/60">Receive real-time cart events</p>
                <p className="text-xs text-blue-300/40 mt-1">POST to this URL to receive cart recovery events</p>
              </div>
            </div>
            <button onClick={() => {
              const webhookUrl = `${window.location.origin}/api/webhooks/shopify`
              handleCopy(webhookUrl)
            }} className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all">
              Copy Webhook URL
            </button>
          </div>
        </div>
      </section>

      {credentialModal && (
        <CredentialModalComponent
          modal={credentialModal}
          onConnect={handleCredentialConnect}
          onClose={() => setCredentialModal(null)}
        />
      )}

      {shopifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShopifyModal(false)}>
          <div className="bg-slate-800 border border-blue-700/50 rounded-xl p-6 w-full max-w-md shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-2xl">🛍️</span>
              <h3 className="text-lg font-semibold text-white">Connect Shopify Store</h3>
            </div>
            <p className="text-sm text-blue-300/70 mb-5">
              Enter your Shopify store name. You can find it in your Shopify admin URL:<br />
              <span className="font-mono text-cyan-400">your-store-name.myshopify.com</span>
            </p>
            {shopifyInputError && (
              <div className="mb-4 p-3 bg-red-600/20 border border-red-500/40 rounded-lg text-sm text-red-300">{shopifyInputError}</div>
            )}
            <form onSubmit={e => { e.preventDefault(); handleShopifyConnect(shopifyDomain) }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-1">Store name</label>
                <div className="flex items-center bg-slate-700/50 border border-blue-700/50 rounded-lg overflow-hidden focus-within:border-cyan-400/70 focus-within:ring-1 focus-within:ring-cyan-400/30">
                  <input
                    type="text"
                    value={shopifyDomain}
                    onChange={e => setShopifyDomain(e.target.value)}
                    placeholder="your-store-name"
                    className="flex-1 px-3 py-2 bg-transparent text-white text-sm focus:outline-none placeholder-blue-400/40"
                    autoFocus
                    required
                  />
                  <span className="pr-3 text-sm text-blue-400/60 select-none">.myshopify.com</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={shopifyConnecting || !shopifyDomain.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all"
              >
                {shopifyConnecting ? 'Connecting...' : 'Connect Store'}
              </button>
            </form>
            <button onClick={() => setShopifyModal(false)} className="w-full mt-3 py-2 text-sm text-blue-300/60 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
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
  const [busy, setBusy] = useState(false)

  const handleConnect = async () => {
    setBusy(true)
    await onConnect()
    setBusy(false)
  }

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="text-2xl leading-none mt-0.5">{integration.icon}</div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-white text-sm">{integration.name}</h3>
              {integration.connected ? (
                <span className="flex items-center text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Connected</span>
              ) : (
                <span className="flex items-center text-xs text-blue-300/40"><XCircle className="w-3.5 h-3.5 mr-1" /> Disconnected</span>
              )}
            </div>
            <p className="text-sm text-blue-300/70 mt-1">{integration.description}</p>
            {integration.connected && integration.storeName && (
              <p className="text-xs text-emerald-400/80 mt-1.5">Store: {integration.storeName}</p>
            )}
            {integration.connected && integration.lastSync && (
              <p className="text-xs text-blue-300/50 mt-0.5">Last sync: {new Date(integration.lastSync).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            )}
            {isMessaging && integration.credits !== undefined && (
              <p className="text-xs text-cyan-400/80 mt-1.5">
                {integration.connected ? `${integration.credits.toLocaleString('en-IN')} credits available` : 'Configure to start using'}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2 shrink-0 ml-4">
          {integration.connected ? (
            <>
              <button onClick={onDisconnect} className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/20 rounded-lg transition-colors border border-red-500/30 hover:border-red-500/50">
                Disconnect
              </button>
              <button className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors">
                <Settings className="w-4 h-4 text-blue-300/60" />
              </button>
            </>
          ) : (
            <button onClick={handleConnect} disabled={busy} className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all">
              {busy ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const CREDENTIAL_FORMS: Record<string, {
  title: string
  fields: Array<{ key: string; label: string; placeholder: string; type?: string }>
  docUrl: string
  description: string
}> = {
  woocommerce: {
    title: 'Connect WooCommerce',
    description: 'Enter your WooCommerce API credentials from WordPress admin > WooCommerce > Settings > Advanced > REST API.',
    fields: [
      { key: 'domain', label: 'Store URL', placeholder: 'https://yourstore.com', type: 'url' },
      { key: 'apiKey', label: 'Consumer Key', placeholder: 'ck_...' },
      { key: 'apiSecret', label: 'Consumer Secret', placeholder: 'cs_...' },
    ],
    docUrl: 'https://woocommerce.com/document/rest-api/',
  },
  magento: {
    title: 'Connect Magento',
    description: 'Enter your Magento integration credentials from System > Extensions > Integrations.',
    fields: [
      { key: 'domain', label: 'Store URL', placeholder: 'https://yourstore.com', type: 'url' },
      { key: 'apiKey', label: 'Integration Access Token', placeholder: 'Enter access token' },
      { key: 'apiSecret', label: 'Integration Secret', placeholder: 'Enter secret key' },
    ],
    docUrl: 'https://devdocs.magento.com/guides/v2.4/get-started/authentication/gs-authentication-token.html',
  },
  bigcommerce: {
    title: 'Connect BigCommerce',
    description: 'Enter your BigCommerce API credentials from Advanced Settings > API Accounts.',
    fields: [
      { key: 'domain', label: 'Store URL', placeholder: 'https://yourstore.com', type: 'url' },
      { key: 'apiKey', label: 'Client ID', placeholder: 'Enter client ID' },
      { key: 'apiSecret', label: 'Client Secret', placeholder: 'Enter client secret' },
    ],
    docUrl: 'https://developer.bigcommerce.com/api-docs/getting-started/authentication',
  },
  custom: {
    title: 'Custom API Integration',
    description: 'Connect via our REST API. Enter your store details and we will generate API credentials.',
    fields: [
      { key: 'domain', label: 'Store URL', placeholder: 'https://yourstore.com', type: 'url' },
      { key: 'apiKey', label: 'API Key', placeholder: 'Create a unique API key' },
      { key: 'apiSecret', label: 'API Secret', placeholder: 'Create a secret key' },
    ],
    docUrl: '/dashboard/integrations',
  },
  msg91: {
    title: 'MSG91 SMS Configuration',
    description: 'MSG91 is configured via environment variables. Add these to your Vercel project dashboard.',
    fields: [
      { key: 'MSG91_AUTH_KEY', label: 'MSG91_AUTH_KEY', placeholder: 'your_msg91_auth_key' },
      { key: 'MSG91_SENDER_ID', label: 'MSG91_SENDER_ID', placeholder: 'CARTGN' },
    ],
    docUrl: 'https://docs.msg91.com/',
  },
  whatsapp: {
    title: 'WhatsApp Business Configuration',
    description: 'WhatsApp Business API is configured via environment variables. Add these to your Vercel project dashboard.',
    fields: [
      { key: 'WHATSAPP_BUSINESS_TOKEN', label: 'WHATSAPP_BUSINESS_TOKEN', placeholder: 'EAxxxxxxxxxxxxxxxx' },
      { key: 'WHATSAPP_PHONE_NUMBER_ID', label: 'WHATSAPP_PHONE_NUMBER_ID', placeholder: '123456789' },
    ],
    docUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  },
  resend: {
    title: 'Resend Configuration',
    description: 'Resend is configured via environment variable. Add this to your Vercel project dashboard.',
    fields: [
      { key: 'RESEND_API_KEY', label: 'RESEND_API_KEY', placeholder: 're_xxxxx' },
    ],
    docUrl: 'https://resend.com/docs/api-reference/introduction',
  },
  onesignal: {
    title: 'OneSignal Configuration',
    description: 'OneSignal is configured via environment variables. Add these to your Vercel project dashboard.',
    fields: [
      { key: 'ONESIGNAL_APP_ID', label: 'ONESIGNAL_APP_ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'ONESIGNAL_API_KEY', label: 'ONESIGNAL_API_KEY', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    ],
    docUrl: 'https://documentation.onesignal.com/docs',
  },
}

function CredentialModalComponent({
  modal,
  onConnect,
  onClose,
}: {
  modal: CredentialModal
  onConnect: (platform: string, credentials: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!modal) return null
  const form = CREDENTIAL_FORMS[modal.type]
  const isMessaging = ['msg91', 'whatsapp', 'resend', 'onesignal'].includes(modal.type)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isMessaging) {
      const envList = form.fields.map((f) => f.key).join(', ')
      setError(`Set these environment variables in your Vercel dashboard: ${envList}. After deployment, refresh this page.`)
      return
    }

    setVerifying(true)
    setError(null)

    try {
      const verifyRes = await fetch('/api/integrations/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: modal.type, ...values }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok || !verifyData.verified) {
        throw new Error(verifyData.error || 'Verification failed. Check your credentials.')
      }

      setVerifying(false)
      setSaving(true)
      await onConnect(modal.type, values)
    } catch (err) {
      setVerifying(false)
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-800 border border-blue-700/50 rounded-xl p-6 w-full max-w-md shadow-2xl shadow-cyan-500/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center space-x-3 mb-4">
          <span className="text-2xl">{modal.icon}</span>
          <h3 className="text-lg font-semibold text-white">{form.title}</h3>
        </div>

        <p className="text-sm text-blue-300/70 mb-5">{form.description}</p>

        {error && (
          <div className="mb-4 p-3 bg-red-600/20 border border-red-500/40 rounded-lg text-sm text-red-300">{error}</div>
        )}

        {isMessaging ? (
          <div className="space-y-3 mb-5">
            {form.fields.map((field) => (
              <div key={field.key} className="p-3 bg-slate-700/40 border border-blue-700/30 rounded-lg">
                <p className="text-xs text-blue-300/60 font-mono mb-1">{field.key}</p>
                <p className="text-xs text-blue-300/40 font-mono break-all">{field.placeholder}</p>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mb-5">
            {form.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-blue-200 mb-1">{field.label}</label>
                <input
                  type={field.type || 'text'}
                  value={values[field.key] || ''}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30"
                  required
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={saving || verifying}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all"
            >
              {verifying ? 'Verifying...' : saving ? 'Connecting...' : 'Save & Connect'}
            </button>
          </form>
        )}

        <a href={form.docUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors mb-4">
          <ExternalLink className="w-4 h-4 mr-1.5" />
          View Documentation
        </a>

        <button onClick={onClose} className="w-full py-2 text-sm text-blue-300/60 hover:text-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
