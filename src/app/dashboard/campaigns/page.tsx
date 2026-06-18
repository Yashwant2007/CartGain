'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Copy, Edit2, Trash2, Play, Pause, BarChart3, Split, Trophy } from 'lucide-react'
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
  const router = useRouter()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [abTestCampaign, setAbTestCampaign] = useState<Campaign | null>(null)
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Check for auth errors from useResolvedStoreId
  useEffect(() => {
    if (storeError && storeError.includes('Sign in')) {
      router.push('/login')
    }
  }, [storeError, router])

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-blue-300/80 mt-1">Create and manage cart recovery sequences</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center justify-center sm:justify-start bg-gradient-to-r from-cyan-500 to-blue-500 text-white border border-cyan-400/50 hover:shadow-lg hover:shadow-cyan-500/50 px-4 py-2 rounded-lg transition-all w-full sm:w-auto"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Campaign
        </button>
      </div>

      {isLoading && <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading campaigns...</div>}
      {error && <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>}

      {/* Campaigns Grid */}
      <div className="grid gap-6">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} onOpenABTest={() => setAbTestCampaign(campaign)} />
        ))}
        {campaigns.length === 0 && !isLoading && !showCreateModal && (
          <OnboardingWizard onStart={() => setShowCreateModal(true)} />
        )}
      </div>

      {isLoading && <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 text-sm text-blue-300/80">Loading campaigns...</div>}
      {error && <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 text-sm text-red-300/80">{error}</div>}

      {/* A/B Test Modal */}
      {abTestCampaign && (
        <ABTestModal
          campaign={abTestCampaign}
          onClose={() => setAbTestCampaign(null)}
        />
      )}

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

function CampaignCard({ campaign, onOpenABTest }: { campaign: Campaign; onOpenABTest: () => void }) {
  const [isActive, setIsActive] = useState(campaign.isActive)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this campaign?')) {
      try {
        setIsDeleting(true)
        const response = await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'DELETE',
        })
        if (!response.ok) {
          throw new Error('Failed to delete campaign')
        }
        window.location.reload()
      } catch (error) {
        alert('Error deleting campaign: ' + (error instanceof Error ? error.message : 'Unknown error'))
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const handleToggleActive = async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (response.ok) {
        setIsActive(!isActive)
      }
    } catch (error) {
      console.error('Error toggling campaign:', error)
    }
  }

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 hover:border-blue-700/60 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-cyan-300">{campaign.name}</h3>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' : 'bg-slate-600/50 text-slate-300 border border-slate-500/50'}`}>
              {isActive ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="flex items-center space-x-2 mb-4">
            {campaign.channels.map((channel: string) => (
              <ChannelIcon key={channel} channel={channel} />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Total Carts" value="0" />
            <Stat label="Recovered" value="0" />
            <Stat label="Recovery Rate" value="0%" />
            <Stat label="Revenue" value="₹0" />
          </div>
        </div>
        <div className="flex flex-col items-end space-y-2 ml-4">
          <button
            onClick={handleToggleActive}
            className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 border border-yellow-500/50' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/50'}`}
            title={isActive ? 'Pause' : 'Resume'}
          >
            {isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <div className="flex items-center space-x-1">
            <ActionButton icon={<Split className="w-4 h-4" />} label="A/B Test" onClick={onOpenABTest} />
            <ActionButton icon={<BarChart3 className="w-4 h-4" />} label="Analytics" onClick={() => {
              window.location.href = `/dashboard/campaigns/${campaign.id}/analytics`
            }} />
            <ActionButton icon={<Copy className="w-4 h-4" />} label="Duplicate" onClick={async () => {
              try {
                const response = await fetch(`/api/campaigns/${campaign.id}/duplicate`, { method: 'POST' })
                if (response.ok) {
                  alert('Campaign duplicated successfully')
                  window.location.reload()
                } else {
                  alert('Error duplicating campaign')
                }
              } catch (error) {
                alert('Error duplicating campaign')
              }
            }} />
            <ActionButton icon={<Edit2 className="w-4 h-4" />} label="Edit" onClick={() => {
              window.location.href = `/dashboard/campaigns/${campaign.id}/edit`
            }} />
            <ActionButton 
              icon={<Trash2 className="w-4 h-4" />} 
              label="Delete" 
              danger 
              onClick={handleDelete}
              disabled={isDeleting}
            />
          </div>
          <p className="text-xs text-blue-300/60">Created {new Date(campaign.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-blue-300/60">{label}</p>
      <p className="text-lg font-semibold text-cyan-300">{value}</p>
    </div>
  )
}

function ChannelIcon({ channel }: { channel: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    sms: { bg: 'bg-blue-600/20', color: 'text-blue-300', label: 'SMS' },
    whatsapp: { bg: 'bg-emerald-600/20', color: 'text-emerald-300', label: 'WhatsApp' },
    email: { bg: 'bg-purple-600/20', color: 'text-purple-300', label: 'Email' },
  }

  const { bg, color, label } = config[channel] || { bg: 'bg-slate-700/40', color: 'text-blue-300/70', label: channel }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border border-current/20 ${bg} ${color}`}>
      {label}
    </span>
  )
}

