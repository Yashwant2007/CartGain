'use client'

import { useEffect, useState } from 'react'
import { Bell, CreditCard, Shield, User, Key } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

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

  useEffect(() => {
    if (store) {
      setForm({
        storeName: store.name,
        storeUrl: store.domain,
        timezone: store.timezone,
        currency: store.currency,
        platform: store.platform,
      })
    }
  }, [store])

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

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm">
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
            className="input"
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
        <div>
          <label className="block text-sm font-medium text-blue-200 mb-2">Currency</label>
          <select
            className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CAD">CAD ($)</option>
            <option value="AUD">AUD ($)</option>
            <option value="INR">INR (₹)</option>
          </select>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all mt-4">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {message && <p className="text-sm text-blue-300/80">{message}</p>}
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
        <ToggleSetting label="Milestone Alerts" description="Celebrate recovery milestones ($1k, $10k, etc.)" checked={settings.milestoneAlerts} onChange={(v) => setSettings({ ...settings, milestoneAlerts: v })} />
      </div>
    </div>
  )
}

function BillingSettings() {
  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white mb-6">Billing & Subscription</h2>
      <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white">Pay-As-You-Go Plan</h3>
            <p className="text-sm text-blue-300/80">Your current plan</p>
          </div>
          <span className="px-3 py-1 bg-green-600/40 text-green-300 rounded-full text-sm font-medium">
            Active
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-blue-300/80">SMS Credits</p>
            <p className="text-2xl font-bold text-cyan-300">847</p>
          </div>
          <div>
            <p className="text-sm text-blue-300/80">This Month&apos;s Spend</p>
            <p className="text-2xl font-bold text-cyan-300">$47.32</p>
          </div>
        </div>
        <button className="w-full px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all">Add Credits</button>
      </div>
      <div className="space-y-4">
        <h3 className="font-medium text-white">Payment Method</h3>
        <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-6 bg-blue-600 rounded"></div>
            <div>
              <p className="font-medium text-white">Visa ending in 4242</p>
              <p className="text-sm text-blue-300/60">Expires 12/2027</p>
            </div>
          </div>
          <button className="text-sm text-primary-600 hover:text-primary-700">Edit</button>
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

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">API Keys</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Live API Key</label>
          <div className="flex space-x-2">
            <input type="password" value={apiKey} readOnly className="input flex-1 font-mono text-sm" />
            <button className="btn-secondary">Copy</button>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">API Documentation</h3>
          <p className="text-sm text-blue-700 mb-4">
            Learn how to use our API to integrate RecoverFlow with your custom systems.
          </p>
          <a href="#" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
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
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-primary-600' : 'bg-gray-200'
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
