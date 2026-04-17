'use client'

import { useState } from 'react'
import { Plus, Copy, Edit2, Trash2, Play, Pause, BarChart3 } from 'lucide-react'

export default function CampaignsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)

  const campaigns = [
    {
      id: 1,
      name: 'Standard Recovery Sequence',
      channels: ['sms', 'email', 'whatsapp'],
      status: 'active',
      carts: 1247,
      recovered: 186,
      rate: 14.9,
      revenue: 24750,
      lastActive: '2 min ago',
    },
    {
      id: 2,
      name: 'High Value Carts ($200+)',
      channels: ['sms', 'whatsapp'],
      status: 'active',
      carts: 156,
      recovered: 42,
      rate: 26.9,
      revenue: 12600,
      lastActive: '5 min ago',
    },
    {
      id: 3,
      name: 'Weekend Flash Sale',
      channels: ['email', 'push'],
      status: 'paused',
      carts: 892,
      recovered: 71,
      rate: 8.0,
      revenue: 8520,
      lastActive: '2 days ago',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-600 mt-1">Create and manage cart recovery sequences</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Campaign
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid gap-6">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <CreateCampaignModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: any }) {
  const [isActive, setIsActive] = useState(campaign.status === 'active')

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
              {isActive ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="flex items-center space-x-2 mb-4">
            {campaign.channels.map((channel: string) => (
              <ChannelIcon key={channel} channel={channel} />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Total Carts" value={campaign.carts.toLocaleString()} />
            <Stat label="Recovered" value={campaign.recovered.toLocaleString()} />
            <Stat label="Recovery Rate" value={`${campaign.rate}%`} />
            <Stat label="Revenue" value={`$${campaign.revenue.toLocaleString()}`} />
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <button
            onClick={() => setIsActive(!isActive)}
            className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
          >
            {isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <div className="flex items-center space-x-1">
            <ActionButton icon={<BarChart3 className="w-4 h-4" />} label="Analytics" />
            <ActionButton icon={<Copy className="w-4 h-4" />} label="Duplicate" />
            <ActionButton icon={<Edit2 className="w-4 h-4" />} label="Edit" />
            <ActionButton icon={<Trash2 className="w-4 h-4" />} label="Delete" danger />
          </div>
          <p className="text-xs text-gray-500">Last active {campaign.lastActive}</p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  )
}

function ChannelIcon({ channel }: { channel: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    sms: { bg: 'bg-blue-100', color: 'text-blue-600', label: 'SMS' },
    whatsapp: { bg: 'bg-green-100', color: 'text-green-600', label: 'WhatsApp' },
    email: { bg: 'bg-purple-100', color: 'text-purple-600', label: 'Email' },
    push: { bg: 'bg-orange-100', color: 'text-orange-600', label: 'Push' },
  }

  const { bg, color, label } = config[channel] || { bg: 'bg-gray-100', color: 'text-gray-600', label: channel }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${bg} ${color}`}>
      {label}
    </span>
  )
}

function ActionButton({ icon, label, danger = false }: { icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button className={`p-1.5 rounded transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-500 hover:bg-gray-100'}`}>
      {icon}
    </button>
  )
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState({
    name: '',
    channels: [] as string[],
    aiOptimized: true,
    sendDelay: 15,
    followUps: 2,
    discountEnabled: false,
    discountType: 'percentage',
    discountValue: 10,
  })

  const steps = [
    { id: 1, name: 'Basics' },
    { id: 2, name: 'Channels' },
    { id: 3, name: 'Timing' },
    { id: 4, name: 'Incentives' },
    { id: 5, name: 'Review' },
  ]

  return (
    <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create New Campaign</h2>
          <p className="text-sm text-gray-600 mt-1">Set up your cart recovery sequence</p>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step >= s.id ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s.id ? '✓' : s.id}
                </div>
                <span className={`ml-2 text-sm font-medium ${step >= s.id ? 'text-gray-900' : 'text-gray-500'}`}>
                  {s.name}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-2 ${step > s.id ? 'bg-primary-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g., Standard Recovery Sequence"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="ai-optimized"
                  checked={config.aiOptimized}
                  onChange={(e) => setConfig({ ...config, aiOptimized: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <label htmlFor="ai-optimized" className="ml-2 text-sm text-gray-700">
                  Enable AI optimization for send times
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">Select channels for your recovery sequence</p>
              <div className="grid grid-cols-2 gap-4">
                {['sms', 'whatsapp', 'email', 'push'].map((channel) => (
                  <label
                    key={channel}
                    className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                      config.channels.includes(channel)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={config.channels.includes(channel)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setConfig({ ...config, channels: [...config.channels, channel] })
                        } else {
                          setConfig({ ...config, channels: config.channels.filter((c) => c !== channel) })
                        }
                      }}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="ml-3 capitalize font-medium text-gray-700">{channel}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Message Delay (minutes after abandonment)
                </label>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={config.sendDelay}
                  onChange={(e) => setConfig({ ...config, sendDelay: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="text-center text-lg font-semibold text-primary-600 mt-2">
                  {config.sendDelay} minutes
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Follow-ups
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={config.followUps}
                  onChange={(e) => setConfig({ ...config, followUps: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="text-center text-lg font-semibold text-primary-600 mt-2">
                  {config.followUps} follow-up messages
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="discount-enabled"
                  checked={config.discountEnabled}
                  onChange={(e) => setConfig({ ...config, discountEnabled: e.target.checked })}
                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                />
                <label htmlFor="discount-enabled" className="ml-2 text-sm font-medium text-gray-700">
                  Offer discount to recover carts
                </label>
              </div>
              {config.discountEnabled && (
                <div className="grid grid-cols-2 gap-4 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                    <select
                      value={config.discountType}
                      onChange={(e) => setConfig({ ...config, discountType: e.target.value })}
                      className="input"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                    <input
                      type="number"
                      value={config.discountValue}
                      onChange={(e) => setConfig({ ...config, discountValue: parseInt(e.target.value) })}
                      className="input"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Campaign Summary</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{config.name || 'Untitled'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Channels:</span>
                  <span className="font-medium capitalize">{config.channels.join(', ') || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">AI Optimized:</span>
                  <span className="font-medium">{config.aiOptimized ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">First Message:</span>
                  <span className="font-medium">{config.sendDelay} min after abandonment</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Follow-ups:</span>
                  <span className="font-medium">{config.followUps}</span>
                </div>
                {config.discountEnabled && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount:</span>
                    <span className="font-medium">
                      {config.discountType === 'percentage' ? config.discountValue + '%' : '$' + config.discountValue}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-between">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <div className="flex space-x-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="btn-secondary">
                Previous
              </button>
            )}
            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="btn-primary"
                disabled={step === 2 && config.channels.length === 0}
              >
                Next
              </button>
            ) : (
              <button onClick={onClose} className="btn-primary">
                Create Campaign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