function ActionButton({ icon, label, danger = false, onClick, disabled = false }: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors ${danger ? 'text-red-400 hover:bg-red-500/20 hover:border-red-500/50 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed' : 'text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 border border-blue-500/30'}`}
      title={label}
    >
      {icon}
    </button>
  )
}

function OnboardingWizard({ onStart }: { onStart: () => void }) {
  const [step, setStep] = useState(1)
  const [fade, setFade] = useState('opacity-100 translate-y-0')

  const goToStep = (next: number) => {
    setFade('opacity-0 translate-y-4')
    setTimeout(() => {
      setStep(next)
      setFade('opacity-100 translate-y-0')
    }, 150)
  }

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-700/30 rounded-2xl p-8 max-w-2xl mx-auto shadow-2xl">
      <div className={`transition-all duration-200 ease-out ${fade}`}>
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/30">
              <span className="text-4xl">🛒</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to CartGain!</h2>
              <p className="text-blue-300/80 max-w-md mx-auto">
                Recover lost sales with automated cart recovery campaigns. Let&apos;s set up your first one.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
              <div className="bg-slate-700/40 border border-blue-700/30 rounded-xl p-4 text-center hover:border-cyan-500/40 transition-all">
                <div className="text-2xl mb-2">📧</div>
                <h3 className="text-sm font-semibold text-white mb-1">Multi-Channel</h3>
                <p className="text-xs text-blue-300/60">Email, SMS, WhatsApp</p>
              </div>
              <div className="bg-slate-700/40 border border-blue-700/30 rounded-xl p-4 text-center hover:border-cyan-500/40 transition-all">
                <div className="text-2xl mb-2">🤖</div>
                <h3 className="text-sm font-semibold text-white mb-1">AI Optimized</h3>
                <p className="text-xs text-blue-300/60">Smart send time optimization</p>
              </div>
              <div className="bg-slate-700/40 border border-blue-700/30 rounded-xl p-4 text-center hover:border-cyan-500/40 transition-all">
                <div className="text-2xl mb-2">📊</div>
                <h3 className="text-sm font-semibold text-white mb-1">Analytics</h3>
                <p className="text-xs text-blue-300/60">Track revenue recovered</p>
              </div>
            </div>
            <button
              onClick={() => goToStep(2)}
              className="px-8 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
            >
              Get Started
            </button>
            <div>
              <button onClick={onStart} className="text-sm text-blue-300/50 hover:text-blue-300/80 transition-colors">Skip to create campaign</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">How It Works</h2>
              <p className="text-blue-300/80">Cart recovery in 3 simple steps</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-start space-x-4 p-4 bg-slate-700/40 border border-blue-700/30 rounded-xl hover:border-cyan-500/30 transition-all">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-cyan-500/20">1</div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Connect Your Store</h3>
                  <p className="text-sm text-blue-300/60">Link your Shopify store to automatically track abandoned carts.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4 p-4 bg-slate-700/40 border border-blue-700/30 rounded-xl hover:border-cyan-500/30 transition-all">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-cyan-500/20">2</div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Create a Campaign</h3>
                  <p className="text-sm text-blue-300/60">Set up recovery sequences with tailored messages and timing.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4 p-4 bg-slate-700/40 border border-blue-700/30 rounded-xl hover:border-cyan-500/30 transition-all">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-cyan-500/20">3</div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Recover Revenue</h3>
                  <p className="text-sm text-blue-300/60">Your campaign runs automatically and you track results in real-time.</p>
                </div>
              </div>
            </div>
            <button
              onClick={onStart}
              className="w-full px-8 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all"
            >
              Create Your First Campaign
            </button>
            <div className="text-center">
              <button onClick={() => goToStep(1)} className="text-sm text-blue-300/50 hover:text-blue-300/80 transition-colors">Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type ABTest = {
  id: string
  name: string
  variantA: any
  variantB: any
  winner: string | null
  isCompleted: boolean
  createdAt: string
}

function ABTestModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [abTests, setAbTests] = useState<ABTest[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<string | null>(null)
  const [fadeIn, setFadeIn] = useState(false)
  const [form, setForm] = useState({
    name: '',
    subjectA: '',
    subjectB: '',
    discountA: 0,
    discountB: 0,
  })

  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true))
  }, [])

  useEffect(() => {
    const fetchABTests = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}/ab-tests`)
        const data = await res.json()
        if (res.ok) setAbTests(data.abTests || [])
      } catch (err) {
        console.error('Failed to fetch AB tests', err)
      } finally {
        setLoading(false)
      }
    }
    fetchABTests()
  }, [campaign.id])

  const handleCreate = async () => {
    setFormErrors(null)
    if (!form.name.trim()) { setFormErrors('Test name is required'); return }
    if (!form.subjectA.trim() || !form.subjectB.trim()) { setFormErrors('Both subject lines are required'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/ab-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          variantA: { subject: form.subjectA, discountPercent: form.discountA },
          variantB: { subject: form.subjectB, discountPercent: form.discountB },
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAbTests((prev) => [data.abTest, ...prev])
        setShowCreate(false)
        setForm({ name: '', subjectA: '', subjectB: '', discountA: 0, discountB: 0 })
      } else {
        const err = await res.json()
        setFormErrors(err.error || 'Failed to create test')
      }
    } catch (err) {
      setFormErrors('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${fadeIn ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}>
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-700/30 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-blue-700/30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">A/B Tests</h2>
              <p className="text-sm text-blue-300/80 mt-1">{campaign.name}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-300/60 hover:text-white hover:bg-slate-700/50 transition-all text-xl">&times;</button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="bg-slate-700/40 border border-blue-700/30 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-600/50 rounded w-1/3 mb-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-16 bg-slate-600/50 rounded-lg" />
                    <div className="h-16 bg-slate-600/50 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : abTests.length === 0 && !showCreate ? (
            <div className="text-center py-8">
              <Split className="w-12 h-12 text-blue-300/40 mx-auto mb-4" />
              <p className="text-blue-300/80 mb-2">No A/B tests yet</p>
              <p className="text-sm text-blue-300/60 mb-6 max-w-xs mx-auto">Split-test subject lines, discounts, or send timing to find what converts best.</p>
              <button onClick={() => setShowCreate(true)} className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all">
                Create A/B Test
              </button>
            </div>
          ) : showCreate ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Test Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Subject Line Test" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white placeholder-blue-300/40 rounded-lg focus:outline-none focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-700/40 border border-cyan-500/40 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <h3 className="font-semibold text-cyan-300">Variant A</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-blue-200 mb-1.5">Subject Line</label>
                      <input type="text" value={form.subjectA} onChange={(e) => setForm({ ...form, subjectA: e.target.value })} placeholder="e.g. Don't miss out!" className="w-full px-3 py-2 bg-slate-700/50 border border-blue-700/50 text-white placeholder-blue-300/40 rounded-lg text-sm focus:outline-none focus:border-cyan-400/70 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-200 mb-1.5">Discount % <span className="text-blue-300/40 font-normal">(optional)</span></label>
                      <input type="number" min={0} max={100} value={form.discountA} onChange={(e) => setForm({ ...form, discountA: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm focus:outline-none focus:border-cyan-400/70 transition-all" />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-700/40 border border-purple-500/40 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-purple-400" />
                    <h3 className="font-semibold text-purple-300">Variant B</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-blue-200 mb-1.5">Subject Line</label>
                      <input type="text" value={form.subjectB} onChange={(e) => setForm({ ...form, subjectB: e.target.value })} placeholder="e.g. Your cart is waiting" className="w-full px-3 py-2 bg-slate-700/50 border border-blue-700/50 text-white placeholder-blue-300/40 rounded-lg text-sm focus:outline-none focus:border-cyan-400/70 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-200 mb-1.5">Discount % <span className="text-blue-300/40 font-normal">(optional)</span></label>
                      <input type="number" min={0} max={100} value={form.discountB} onChange={(e) => setForm({ ...form, discountB: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg text-sm focus:outline-none focus:border-cyan-400/70 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
              {formErrors && <p className="text-sm text-red-300/80 bg-red-600/10 border border-red-500/30 rounded-lg px-4 py-2">{formErrors}</p>}
              <div className="flex space-x-3">
                <button onClick={() => { setShowCreate(false); setFormErrors(null) }} className="flex-1 px-4 py-2 rounded-lg border border-blue-700/50 text-blue-300 hover:bg-slate-700/40 transition-all">Cancel</button>
                <button onClick={handleCreate} disabled={submitting} className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                  {submitting ? 'Creating...' : 'Create Test'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button onClick={() => setShowCreate(true)} className="w-full px-4 py-2.5 rounded-lg border-2 border-dashed border-blue-700/40 text-blue-300 hover:bg-slate-700/40 hover:border-cyan-500/40 transition-all text-sm font-medium flex items-center justify-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>New A/B Test</span>
              </button>
              {abTests.map((test) => (
                <div key={test.id} className="bg-slate-700/40 border border-blue-700/30 rounded-xl p-4 hover:border-blue-700/50 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white">{test.name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${test.isCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                      {test.isCompleted ? `Winner: ${test.winner}` : 'Running'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className={`p-3 rounded-lg border ${test.winner === 'A' ? 'border-cyan-400/60 bg-cyan-600/20 ring-1 ring-cyan-400/30' : 'border-blue-700/30 bg-slate-700/30'}`}>
                      <p className="text-cyan-300 font-medium mb-1">Variant A</p>
                      <p className="text-blue-300/80 truncate">{test.variantA?.subject || 'N/A'}</p>
                      {test.variantA?.discountPercent ? <p className="text-blue-300/60 text-xs mt-1">{test.variantA.discountPercent}% discount</p> : <p className="text-blue-300/40 text-xs mt-1">No discount</p>}
                    </div>
                    <div className={`p-3 rounded-lg border ${test.winner === 'B' ? 'border-purple-400/60 bg-purple-600/20 ring-1 ring-purple-400/30' : 'border-blue-700/30 bg-slate-700/30'}`}>
                      <p className="text-purple-300 font-medium mb-1">Variant B</p>
                      <p className="text-blue-300/80 truncate">{test.variantB?.subject || 'N/A'}</p>
                      {test.variantB?.discountPercent ? <p className="text-blue-300/60 text-xs mt-1">{test.variantB.discountPercent}% discount</p> : <p className="text-blue-300/40 text-xs mt-1">No discount</p>}
                    </div>
                  </div>
                  {test.isCompleted && (
                    <div className="mt-3 pt-3 border-t border-blue-700/20 flex items-center justify-center space-x-1 text-xs">
                      <Trophy className="w-3 h-3 text-amber-400" />
                      <span className="text-amber-300/80 font-medium">Winner: Variant {test.winner}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
                {['sms', 'whatsapp', 'email'].map((channel) => (
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
                      <option value="fixed">Fixed Amount (₹)</option>
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
                      {config.discountType === 'percentage' ? config.discountValue + '%' : '₹' + config.discountValue}
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
