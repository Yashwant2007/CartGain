'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Plug, Settings, RefreshCw } from 'lucide-react'

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState([
    {
      id: 'shopify',
      name: 'Shopify',
      description: 'Connect your Shopify store for automatic cart tracking',
      icon: '🛒',
      connected: true,
      storeName: 'My Awesome Store',
      status: 'active',
      lastSync: '2 min ago',
    },
    {
      id: 'woocommerce',
      name: 'WooCommerce',
      description: 'Sync carts from your WooCommerce store',
      icon: '📦',
      connected: false,
      status: 'disconnected',
    },
    {
      id: 'magento',
      name: 'Magento',
      description: 'Enterprise e-commerce integration',
      icon: '🔷',
      connected: false,
      status: 'disconnected',
    },
    {
      id: 'bigcommerce',
      name: 'BigCommerce',
      description: 'Connect BigCommerce for cart recovery',
      icon: '🏪',
      connected: false,
      status: 'disconnected',
    },
    {
      id: 'custom',
      name: 'Custom API',
      description: 'Use our REST API for custom integrations',
      icon: '⚡',
      connected: false,
      status: 'available',
    },
  ])

  const [messagingServices, setMessagingServices] = useState([
    {
      id: 'twilio',
      name: 'Twilio SMS',
      description: 'Send SMS messages via Twilio',
      icon: '💬',
      connected: true,
      credits: 847,
      status: 'active',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'WhatsApp messages via Meta Business API',
      icon: '📱',
      connected: false,
      status: 'disconnected',
    },
    {
      id: 'sendgrid',
      name: 'SendGrid',
      description: 'Email delivery via SendGrid',
      icon: '📧',
      connected: true,
      credits: 9500,
      status: 'active',
    },
    {
      id: 'onesignal',
      name: 'OneSignal',
      description: 'Push notifications',
      icon: '🔔',
      connected: false,
      status: 'disconnected',
    },
  ])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-600 mt-1">Connect your store and messaging services</p>
      </div>

      {/* Store Integrations */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">E-commerce Platforms</h2>
        <div className="grid gap-4">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConnect={() => console.log('Connect', integration.id)}
              onDisconnect={() => console.log('Disconnect', integration.id)}
            />
          ))}
        </div>
      </section>

      {/* Messaging Services */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Messaging Services</h2>
        <div className="grid gap-4">
          {messagingServices.map((service) => (
            <IntegrationCard
              key={service.id}
              integration={service}
              onConnect={() => console.log('Connect', service.id)}
              onDisconnect={() => console.log('Disconnect', service.id)}
              isMessaging
            />
          ))}
        </div>
      </section>

      {/* API Keys Section */}
      <section className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Access</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">REST API</h3>
              <p className="text-sm text-gray-500">Programmatic access to RecoverFlow</p>
            </div>
            <button className="btn-secondary text-sm">View Documentation</button>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Webhook Endpoints</h3>
              <p className="text-sm text-gray-500">Receive real-time events</p>
            </div>
            <button className="btn-secondary text-sm">Manage Webhooks</button>
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
  integration: any
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
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="text-4xl">{integration.icon}</div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-900">{integration.name}</h3>
              {integration.connected && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {!integration.connected && (
                <XCircle className="w-5 h-5 text-gray-300" />
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{integration.description}</p>
            {integration.connected && integration.storeName && (
              <p className="text-sm text-green-600 mt-2">
                Connected to: {integration.storeName}
              </p>
            )}
            {integration.connected && integration.lastSync && (
              <p className="text-xs text-gray-500 mt-1">Last sync: {integration.lastSync}</p>
            )}
            {isMessaging && integration.credits !== undefined && (
              <p className="text-sm text-blue-600 mt-2">
                Available credits: {integration.credits.toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          {integration.connected ? (
            <>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Disconnect
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-4 h-4 text-gray-500" />
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="btn-primary text-sm"
            >
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function handleDisconnect() {
  // Placeholder - would show confirmation modal
  if (confirm('Are you sure you want to disconnect? This will stop all recovery campaigns for this store.')) {
    // Handle disconnect
  }
}
