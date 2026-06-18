'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'

type Campaign = {
  id: string
  name: string
  channels: string[]
  isActive: boolean
  aiOptimized: boolean
  sendDelay: number
  followUpDelay: number
  maxFollowUps: number
  discountEnabled: boolean
  discountType: string | null
  discountValue: number | null
  discountCode: string | null
  createdAt: string
}

export default function EditCampaignPage() {
  const router = useRouter()
  const params = useParams()
  const { storeId, loading: resolvingStore } = useResolvedStoreId()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    channels: [] as string[],
    aiOptimized: true,
    sendDelay: 15,
    followUpDelay: 180,
    maxFollowUps: 2,
    discountEnabled: false,
    discountType: 'percentage',
    discountValue: 10,
    discountCode: '',
  })

  const campaignId = params.id as string

  useEffect(() => {
    const loadCampaign = async () => {
      if (!storeId || !campaignId) return

      try {
        setLoading(true)
        const response = await fetch(`/api/campaigns/${campaignId}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Campaign not found')
          } else {
            setError('Failed to load campaign')
          }
          return
        }

        const data = await response.json()
        setCampaign(data.campaign)
        setFormData({
          name: data.campaign.name,
          channels: data.campaign.channels,
          aiOptimized: data.campaign.aiOptimized,
          sendDelay: data.campaign.sendDelay,
          followUpDelay: data.campaign.followUpDelay,
          maxFollowUps: data.campaign.maxFollowUps,
          discountEnabled: data.campaign.discountEnabled,
          discountType: data.campaign.discountType || 'percentage',
          discountValue: data.campaign.discountValue || 10,
          discountCode: data.campaign.discountCode || '',
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaign')
      } finally {
        setLoading(false)
      }
    }

    loadCampaign()
  }, [storeId, campaignId])

  const handleChannelToggle = (channel: string) => {
    setFormData((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }))
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Campaign name is required')
      return
    }

    if (formData.channels.length === 0) {
      setError('At least one channel must be selected')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          channels: formData.channels,
          aiOptimized: formData.aiOptimized,
          sendDelay: formData.sendDelay,
          followUpDelay: formData.followUpDelay,
          maxFollowUps: formData.maxFollowUps,
          discountEnabled: formData.discountEnabled,
          discountType: formData.discountEnabled ? formData.discountType : null,
          discountValue: formData.discountEnabled ? formData.discountValue : null,
          discountCode: formData.discountEnabled ? formData.discountCode : null,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update campaign')
      }

      const data = await response.json()
      setCampaign(data.campaign)
      setError(null)

      // Show success message
      setTimeout(() => {
        router.push('/dashboard/campaigns')
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign')
    } finally {
      setSaving(false)
    }
  }

  if (loading || resolvingStore) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-blue-300">Loading campaign...</div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="flex items-center text-blue-300 hover:text-blue-200"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-300">{error || 'Campaign not found'}</p>
        </div>
      </div>
    )
  }

  const channels = ['sms', 'whatsapp', 'email']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center text-blue-300 hover:text-blue-200 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">Edit Campaign</h1>
          <p className="text-blue-300/80 mt-1">Update your campaign settings</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 space-y-6">
        {/* Campaign Name */}
        <div>
          <label className="block text-sm font-medium text-blue-300 mb-2">Campaign Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
            placeholder="e.g., Black Friday Cart Recovery"
          />
        </div>

        {/* Channels */}
        <div>
          <label className="block text-sm font-medium text-blue-300 mb-3">Channels</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {channels.map((channel) => (
              <button
                key={channel}
                onClick={() => handleChannelToggle(channel)}
                className={`p-3 rounded-lg border transition-all capitalize ${
                  formData.channels.includes(channel)
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-700/50 border-blue-700/30 text-blue-300/60 hover:border-blue-700/50'
                }`}
              >
                {channel}
              </button>
            ))}
          </div>
        </div>

        {/* AI Optimization */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-blue-300">AI Optimization</label>
            <p className="text-xs text-blue-300/60 mt-1">Use AI to optimize message timing and content</p>
          </div>
          <button
            onClick={() => setFormData({ ...formData, aiOptimized: !formData.aiOptimized })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              formData.aiOptimized ? 'bg-cyan-500' : 'bg-slate-600'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                formData.aiOptimized ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>

        {/* Send Delay */}
        <div>
          <label className="block text-sm font-medium text-blue-300 mb-2">Initial Send Delay (minutes)</label>
          <input
            type="number"
            value={formData.sendDelay}
            onChange={(e) => setFormData({ ...formData, sendDelay: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500"
            min="0"
            max="1440"
          />
          <p className="text-xs text-blue-300/60 mt-1">How long to wait before sending the first message</p>
        </div>

        {/* Follow-up Delay */}
        <div>
          <label className="block text-sm font-medium text-blue-300 mb-2">Follow-up Delay (minutes)</label>
          <input
            type="number"
            value={formData.followUpDelay}
            onChange={(e) => setFormData({ ...formData, followUpDelay: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500"
            min="0"
            max="10080"
          />
          <p className="text-xs text-blue-300/60 mt-1">Delay between follow-up messages</p>
        </div>

        {/* Max Follow-ups */}
        <div>
          <label className="block text-sm font-medium text-blue-300 mb-2">Max Follow-ups</label>
          <input
            type="number"
            value={formData.maxFollowUps}
            onChange={(e) => setFormData({ ...formData, maxFollowUps: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500"
            min="0"
            max="10"
          />
        </div>

        {/* Discount Settings */}
        <div className="pt-4 border-t border-blue-700/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <label className="block text-sm font-medium text-blue-300">Enable Discount</label>
              <p className="text-xs text-blue-300/60 mt-1">Offer a discount in recovery messages</p>
            </div>
            <button
              onClick={() => setFormData({ ...formData, discountEnabled: !formData.discountEnabled })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                formData.discountEnabled ? 'bg-cyan-500' : 'bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  formData.discountEnabled ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {formData.discountEnabled && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-blue-300 mb-2">Discount Type</label>
                <select
                  value={formData.discountType}
                  onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-300 mb-2">
                  Discount Value ({formData.discountType === 'percentage' ? '%' : '₹'})
                </label>
                <input
                  type="number"
                  value={formData.discountValue || 0}
                  onChange={(e) => setFormData({ ...formData, discountValue: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-300 mb-2">Discount Code</label>
                <input
                  type="text"
                  value={formData.discountCode}
                  onChange={(e) => setFormData({ ...formData, discountCode: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-blue-700/50 rounded-lg text-white placeholder-blue-300/50 focus:outline-none focus:border-blue-500"
                  placeholder="e.g., SAVE10"
                />
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-6 border-t border-blue-700/30">
          <button
            onClick={() => router.back()}
            className="px-6 py-2 border border-blue-700/50 text-blue-300 rounded-lg hover:bg-blue-700/20 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
