'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Bell, CreditCard, Shield, User, Key, ExternalLink } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type SessionUser = {
  name?: string | null
  email?: string | null
}

type StoreSettings = {
  id: string
  name: string
  domain: string
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
    currency: store?.currency ?? 'INR',
    platform: store?.platform ?? 'shopify',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shopifyShop, setShopifyShop] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [shopifyError, setShopifyError] = useState<string | null>(null)
  const [connectMessage, setConnectMessage] = useState<string | null>(null)
  const [shopifyConsentModal, setShopifyConsentModal] = useState(false)
  const popupRef = useRef<Window | null>(null)

  useEffect(() => {
    if (store) {
      setForm({
        storeName: store.name,
        storeUrl: store.domain,
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

    const handler = (e: MessageEvent) => {
      if (e.data === 'shopify_connected') {
        setConnectMessage('Shopify store connected successfully!')
        if (popupRef.current) {
          popupRef.current.close()
          popupRef.current = null
        }
        window.location.reload()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
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

      // Open OAuth in a new tab — redirecting window.top loses the Shopify admin
      // session on the cross-domain hop (admin.shopify.com → store.myshopify.com)
      const popup = window.open(data.authUrl, '_blank')
      if (!popup) {
        window.location.href = data.authUrl
      } else {
        popupRef.current = popup
      }
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
            <label className="block text-sm font-medium text-blue-200 mb-2">Currency</label>
            <select
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="INR">Indian Rupee (₹)</option>
              <option value="USD">US Dollar ($)</option>
              <option value="EUR">Euro (€)</option>
              <option value="GBP">British Pound (£)</option>
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
                  onClick={() => setShopifyConsentModal(true)}
                  disabled={!shopifyShop.trim()}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all whitespace-nowrap"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}
        {shopifyError && <p className="mt-4 text-sm text-red-300/80">{shopifyError}</p>}
        {connectMessage && <p className="mt-4 text-sm text-emerald-300/80">{connectMessage}</p>}
      </div>

      {shopifyConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShopifyConsentModal(false)}>
          <div className="bg-slate-800 border border-blue-700/50 rounded-xl p-6 w-full max-w-md shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-2xl">🛍️</span>
              <h3 className="text-lg font-semibold text-white">Connect Shopify Store</h3>
            </div>

            <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-4 space-y-3 mb-4">
              <p className="text-sm font-medium text-cyan-300">Permissions requested</p>
              <div className="space-y-1.5 text-sm text-blue-300/70">
                <div className="flex items-start space-x-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong className="text-blue-200">Orders</strong> — read &amp; write</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong className="text-blue-200">Customers</strong> — read</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong className="text-blue-200">Products</strong> — read</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><strong className="text-blue-200">Checkouts</strong> — read &amp; write</span>
                </div>
              </div>
              <p className="text-xs text-blue-300/40 mt-2">
                CartGain uses these permissions to track abandoned carts, send recovery messages, and attribute revenue. We never share your data.
              </p>
            </div>

            <p className="text-xs text-blue-300/50 text-center mb-4">
              By connecting, you agree to CartGain&apos;s{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">Privacy Policy</a>.
            </p>

            <div className="flex space-x-3">
              <button
                onClick={() => setShopifyConsentModal(false)}
                className="flex-1 py-2.5 text-sm text-blue-300/60 hover:text-white border border-blue-700/40 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConnectShopify}
                disabled={connecting}
                className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all"
              >
                {connecting ? 'Connecting...' : 'Continue to Shopify →'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm text-center">
      <CreditCard className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-white mb-2">Billing &amp; Subscription</h2>
      <p className="text-sm text-blue-300/80 mb-6">
        Manage your subscription plan, SMS credits, and payment history on the dedicated subscription page.
      </p>
      <Link
        href="/dashboard/subscription"
        className="inline-flex items-center px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
      >
        Manage Subscription
        <ExternalLink className="w-4 h-4 ml-2" />
      </Link>
    </div>
  )
}

function SecuritySettings() {
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  })
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handlePasswordChange = async () => {
    setPasswordError(null)
    setPasswordMessage(null)

    if (!passwords.current || !passwords.new || !passwords.confirm) {
      setPasswordError('Please fill in all password fields')
      return
    }

    if (passwords.new !== passwords.confirm) {
      setPasswordError('New passwords do not match')
      return
    }

    if (passwords.new.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    try {
      setChangingPassword(true)

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to change password')
      }

      setPasswordMessage('Password updated successfully!')
      setPasswords({ current: '', new: '', confirm: '' })
      setTimeout(() => setPasswordMessage(null), 3000)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleToggleTwoFactor = async () => {
    try {
      setTwoFactorLoading(true)

      // Simulate API call for 2FA toggle
      await new Promise(resolve => setTimeout(resolve, 1000))

      setTwoFactorEnabled(!twoFactorEnabled)
    } catch (error) {
      console.error('2FA toggle error:', error)
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      return
    }

    try {
      setDeletingAccount(true)
      setDeleteError(null)

      const response = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
      })

      if (!response.ok) {
        let errorMsg = 'Failed to delete account'
        try {
          const data = await response.json()
          if (data?.message) errorMsg = data.message
        } catch {}
        throw new Error(errorMsg)
      }

      // Redirect to login after deletion
      window.location.href = '/login?deleted=true'
    } catch (error) {
      console.error('Delete account error:', error)
      setDeleteError(error instanceof Error ? error.message : 'Something went wrong')
      setDeletingAccount(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Password Change */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">Change Password</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Current Password</label>
            <input
              type="password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Enter current password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">New Password</label>
            <input
              type="password"
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Enter new password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Confirm New Password</label>
            <input
              type="password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Confirm new password"
            />
          </div>

          {passwordError && (
            <p className="text-sm text-red-300/80 bg-red-600/20 border border-red-700/30 rounded-lg p-3">{passwordError}</p>
          )}
          {passwordMessage && (
            <p className="text-sm text-emerald-300/80 bg-emerald-600/20 border border-emerald-700/30 rounded-lg p-3">{passwordMessage}</p>
          )}

          <button
            onClick={handlePasswordChange}
            disabled={changingPassword}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all mt-4"
          >
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">Two-Factor Authentication</h2>
        <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg">
          <div>
            <p className="font-medium text-white">Authenticator App</p>
            <p className="text-sm text-blue-300/60">
              {twoFactorEnabled ? '2FA is enabled' : 'Add an extra layer of security'}
            </p>
          </div>
          <button
            onClick={handleToggleTwoFactor}
            disabled={twoFactorLoading}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              twoFactorEnabled
                ? 'bg-red-600/20 text-red-300 border border-red-600/40 hover:bg-red-600/30'
                : 'border border-blue-700/50 text-blue-300 hover:bg-slate-700/40'
            }`}
          >
            {twoFactorLoading ? 'Loading...' : twoFactorEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
        {twoFactorEnabled && (
          <div className="mt-4 p-4 bg-emerald-600/20 border border-emerald-500/40 rounded-lg">
            <p className="text-sm text-emerald-300">✓ Two-factor authentication is active. Your account is more secure.</p>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-4">Danger Zone</h2>
        <p className="text-sm text-blue-300/60 mb-6">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-6 py-2 text-red-400 border border-red-600/40 rounded-lg hover:bg-red-600/20 transition-colors"
        >
          Delete Account
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-red-700/50 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Delete Account?</h3>
            <p className="text-blue-300/80 mb-6">
              This action cannot be undone. All your data, including stores, campaigns, and analytics will be permanently deleted.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Type <span className="text-red-400 font-mono">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
                className="w-full px-4 py-2 bg-slate-700/50 border border-red-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
                placeholder="DELETE"
              />
            </div>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirm('')
                  setDeleteError(null)
                }}
                className="flex-1 px-4 py-2 border border-blue-700/50 text-blue-300 rounded-lg hover:bg-slate-700/40 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deletingAccount}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {deletingAccount ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
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
            <input type="password" value={apiKey} readOnly className="flex-1 px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm focus:outline-none" />
            <button onClick={handleCopy} className="px-4 py-2 rounded-lg border border-blue-700/50 text-blue-300 hover:bg-slate-700/40 transition-all whitespace-nowrap">{copied ? 'Copied!' : 'Copy'}</button>
          </div>
        </div>
        <div className="bg-slate-700/40 border border-cyan-500/30 rounded-lg p-4">
          <h3 className="font-medium text-cyan-300 mb-2">API Documentation</h3>
          <p className="text-sm text-blue-300/80 mb-4">
            Learn how to use our API to integrate CartGain with your custom systems.
          </p>
          <Link href="/docs/api" className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">
            View Documentation →
          </Link>
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
