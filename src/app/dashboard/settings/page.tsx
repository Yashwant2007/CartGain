'use client'

import { useState } from 'react'
import { Bell, CreditCard, Shield, Globe, User, Key } from 'lucide-react'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')

  const tabs = [
    { id: 'general', name: 'General', icon: User },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'billing', name: 'Billing', icon: CreditCard },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'api', name: 'API Keys', icon: Key },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'notifications' && <NotificationSettings />}
      {activeTab === 'billing' && <BillingSettings />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'api' && <APISettings />}
    </div>
  )
}

function GeneralSettings() {
  const [settings, setSettings] = useState({
    storeName: 'My Awesome Store',
    storeUrl: 'https://mystore.com',
    timezone: 'America/New_York',
    currency: 'USD',
  })

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">General Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
          <input
            type="text"
            className="input"
            value={settings.storeName}
            onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Store URL</label>
          <input
            type="url"
            className="input"
            value={settings.storeUrl}
            onChange={(e) => setSettings({ ...settings, storeUrl: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            className="input"
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <select
            className="input"
            value={settings.currency}
            onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CAD">CAD ($)</option>
            <option value="AUD">AUD ($)</option>
            <option value="INR">INR (₹)</option>
          </select>
        </div>
        <button className="btn-primary mt-4">Save Changes</button>
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
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Notification Preferences</h2>
      <div className="space-y-4">
        <ToggleSetting
          label="Email Notifications"
          description="Receive notifications via email"
          checked={settings.emailNotifications}
          onChange={(v) => setSettings({ ...settings, emailNotifications: v })}
        />
        <ToggleSetting
          label="Recovery Alerts"
          description="Get notified when a cart is recovered"
          checked={settings.recoveryAlerts}
          onChange={(v) => setSettings({ ...settings, recoveryAlerts: v })}
        />
        <ToggleSetting
          label="Daily Reports"
          description="Receive daily recovery summary"
          checked={settings.dailyReports}
          onChange={(v) => setSettings({ ...settings, dailyReports: v })}
        />
        <ToggleSetting
          label="Weekly Digest"
          description="Weekly performance summary"
          checked={settings.weeklyDigest}
          onChange={(v) => setSettings({ ...settings, weeklyDigest: v })}
        />
        <ToggleSetting
          label="Milestone Alerts"
          description="Celebrate recovery milestones ($1k, $10k, etc.)"
          checked={settings.milestoneAlerts}
          onChange={(v) => setSettings({ ...settings, milestoneAlerts: v })}
        />
      </div>
    </div>
  )
}

function BillingSettings() {
  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Billing & Subscription</h2>
      <div className="bg-gradient-to-br from-primary-50 to-accent-50 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">Pay-As-You-Go Plan</h3>
            <p className="text-sm text-gray-600">Your current plan</p>
          </div>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            Active
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">SMS Credits</p>
            <p className="text-2xl font-bold text-gray-900">847</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">This Month's Spend</p>
            <p className="text-2xl font-bold text-gray-900">$47.32</p>
          </div>
        </div>
        <button className="btn-primary w-full">Add Credits</button>
      </div>
      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">Payment Method</h3>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-6 bg-blue-600 rounded"></div>
            <div>
              <p className="font-medium text-gray-900">Visa ending in 4242</p>
              <p className="text-sm text-gray-500">Expires 12/2027</p>
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
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Security Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input type="password" className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input type="password" className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input type="password" className="input" />
        </div>
        <button className="btn-primary mt-4">Update Password</button>

        <div className="border-t border-gray-200 pt-6 mt-6">
          <h3 className="font-medium text-gray-900 mb-4">Two-Factor Authentication</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Authenticator App</p>
              <p className="text-sm text-gray-500">Add an extra layer of security</p>
            </div>
            <button className="btn-secondary text-sm">Enable</button>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6 mt-6">
          <h3 className="font-medium text-gray-900 mb-4">Danger Zone</h3>
          <button className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}

function APISettings() {
  const apiKey = 'rf_live_xxxxxxxxxxxxxxxxxxxx'

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">API Keys</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Live API Key</label>
          <div className="flex space-x-2">
            <input
              type="password"
              value={apiKey}
              readOnly
              className="input flex-1 font-mono text-sm"
            />
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
