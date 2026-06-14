'use client'

import { useEffect, useState } from 'react'
import { Bell, CreditCard, Shield, User, Key } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import RazorpayCheckout from '@/components/payment/RazorpayCheckout'

type SessionUser = {
  name?: string | null
  email?: string | null
}

type StoreSettings = {
  id: string
  name: string
  domain: string
  timezone: string
  currency: string
  platform: string
  webhookUrl?: string | null
  apiKey?: string | null
  apiSecret?: string | null
}

type SessionResponse = {
  user?: SessionUser
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [sessionUser, setSessionUser] = useState<SessionUser>({})
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      if (!storeId) {
        return
      }

      try {
        setLoadingData(true)
        setLoadError(null)

        const [storeResponse, sessionResponse] = await Promise.all([
          fetch('/api/stores/current'),
          fetch('/api/auth/session'),
        ])

        if (!storeResponse.ok) {
          throw new Error('Failed to load store settings')
        }

        const storeData = await storeResponse.json()
        const sessionData = (await sessionResponse.json()) as SessionResponse

        if (!cancelled) {
          setStore(storeData.store)
          setSessionUser(sessionData.user ?? {})
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load settings')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [storeId])

  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-blue-300/80 mt-1">
          {sessionUser.email ? `Signed in as ${sessionUser.email}` : 'Manage your account and preferences'}
        </p>
      </div>

      <div className="border-b border-blue-700/30">
        <nav className="flex space-x-8 overflow-x-auto">
          {[
            { id: 'general', name: 'General', icon: User },
            { id: 'notifications', name: 'Notifications', icon: Bell },
            { id: 'billing', name: 'Billing', icon: CreditCard },
            { id: 'security', name: 'Security', icon: Shield },
            { id: 'api', name: 'API Keys', icon: Key },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-blue-300/60 hover:text-blue-300/80 hover:border-blue-700/50'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {isLoading && <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading settings...</div>}
      {error && <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>}

      {activeTab === 'general' && <GeneralSettings store={store} onSave={setStore} />}
      {activeTab === 'notifications' && <NotificationSettings />}
      {activeTab === 'billing' && <BillingSettings />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'api' && <APISettings store={store} />}
    </div>
  )
}

function GeneralSettings({ store, onSave }: { store: StoreSettings | null; onSave: (store: StoreSettings | null) => void }) {
  const [form, setForm] = useState({
    storeName: store?.name ?? 'My Awesome Store',
    storeUrl: store?.domain ?? 'https://mystore.com',
    timezone: store?.timezone ?? 'America/New_York',
    currency: store?.currency ?? 'USD',
    platform: store?.platform ?? 'shopify',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shopifyShop, setShopifyShop] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [shopifyError, setShopifyError] = useState<string | null>(null)
  const [connectMessage, setConnectMessage] = useState<string | null>(null)

  useEffect(() => {
    if (store) {
      setForm({
        storeName: store.name,
        storeUrl: store.domain,
        timezone: store.timezone,
        currency: store.currency,
        platform: store.platform,
      })
      if (store.apiSecret && store.apiSecret.endsWith('.myshopify.com')) {
        setShopifyShop(store.apiSecret)
      }
    }
  }, [store])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('shopify_connected') === 'true') {
      setConnectMessage('Shopify store connected successfully!')
      window.history.replaceState({}, '', window.location.pathname)
      window.location.reload()
    }
    if (params.get('shopify_error')) {
      setShopifyError(decodeURIComponent(params.get('shopify_error')!))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const response = await fetch('/api/stores/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.storeName,
          domain: form.storeUrl,
          timezone: form.timezone,
          currency: form.currency,
          platform: form.platform,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      const data = await response.json()
      onSave(data.store)
      setMessage('Settings saved successfully')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleConnectShopify = async () => {
    if (!shopifyShop.trim()) {
      setShopifyError('Please enter your Shopify store domain')
      return
    }

    try {
      setConnecting(true)
      setShopifyError(null)
      setConnectMessage(null)

      const storeId = store?.id
      if (!storeId) {
        throw new Error('Store not found')
      }

      const res = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: shopifyShop, storeId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate connection')
      }

      window.location.href = data.authUrl
    } catch (error) {
      setShopifyError(error instanceof Error ? error.message : 'Connection failed')
      setConnecting(false)
    }
  }

  const isConnected = !!(store?.apiKey && store?.apiSecret)

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">General Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Store Name</label>
            <input
              type="text"
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-1">Store URL / Domain</label>
            <input
              type="text"
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              value={form.storeUrl}
              onChange={(e) => setForm({ ...form, storeUrl: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Platform</label>
            <select
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
            >
              <option value="shopify">Shopify</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="magento">Magento</option>
              <option value="bigcommerce">BigCommerce</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Timezone</label>
            <select
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Paris (CET)</option>
              <option value="Asia/Kolkata">India (IST)</option>
              <option value="Asia/Singapore">Singapore (SGT)</option>
            </select>
          </div>
          <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all mt-4">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {message && <p className="text-sm text-blue-300/80">{message}</p>}
        </div>
      </div>

      {/* Shopify Connection */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">Shopify Connection</h2>
        {isConnected ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-4 bg-emerald-600/20 border border-emerald-500/40 rounded-lg">
              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
              <div>
                <p className="font-medium text-emerald-300">Connected to Shopify</p>
                <p className="text-sm text-blue-300/60">{store?.apiSecret || shopifyShop}</p>
              </div>
            </div>
            <p className="text-sm text-blue-300/80">Your store is connected and webhooks are active. Abandoned carts will be automatically tracked.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-blue-300/80">Connect your Shopify store to start tracking abandoned carts automatically.</p>
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Shopify Store Domain</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="mystore.myshopify.com"
                  value={shopifyShop}
                  onChange={(e) => setShopifyShop(e.target.value)}
                  className="flex-1 px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white placeholder-blue-300/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
                <button
                  onClick={handleConnectShopify}
                  disabled={connecting}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all whitespace-nowrap"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}
        {shopifyError && <p className="mt-4 text-sm text-red-300/80">{shopifyError}</p>}
        {connectMessage && <p className="mt-4 text-sm text-emerald-300/80">{connectMessage}</p>}
      </div>
    </div>
  )
}

function NotificationSettings() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    recoveryAlerts: true,
    dailyReports: true,
    weeklyDigest: false,
    milestoneAlerts: true,
  })

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white mb-6">Notification Preferences</h2>
      <div className="space-y-4">
        <ToggleSetting label="Email Notifications" description="Receive notifications via email" checked={settings.emailNotifications} onChange={(v) => setSettings({ ...settings, emailNotifications: v })} />
        <ToggleSetting label="Recovery Alerts" description="Get notified when a cart is recovered" checked={settings.recoveryAlerts} onChange={(v) => setSettings({ ...settings, recoveryAlerts: v })} />
        <ToggleSetting label="Daily Reports" description="Receive daily recovery summary" checked={settings.dailyReports} onChange={(v) => setSettings({ ...settings, dailyReports: v })} />
        <ToggleSetting label="Weekly Digest" description="Weekly performance summary" checked={settings.weeklyDigest} onChange={(v) => setSettings({ ...settings, weeklyDigest: v })} />
        <ToggleSetting label="Milestone Alerts" description="Celebrate recovery milestones (₹1k, ₹10k, etc.)" checked={settings.milestoneAlerts} onChange={(v) => setSettings({ ...settings, milestoneAlerts: v })} />
      </div>
    </div>
  )
}

function BillingSettings() {
  const [subscription, setSubscription] = useState<any>(null)
  const [plans, setPlans] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [creditAmount, setCreditAmount] = useState(1000)
  const [razorpayLoaded, setRazorpayLoaded] = useState(false)

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const res = await fetch('/api/subscription')
        const data = await res.json()
        if (res.ok) {
          setSubscription(data.subscription)
          setPlans(data.plans)
        }
      } catch (err) {
        console.error('Failed to fetch subscription', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSubscription()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).Razorpay) {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.onload = () => setRazorpayLoaded(true)
      document.body.appendChild(script)
    } else {
      setRazorpayLoaded(true)
    }
  }, [])

  if (loading) {
    return <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm text-sm text-blue-300/80">Loading billing info...</div>
  }

  const plan = subscription?.plan || 'free'
  const planName = plans?.[plan?.toUpperCase() === 'PRO' ? 'PRO' : plan?.toUpperCase() === 'FREE' ? 'FREE' : 'PAY_AS_YOU_GO']?.name || 'Free Forever'
  const smsCredits = subscription?.smsCredits ?? 100
  const smsUsed = subscription?.smsCreditsUsed ?? 0
  const smsRemaining = smsCredits - smsUsed
  const smsRate = 0.02
  const whatsappRate = 0.005

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Current Plan */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Billing &amp; Subscription</h2>
            <p className="text-sm text-blue-300/80 mt-1">Manage your plan and credits</p>
          </div>
          <span className="px-3 py-1 bg-emerald-600/40 text-emerald-300 rounded-full text-sm font-medium border border-emerald-500/40">
            {subscription?.status === 'active' ? 'Active' : 'Free'}
          </span>
        </div>

        <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white">{planName}</h3>
              <p className="text-sm text-blue-300/80">Current plan</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-blue-300/80">SMS Credits Remaining</p>
              <p className="text-2xl font-bold text-cyan-300">{smsRemaining.toLocaleString()}</p>
              <div className="w-full bg-slate-600/50 rounded-full h-2 mt-2">
                <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full h-2 transition-all" style={{ width: `${Math.min((smsUsed / Math.max(smsCredits, 1)) * 100, 100)}%` }} />
              </div>
            </div>
            <div>
              <p className="text-sm text-blue-300/80">Rate per SMS</p>
              <p className="text-2xl font-bold text-cyan-300">₹{smsRate.toFixed(3)}</p>
              <p className="text-xs text-blue-300/60 mt-1">WhatsApp: ₹{whatsappRate.toFixed(3)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Buy Credits */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="font-semibold text-white mb-4">Buy Credits</h3>
        <div className="flex items-center space-x-4 mb-4">
          {[500, 1000, 2500, 5000].map((amount) => (
            <button
              key={amount}
              onClick={() => setCreditAmount(amount)}
              className={`px-4 py-2 rounded-lg border font-medium transition-all ${creditAmount === amount ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300' : 'bg-slate-700/40 border-blue-700/50 text-blue-300 hover:border-blue-600'}`}
            >
              ₹{amount}
            </button>
          ))}
        </div>
        <p className="text-sm text-blue-300/60 mb-4">{creditAmount} credits = ~{(creditAmount / smsRate).toLocaleString()} SMS messages or ~{(creditAmount / whatsappRate).toLocaleString()} WhatsApp messages</p>
        {razorpayLoaded ? (
          <RazorpayCheckout
            plan="payg"
            amount={creditAmount}
            onSuccess={(paymentId) => {
              alert(`Payment successful! ID: ${paymentId}`)
              window.location.reload()
            }}
            onFailure={(err) => {
              console.error('Payment failed', err)
              alert('Payment failed. Please try again.')
            }}
          />
        ) : (
          <button disabled className="px-6 py-3 bg-slate-600 text-white rounded-lg cursor-not-allowed">Loading payment...</button>
        )}
      </div>

      {/* Available Plans */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h3 className="font-semibold text-white mb-6">Available Plans</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-6">
            <h4 className="font-semibold text-cyan-300 mb-2">Pay As You Go</h4>
            <p className="text-3xl font-bold text-white mb-4">₹0<span className="text-base font-normal text-blue-300/60">/mo</span></p>
            <ul className="space-y-2 text-sm text-blue-300/80 mb-6">
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> All channels (SMS, WhatsApp, Email)</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> No monthly minimum</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> AI optimization</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> Pay only for what you use</li>
            </ul>
            <span className="text-xs text-blue-300/60">Currently active</span>
          </div>
          <div className="bg-gradient-to-b from-slate-700/60 to-slate-800/60 border border-amber-500/40 rounded-lg p-6 relative">
            <span className="absolute -top-3 right-4 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full">Popular</span>
            <h4 className="font-semibold text-amber-300 mb-2">Pro</h4>
            <p className="text-3xl font-bold text-white mb-4">₹99<span className="text-base font-normal text-blue-300/60">/mo</span></p>
            <ul className="space-y-2 text-sm text-blue-300/80 mb-6">
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> 5,000 SMS credits included</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> 1,000 WhatsApp credits included</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> Unlimited email</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> Priority support</li>
              <li className="flex items-center"><span className="text-emerald-400 mr-2">✓</span> White-label reports</li>
            </ul>
            <button className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:shadow-lg hover:shadow-amber-500/50 transition-all">Upgrade to Pro</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white mb-6">Security Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-2">Current Password</label>
          <input type="password" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-2">New Password</label>
          <input type="password" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-2">Confirm New Password</label>
          <input type="password" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" />
        </div>
        <button className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all mt-4">Update Password</button>
        <div className="border-t border-blue-700/30 pt-6 mt-6">
          <h3 className="font-medium text-white mb-4">Two-Factor Authentication</h3>
          <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg">
            <div>
              <p className="font-medium text-white">Authenticator App</p>
              <p className="text-sm text-blue-300/60">Add an extra layer of security</p>
            </div>
            <button className="px-4 py-2 border border-blue-700/50 text-blue-300 hover:bg-slate-700/40 rounded-lg text-sm transition-all">Enable</button>
          </div>
        </div>
        <div className="border-t border-blue-700/30 pt-6 mt-6">
          <h3 className="font-medium text-white mb-4">Danger Zone</h3>
          <button className="px-4 py-2 text-red-400 border border-red-600/40 rounded-lg hover:bg-red-600/20 transition-colors">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}

function APISettings({ store }: { store: StoreSettings | null }) {
  const apiKey = store?.apiKey || 'rf_live_xxxxxxxxxxxxxxxxxxxx'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white mb-6">API Keys</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-1">Live API Key</label>
          <div className="flex space-x-2">
            <input type="password" value={apiKey} readOnly className="flex-1 px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg font-mono text-sm focus:outline-none" />
            <button onClick={handleCopy} className="px-4 py-2 rounded-lg border border-blue-700/50 text-blue-300 hover:bg-slate-700/40 transition-all whitespace-nowrap">{copied ? 'Copied!' : 'Copy'}</button>
          </div>
        </div>
        <div className="bg-slate-700/40 border border-cyan-500/30 rounded-lg p-4">
          <h3 className="font-medium text-cyan-300 mb-2">API Documentation</h3>
          <p className="text-sm text-blue-300/80 mb-4">
            Learn how to use our API to integrate CartGain with your custom systems.
          </p>
          <a href="#" className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">
            View Documentation →
          </a>
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-blue-300/60">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-cyan-500' : 'bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
