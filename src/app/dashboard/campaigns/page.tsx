'use client'

import { useEffect, useState } from 'react'
import { Plus, Copy, Edit2, Trash2, Play, Pause, BarChart3 } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type Campaign = {
  id: string
  name: string
  channels: string[]
  isActive: boolean
  createdAt: string
}

type CreateCampaignConfig = {
  name: string
  channels: string[]
  aiOptimized: boolean
  sendDelay: number
  followUps: number
  discountEnabled: boolean
  discountType: string
  discountValue: number
}

export default function CampaignsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadCampaigns = async () => {
      if (!storeId) {
        return
      }

      try {
        setLoadingData(true)
        setLoadError(null)

        const response = await fetch(`/api/campaigns?storeId=${storeId}`)
        if (!response.ok) {
          throw new Error('Failed to load campaigns')
        }

        const data = await response.json()
        if (!cancelled) {
          setCampaigns(data.campaigns || [])
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load campaigns')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
        }
      }
    }

    loadCampaigns()

    return () => {
      cancelled = true
    }
  }, [storeId])

  const handleCreateCampaign = async (config: CreateCampaignConfig) => {
    if (!storeId) {
      setLoadError('Store ID is not available yet')
      return
    }

    if (!config.name.trim()) {
      setLoadError('Campaign name is required')
      return
    }

    try {
      setLoadError(null)

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeId,
          name: config.name,
          channels: config.channels,
          aiOptimized: config.aiOptimized,
          sendDelay: config.sendDelay,
          maxFollowUps: config.followUps,
          discountEnabled: config.discountEnabled,
          discountType: config.discountEnabled ? config.discountType : null,
          discountValue: config.discountEnabled ? config.discountValue : null,
          isActive: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create campaign')
      }

      const data = await response.json()
      setCampaigns((current) => [data.campaign, ...current])
      setShowCreateModal(false)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to create campaign')
    }
  }

  const isLoading = resolvingStore || loadingData
  const error = storeError || loadError

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-blue-300/80 mt-1">Create and manage cart recovery sequences</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center bg-gradient-to-r from-cyan-500 to-blue-500 text-white border border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/50"
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
        {campaigns.length === 0 && !isLoading && (
          <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/60">No campaigns yet. Create one to get started.</div>
        )}
      </div>

      {isLoading && <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading campaigns...</div>}
      {error && <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateCampaign}
        />
      )}
    </div>
  )
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [isActive, setIsActive] = useState(campaign.isActive)

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
            <Stat label="Total Carts" value="-" />
            <Stat label="Recovered" value="-" />
            <Stat label="Recovery Rate" value="-" />
            <Stat label="Revenue" value="-" />
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
          <p className="text-xs text-gray-500">Created {new Date(campaign.createdAt).toLocaleDateString()}</p>
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

function CreateCampaignModal({ onClose, onCreate }: { onClose: () => void; onCreate: (config: CreateCampaignConfig) => void }) {
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-700/30 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-blue-700/30">
          <h2 className="text-xl font-bold text-white">Create New Campaign</h2>
          <p className="text-sm text-blue-300/80 mt-1">Set up your cart recovery sequence</p>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 bg-slate-700/40 border-b border-blue-700/30">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all ${
                  step >= s.id ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white' : 'bg-slate-700 text-blue-300/60'
                }`}>
                  {step > s.id ? '✓' : s.id}
                </div>
                <span className={`ml-2 text-sm font-medium transition-colors ${step >= s.id ? 'text-cyan-300' : 'text-blue-300/60'}`}>
                  {s.name}
                </span>
                {i < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-2 transition-colors ${step > s.id ? 'bg-cyan-500' : 'bg-slate-700'}`} />
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
                <label className="block text-sm font-medium text-white mb-2">Campaign Name</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white placeholder-blue-300/40 rounded-lg focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30 transition-all"
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
                  className="w-4 h-4 rounded accent-cyan-400"
                />
                <label htmlFor="ai-optimized" className="ml-2 text-sm text-blue-200">
                  Enable AI optimization for send times
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-blue-300/80 mb-4">Select channels for your recovery sequence</p>
              <div className="grid grid-cols-2 gap-4">
                {['sms', 'whatsapp', 'email', 'push'].map((channel) => (
                  <label
                    key={channel}
                    className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                      config.channels.includes(channel)
                        ? 'border-cyan-400/60 bg-cyan-600/20 hover:bg-cyan-600/30'
                        : 'border-blue-700/40 bg-slate-700/20 hover:bg-slate-700/40'
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
                      className="w-4 h-4 rounded accent-cyan-400"
                    />
                    <span className={`ml-3 capitalize font-medium transition-colors ${
                      config.channels.includes(channel) ? 'text-cyan-300' : 'text-blue-300'
                    }`}>{channel}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  First Message Delay (minutes after abandonment)
                </label>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={config.sendDelay}
                  onChange={(e) => setConfig({ ...config, sendDelay: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
                <div className="text-center text-lg font-semibold text-cyan-400 mt-2">
                  {config.sendDelay} minutes
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Number of Follow-ups
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={config.followUps}
                  onChange={(e) => setConfig({ ...config, followUps: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
                <div className="text-center text-lg font-semibold text-cyan-400 mt-2">
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
                  className="w-4 h-4 rounded accent-cyan-400"
                />
                <label htmlFor="discount-enabled" className="ml-2 text-sm font-medium text-white">
                  Offer discount to recover carts
                </label>
              </div>
              {config.discountEnabled && (
                <div className="grid grid-cols-2 gap-4 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Discount Type</label>
                    <select
                      value={config.discountType}
                      onChange={(e) => setConfig({ ...config, discountType: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30 transition-all"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Value</label>
                    <input
                      type="number"
                      value={config.discountValue}
                      onChange={(e) => setConfig({ ...config, discountValue: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white placeholder-blue-300/40 rounded-lg focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30 transition-all"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-white">Campaign Summary</h3>
              <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-blue-300/80">Name:</span>
                  <span className="font-medium text-white">{config.name || 'Untitled'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300/80">Channels:</span>
                  <span className="font-medium text-cyan-300 capitalize">{config.channels.join(', ') || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300/80">AI Optimized:</span>
                  <span className="font-medium text-white">{config.aiOptimized ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300/80">First Message:</span>
                  <span className="font-medium text-white">{config.sendDelay} min after abandonment</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-300/80">Follow-ups:</span>
                  <span className="font-medium text-white">{config.followUps}</span>
                </div>
                {config.discountEnabled && (
                  <div className="flex justify-between">
                    <span className="text-blue-300/80">Discount:</span>
                    <span className="font-medium text-cyan-300">
                      {config.discountType === 'percentage' ? config.discountValue + '%' : '$' + config.discountValue}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-blue-700/30 flex justify-between">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-blue-700/50 text-blue-300 hover:bg-slate-700/40 transition-all"
          >
            Cancel
          </button>
          <div className="flex space-x-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="px-6 py-2 rounded-lg border border-blue-700/50 text-blue-300 hover:bg-slate-700/40 transition-all">
                Previous
              </button>
            )}
            {step < 5 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                disabled={step === 2 && config.channels.length === 0}
              >
                Next
              </button>
            ) : (
              <button onClick={() => onCreate(config)} className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all">
                Create Campaign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
