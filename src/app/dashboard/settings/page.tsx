'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { Bell, Brain, CreditCard, Shield, User, Key, ExternalLink, Sparkles } from 'lucide-react'
import { BargainLearningSettings } from './bargain-learning-settings'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'

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
  shopDomain?: string | null
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
          shopifySessionFetch('/api/stores/current'),
          shopifySessionFetch('/api/auth/session'),
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
            { id: 'voice', name: 'Brand voice', icon: Sparkles },
            { id: 'learning', name: 'Bargain learning', icon: Brain },
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
      {activeTab === 'voice' && <BrandVoiceSettings storeId={storeId} />}
      {activeTab === 'learning' && <BargainLearningSettings storeId={storeId} />}
      {activeTab === 'notifications' && <NotificationSettings />}
      {activeTab === 'billing' && <BillingSettings />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'api' && <APISettings store={store} />}
    </div>
  )
}


type BrandVoiceForm = {
  persona: string
  emojiIntensity: string
  humorLevel: string
  messageLength: string
  assertiveness: string
  language: string
  bannedPhrases: string[]
  approvedPhrases: string[]
  signOff: string
  quietHoursStart: number | null
  quietHoursEnd: number | null
}

const VOICE_OPTIONS_GLOBAL = {
  personas: ['friendly', 'premium', 'playful', 'minimal', 'expert'],
  emojiIntensities: ['off', 'subtle', 'balanced', 'playful'],
  humorLevels: ['none', 'light', 'playful'],
  messageLengths: ['short', 'medium', 'long'],
  assertiveness: ['soft', 'balanced', 'direct'],
}

const VOICE_DEFAULTS: BrandVoiceForm = {
  persona: 'friendly',
  emojiIntensity: 'balanced',
  humorLevel: 'light',
  messageLength: 'medium',
  assertiveness: 'balanced',
  language: 'auto',
  bannedPhrases: [],
  approvedPhrases: [],
  signOff: '',
  quietHoursStart: null,
  quietHoursEnd: null,
}

function humanizeOption(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function BrandVoiceSettings({ storeId }: { storeId: string | null }) {
  const [form, setForm] = useState<BrandVoiceForm>(VOICE_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bannedDraft, setBannedDraft] = useState('')
  const [approvedDraft, setApprovedDraft] = useState('')

  useEffect(() => {
    if (!storeId) return
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    shopifySessionFetch(`/api/merchant/config?storeId=${encodeURIComponent(storeId)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load brand voice')
        const data = await res.json()
        setForm({
          persona: data.persona ?? VOICE_DEFAULTS.persona,
          emojiIntensity: data.emojiIntensity ?? VOICE_DEFAULTS.emojiIntensity,
          humorLevel: data.humorLevel ?? VOICE_DEFAULTS.humorLevel,
          messageLength: data.messageLength ?? VOICE_DEFAULTS.messageLength,
          assertiveness: data.assertiveness ?? VOICE_DEFAULTS.assertiveness,
          language: data.language ?? VOICE_DEFAULTS.language,
          bannedPhrases: Array.isArray(data.bannedPhrases) ? data.bannedPhrases : [],
          approvedPhrases: Array.isArray(data.approvedPhrases) ? data.approvedPhrases : [],
          signOff: data.signOff ?? '',
          quietHoursStart: data.quietHoursStart ?? null,
          quietHoursEnd: data.quietHoursEnd ?? null,
        })
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setLoadError(err.message || 'Could not load brand voice')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [storeId])

  async function handleSave() {
    if (!storeId) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await shopifySessionFetch(`/api/merchant/config?storeId=${encodeURIComponent(storeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save brand voice')
      setMessage('Brand voice saved — future messages will follow it.')
    } catch (err: any) {
      setMessage(err?.message || 'Could not save brand voice')
    } finally {
      setSaving(false)
    }
  }

  function addPhrase(kind: 'bannedPhrases' | 'approvedPhrases') {
    const draft = kind === 'bannedPhrases' ? bannedDraft : approvedDraft
    const phrase = draft.trim()
    if (!phrase) return
    setForm((prev) => ({
      ...prev,
      [kind]: Array.from(new Set([...prev[kind], phrase])).slice(0, 25),
    }))
    if (kind === 'bannedPhrases') setBannedDraft('')
    else setApprovedDraft('')
  }

  function removePhrase(kind: 'bannedPhrases' | 'approvedPhrases', phrase: string) {
    setForm((prev) => ({ ...prev, [kind]: prev[kind].filter((p) => p !== phrase) }))
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-cyan-300 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-white">Brand voice</h2>
            <p className="text-sm text-blue-300/80 mt-1">
              How CartGain writes for your store. The same voice is used for recovery emails, WhatsApp
              messages and AI replies. Prices, discounts and consent are always enforced separately.
            </p>
          </div>
        </div>

        {loadError && <p className="mt-4 text-sm text-red-300/80">{loadError}</p>}
        {loading ? (
          <p className="mt-4 text-sm text-blue-300/80">Loading brand voice...</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Personality</label>
              <div className="flex flex-wrap gap-2">
                {VOICE_OPTIONS_GLOBAL.personas.map((persona) => (
                  <button
                    key={persona}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, persona }))}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      form.persona === persona
                        ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200'
                        : 'border-blue-700/40 text-blue-300/70 hover:border-blue-600'
                    }`}
                  >
                    {humanizeOption(persona)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VoiceSelect
                label="Emoji"
                value={form.emojiIntensity}
                options={VOICE_OPTIONS_GLOBAL.emojiIntensities}
                onChange={(value) => setForm((prev) => ({ ...prev, emojiIntensity: value }))}
              />
              <VoiceSelect
                label="Humour"
                value={form.humorLevel}
                options={VOICE_OPTIONS_GLOBAL.humorLevels}
                onChange={(value) => setForm((prev) => ({ ...prev, humorLevel: value }))}
              />
              <VoiceSelect
                label="Message length"
                value={form.messageLength}
                options={VOICE_OPTIONS_GLOBAL.messageLengths}
                onChange={(value) => setForm((prev) => ({ ...prev, messageLength: value }))}
              />
              <VoiceSelect
                label="Tone"
                value={form.assertiveness}
                options={VOICE_OPTIONS_GLOBAL.assertiveness}
                onChange={(value) => setForm((prev) => ({ ...prev, assertiveness: value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Language</label>
              <input
                type="text"
                value={form.language}
                onChange={(event) => setForm((prev) => ({ ...prev, language: event.target.value }))}
                placeholder="auto"
                className="w-full md:w-64 bg-slate-900/60 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-400/40 focus:outline-none focus:border-cyan-400"
              />
              <p className="text-xs text-blue-400/60 mt-1">Use &quot;auto&quot; to follow the customer&apos;s language.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PhraseEditor
                label="Never use these words"
                hint="Hard-blocked by the message validator."
                phrases={form.bannedPhrases}
                draft={bannedDraft}
                setDraft={setBannedDraft}
                onAdd={() => addPhrase('bannedPhrases')}
                onRemove={(phrase) => removePhrase('bannedPhrases', phrase)}
              />
              <PhraseEditor
                label="Prefer these words"
                hint="Used when they fit naturally."
                phrases={form.approvedPhrases}
                draft={approvedDraft}
                setDraft={setApprovedDraft}
                onAdd={() => addPhrase('approvedPhrases')}
                onRemove={(phrase) => removePhrase('approvedPhrases', phrase)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Sign-off (email)</label>
              <input
                type="text"
                value={form.signOff}
                onChange={(event) => setForm((prev) => ({ ...prev, signOff: event.target.value }))}
                placeholder="The team at Your Store"
                className="w-full md:w-96 bg-slate-900/60 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-400/40 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">Quiet hours</label>
              <div className="flex flex-wrap items-center gap-3 text-sm text-blue-300/70">
                <span>Do not send between</span>
                <select
                  value={form.quietHoursStart ?? ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      quietHoursStart: event.target.value === '' ? null : Number(event.target.value),
                    }))
                  }
                  className="bg-slate-900/60 border border-blue-700/40 rounded-lg px-2 py-1.5 text-white"
                >
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
                  ))}
                </select>
                <span>and</span>
                <select
                  value={form.quietHoursEnd ?? ''}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      quietHoursEnd: event.target.value === '' ? null : Number(event.target.value),
                    }))
                  }
                  className="bg-slate-900/60 border border-blue-700/40 rounded-lg px-2 py-1.5 text-white"
                >
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-blue-400/60 mt-1">
                Carts stay queued and are picked up after the window — nothing is lost.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !storeId}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 font-semibold text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save brand voice'}
              </button>
              {message && <p className="text-sm text-blue-300/80">{message}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function VoiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-blue-200 mb-2">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-slate-900/60 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {humanizeOption(option)}
          </option>
        ))}
      </select>
    </div>
  )
}

function PhraseEditor({
  label,
  hint,
  phrases,
  draft,
  setDraft,
  onAdd,
  onRemove,
}: {
  label: string
  hint: string
  phrases: string[]
  draft: string
  setDraft: (value: string) => void
  onAdd: () => void
  onRemove: (phrase: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-blue-200 mb-2">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
          maxLength={80}
          className="flex-1 bg-slate-900/60 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white placeholder-blue-400/40 focus:outline-none focus:border-cyan-400"
          placeholder="Add a word or phrase"
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 rounded-lg border border-blue-700/40 text-sm text-blue-200 hover:border-cyan-400"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-blue-400/60 mt-1">{hint}</p>
      {phrases.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {phrases.map((phrase) => (
            <span
              key={phrase}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-900/40 border border-blue-700/40 text-xs text-blue-200"
            >
              {phrase}
              <button
                type="button"
                onClick={() => onRemove(phrase)}
                className="text-blue-400 hover:text-red-300"
                aria-label={`Remove ${phrase}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
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
      if (store.shopDomain) {
        setShopifyShop(store.shopDomain)
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
      // Only accept the 'shopify_connected' signal from our own origin — the
      // OAuth popup runs on cart-gain.com. Without the origin check any page on
      // the web could trigger a close+reload loop on this tab.
      if (e.origin !== window.location.origin) return
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

  // Close the Shopify consent modal on Escape
  useEffect(() => {
    if (!shopifyConsentModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShopifyConsentModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shopifyConsentModal])

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)

      const response = await shopifySessionFetch('/api/stores/current', {
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

    setConnecting(true)
    setShopifyError(null)
    setConnectMessage(null)

    const popup = window.open('', '_blank')

    try {
      const storeId = store?.id
      if (!storeId) {
        throw new Error('Store not found')
      }

      const res = await shopifySessionFetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: shopifyShop, storeId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate connection')
      }

      if (popup) {
        popup.location.href = data.authUrl
        popupRef.current = popup
      } else {
        window.location.href = data.authUrl
      }
    } catch (error) {
      if (popup) popup.close()
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
                <p className="text-sm text-blue-300/60">{shopifyShop || store?.shopDomain}</p>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shopify-consent-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShopifyConsentModal(false)}
        >
          <div className="bg-slate-800 border border-blue-700/50 rounded-xl p-6 w-full max-w-md shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-2xl">🛍️</span>
              <h3 id="shopify-consent-modal-title" className="text-lg font-semibold text-white">Connect Shopify Store</h3>
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const res = await shopifySessionFetch('/api/settings/notifications', { signal: controller.signal })
        if (!res.ok) throw new Error('Failed to load notification preferences')
        const data = await res.json()
        if (data.prefs) setSettings(data.prefs)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setLoadError('Failed to load notification preferences')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  const handleToggle = async (key: keyof typeof settings, value: boolean) => {
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    setSaving(true); setMessage(null)
    try {
      const res = await shopifySessionFetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      })
      const data = await res.json()
      if (res.ok) { setMessage('Saved'); setTimeout(() => setMessage(null), 2000) }
      else throw new Error()
    } catch { setMessage('Failed to save') } finally { setSaving(false) }
  }

  if (loading) return <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl text-sm text-blue-300/60">Loading preferences...</div>

  return (
    <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 max-w-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
        {message && <span className="text-xs text-emerald-300/80">{message}</span>}
        {saving && <span className="text-xs text-blue-300/60">Saving...</span>}
      </div>
      {loadError && <div className="p-3 bg-red-600/20 border border-red-500/40 rounded-lg text-sm text-red-300 mb-4">{loadError}</div>}
      <div className="space-y-4">
        <ToggleSetting label="Email Notifications" description="Receive notifications via email" checked={settings.emailNotifications} onChange={(v) => handleToggle('emailNotifications', v)} />
        <ToggleSetting label="Recovery Alerts" description="Get notified when a cart is recovered" checked={settings.recoveryAlerts} onChange={(v) => handleToggle('recoveryAlerts', v)} />
        <ToggleSetting label="Daily Reports" description="Receive daily recovery summary" checked={settings.dailyReports} onChange={(v) => handleToggle('dailyReports', v)} />
        <ToggleSetting label="Weekly Digest" description="Weekly performance summary" checked={settings.weeklyDigest} onChange={(v) => handleToggle('weeklyDigest', v)} />
        <ToggleSetting label="Milestone Alerts" description="Celebrate recovery milestones (₹1k, ₹10k, etc.)" checked={settings.milestoneAlerts} onChange={(v) => handleToggle('milestoneAlerts', v)} />
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
        Manage your subscription plan and payment history on the dedicated subscription page.
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
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(false)
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null)
  const [twoFactorMessage, setTwoFactorMessage] = useState<string | null>(null)
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [show2FADisable, setShow2FADisable] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [setupStep, setSetupStep] = useState<'loading' | 'showqr' | 'verify'>('loading')

  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handlePasswordChange = async () => {
    setPasswordError(null); setPasswordMessage(null)
    if (!passwords.current || !passwords.new || !passwords.confirm) { setPasswordError('Please fill in all password fields'); return }
    if (passwords.new !== passwords.confirm) { setPasswordError('New passwords do not match'); return }
    if (passwords.new.length < 8) { setPasswordError('Password must be at least 8 characters'); return }
    try {
      setChangingPassword(true)
      const res = await shopifySessionFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwords.current, newPassword: passwords.new }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to change password')
      setPasswords({ current: '', new: '', confirm: '' })
      // Changing the password revokes every existing session (including this
      // one), so send the user back to sign in with the new credentials.
      if (data.reauthRequired) {
        setPasswordMessage('Password updated. Redirecting to sign in…')
        await new Promise(r => setTimeout(r, 800))
        await signOut({ callbackUrl: '/login?passwordChanged=1' })
        return
      }
      setPasswordMessage('Password updated successfully!')
      setTimeout(() => setPasswordMessage(null), 3000)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password')
    } finally { setChangingPassword(false) }
  }

  const handleStart2FASetup = async () => {
    setTwoFactorError(null); setShow2FASetup(true); setSetupStep('loading')
    try {
      const res = await shopifySessionFetch('/api/auth/2fa/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start setup')
      setQrCodeUrl(data.qrCodeUrl)
      setTotpSecret(data.secret)
      setSetupStep('showqr')
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : 'Failed to start setup')
      setShow2FASetup(false)
    }
  }

  const handleVerify2FA = async () => {
    if (setupCode.length !== 6) { setTwoFactorError('Enter the 6-digit code from your authenticator app'); return }
    setTwoFactorError(null); setTwoFactorLoading(true)
    try {
      const res = await shopifySessionFetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: setupCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')
      setTwoFactorEnabled(true)
      setShow2FASetup(false)
      setSetupCode('')
      setTwoFactorMessage('2FA enabled successfully!')
      setTimeout(() => setTwoFactorMessage(null), 4000)
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : 'Verification failed')
    } finally { setTwoFactorLoading(false) }
  }

  const handleStart2FADisable = () => {
    setShow2FADisable(true); setDisableCode(''); setTwoFactorError(null)
  }

  const handleConfirmDisable2FA = async () => {
    if (disableCode.length !== 6) { setTwoFactorError('Enter your 6-digit code'); return }
    setTwoFactorError(null); setTwoFactorLoading(true)
    try {
      const res = await shopifySessionFetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to disable')
      setTwoFactorEnabled(false)
      setShow2FADisable(false)
      setDisableCode('')
      setTwoFactorMessage('2FA disabled successfully')
      setTimeout(() => setTwoFactorMessage(null), 4000)
    } catch (error) {
      setTwoFactorError(error instanceof Error ? error.message : 'Failed to disable')
    } finally { setTwoFactorLoading(false) }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return
    try {
      setDeletingAccount(true); setDeleteError(null)
      const res = await shopifySessionFetch('/api/auth/delete-account', { method: 'DELETE' })
      if (!res.ok) {
        let msg = 'Failed to delete account'
        try { const d = await res.json(); if (d?.message) msg = d.message } catch {}
        throw new Error(msg)
      }
      window.location.href = '/login?deleted=true'
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Something went wrong')
      setDeletingAccount(false)
    }
  }

  // Close modals on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (show2FASetup && setupStep !== 'loading') {
        setShow2FASetup(false)
        setTwoFactorError(null)
      }
      if (show2FADisable) {
        setShow2FADisable(false)
        setTwoFactorError(null)
      }
      if (showDeleteModal) {
        setShowDeleteModal(false)
        setDeleteConfirm('')
        setDeleteError(null)
      }
    }
    if (!show2FASetup && !show2FADisable && !showDeleteModal) return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show2FASetup, setupStep, show2FADisable, showDeleteModal])

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Password Change */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">Change Password</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Current Password</label>
            <input type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Enter current password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">New Password</label>
            <input type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Enter new password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-200 mb-2">Confirm New Password</label>
            <input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Confirm new password" />
          </div>
          {passwordError && <p className="text-sm text-red-300/80 bg-red-600/20 border border-red-700/30 rounded-lg p-3">{passwordError}</p>}
          {passwordMessage && <p className="text-sm text-emerald-300/80 bg-emerald-600/20 border border-emerald-700/30 rounded-lg p-3">{passwordMessage}</p>}
          <button onClick={handlePasswordChange} disabled={changingPassword} className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all mt-4">
            {changingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-6">Two-Factor Authentication</h2>
        {twoFactorMessage && <p className="mb-4 text-sm text-emerald-300/80 bg-emerald-600/20 border border-emerald-700/30 rounded-lg p-3">{twoFactorMessage}</p>}
        <div className="flex items-center justify-between p-4 bg-slate-700/40 border border-blue-700/30 rounded-lg">
          <div>
            <p className="font-medium text-white">Authenticator App</p>
            <p className="text-sm text-blue-300/60">{twoFactorEnabled ? '2FA is enabled' : 'Add an extra layer of security'}</p>
          </div>
          <button
            onClick={twoFactorEnabled ? handleStart2FADisable : handleStart2FASetup}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              twoFactorEnabled
                ? 'bg-red-600/20 text-red-300 border border-red-600/40 hover:bg-red-600/30'
                : 'border border-blue-700/50 text-blue-300 hover:bg-slate-700/40'
            }`}
          >
            {twoFactorEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
        {twoFactorEnabled && (
          <div className="mt-4 p-4 bg-emerald-600/20 border border-emerald-500/40 rounded-lg">
            <p className="text-sm text-emerald-300">✓ Two-factor authentication is active. Your account is more secure.</p>
          </div>
        )}
      </div>

      {/* 2FA Setup Modal */}
      {show2FASetup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="twofa-setup-modal-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { if (setupStep !== 'loading') { setShow2FASetup(false); setTwoFactorError(null) }}}
        >
          <div className="bg-slate-800 border border-cyan-700/50 rounded-xl p-6 max-w-md w-full shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
            <h3 id="twofa-setup-modal-title" className="text-xl font-bold text-white mb-2">Set Up Two-Factor Auth</h3>
            {setupStep === 'loading' && <p className="text-blue-300/80 py-4">Generating setup key...</p>}
            {setupStep === 'showqr' && (
              <div className="space-y-4">
                <p className="text-sm text-blue-300/80">Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.):</p>
                <div className="flex justify-center">
                  {qrCodeUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrCodeUrl} alt="2FA QR Code" width={200} height={200} className="rounded-lg border border-blue-700/30" />
                  )}
                </div>
                <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-3">
                  <p className="text-xs text-blue-300/60 mb-1">Can&apos;t scan? Enter this key manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-cyan-300 font-mono break-all flex-1 select-all">{totpSecret}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(totpSecret).catch(() => {}) }}
                      className="px-2 py-1 text-xs text-blue-300/60 hover:text-cyan-300 border border-blue-700/30 rounded transition-colors shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="bg-slate-700/40 border border-blue-700/30 rounded-lg p-3">
                  <p className="text-xs text-blue-300/60 mb-1">Then enter the 6-digit verification code from the app:</p>
                  <input type="text" maxLength={6} value={setupCode} onChange={(e) => { setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTwoFactorError(null) }} placeholder="000000" aria-label="2FA verification code" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg font-mono text-lg tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-cyan-400" autoFocus />
                </div>
                {twoFactorError && <p className="text-sm text-red-300/80 bg-red-600/20 border border-red-700/30 rounded-lg p-3">{twoFactorError}</p>}
                <div className="flex space-x-3">
                  <button onClick={() => { setShow2FASetup(false); setSetupCode(''); setTwoFactorError(null) }} className="flex-1 py-2.5 text-sm text-blue-300/60 hover:text-white border border-blue-700/40 rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleVerify2FA} disabled={setupCode.length !== 6 || twoFactorLoading} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all">
                    {twoFactorLoading ? 'Verifying...' : 'Verify & Enable'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2FA Disable Modal */}
      {show2FADisable && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="twofa-disable-modal-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { setShow2FADisable(false); setTwoFactorError(null) }}
        >
          <div className="bg-slate-800 border border-red-700/50 rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 id="twofa-disable-modal-title" className="text-xl font-bold text-white mb-4">Disable Two-Factor Auth</h3>
            <p className="text-sm text-blue-300/80 mb-4">Enter a code from your authenticator app to confirm disabling 2FA:</p>
            <input type="text" maxLength={6} value={disableCode} onChange={(e) => { setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setTwoFactorError(null) }} placeholder="000000" aria-label="2FA code to disable" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg font-mono text-lg tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-red-400 mb-4" />
            {twoFactorError && <p className="mb-4 text-sm text-red-300/80 bg-red-600/20 border border-red-700/30 rounded-lg p-3">{twoFactorError}</p>}
            <div className="flex space-x-3">
              <button onClick={() => { setShow2FADisable(false); setTwoFactorError(null) }} className="flex-1 py-2.5 text-sm text-blue-300/60 hover:text-white border border-blue-700/40 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleConfirmDisable2FA} disabled={disableCode.length !== 6 || twoFactorLoading} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all">
                {twoFactorLoading ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="bg-slate-800/50 border border-red-700/30 rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white mb-4">Danger Zone</h2>
        <p className="text-sm text-blue-300/60 mb-6">Once you delete your account, there is no going back. Please be certain.</p>
        <button onClick={() => setShowDeleteModal(true)} className="px-6 py-2 text-red-400 border border-red-600/40 rounded-lg hover:bg-red-600/20 transition-colors">Delete Account</button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <div className="bg-slate-800 border border-red-700/50 rounded-xl p-6 max-w-md w-full">
            <h3 id="delete-account-modal-title" className="text-xl font-bold text-white mb-4">Delete Account?</h3>
            <p className="text-blue-300/80 mb-6">This action cannot be undone. All your data, including stores, campaigns, and analytics will be permanently deleted.</p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-blue-200 mb-2">Type <span className="text-red-400 font-mono">DELETE</span> to confirm</label>
              <input type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())} className="w-full px-4 py-2 bg-slate-700/50 border border-red-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 font-mono" placeholder="DELETE" />
            </div>
            {deleteError && <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">{deleteError}</div>}
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); setDeleteError(null) }} className="flex-1 px-4 py-2 border border-blue-700/50 text-blue-300 rounded-lg hover:bg-slate-700/40 transition-all">Cancel</button>
              <button onClick={handleDeleteAccount} disabled={deleteConfirm !== 'DELETE' || deletingAccount} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">{deletingAccount ? 'Deleting...' : 'Delete Account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function APISettings({ store }: { store: StoreSettings | null }) {
  const [keys, setKeys] = useState<Array<{ id: string; name: string; prefix: string; permissions: string[]; lastUsedAt: string | null; expiresAt: string | null; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['read'])
  const [newKeyExpiresIn, setNewKeyExpiresIn] = useState<'30d' | '90d' | '365d' | 'never'>('never')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null)

  const abortLoadKeys = useRef<(() => void) | null>(null)

  const loadKeys = async () => {
    const controller = new AbortController()
    abortLoadKeys.current = () => controller.abort()
    try {
      setLoading(true)
      const res = await shopifySessionFetch('/api/keys', { signal: controller.signal })
      if (!res.ok) throw new Error('Failed to load API keys')
      const data = await res.json()
      if (data.keys) setKeys(data.keys)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setLoadError('Failed to load API keys')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
    return () => abortLoadKeys.current?.()
  }, [])

  useEffect(() => {
    if (!showGenerate) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generatedKey) {
        setShowGenerate(false)
        setError(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showGenerate, generatedKey])

  useEffect(() => {
    if (!showRevokeConfirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRevokeConfirm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRevokeConfirm])

  const togglePermission = (perm: string) => {
    setNewKeyPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    )
  }

  const handleGenerate = async () => {
    if (!newKeyName.trim()) { setError('Enter a name for this key'); return }
    if (newKeyPermissions.length === 0) { setError('Select at least one permission'); return }
    setError(null); setGenerating(true)
    try {
      const res = await shopifySessionFetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          permissions: newKeyPermissions,
          expiresIn: newKeyExpiresIn,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate key')
      setGeneratedKey(data.key)
      setNewKeyName('')
      setNewKeyPermissions(['read'])
      setNewKeyExpiresIn('never')
      await loadKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate key')
    } finally { setGenerating(false) }
  }

  const handleRevoke = async (id: string) => {
    try {
      const res = await shopifySessionFetch(`/api/keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke')
      setKeys(keys.filter(k => k.id !== id))
      setShowRevokeConfirm(null)
    } catch {} 
  }

  const isExpired = (expiresAt: string | null) => expiresAt && new Date(expiresAt) < new Date()

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return 'Never'
    const d = new Date(expiresAt)
    if (d < new Date()) return 'Expired'
    return `Expires ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">API Keys</h2>
          <button onClick={() => { setShowGenerate(true); setGeneratedKey(null); setError(null) }} className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all">
            + Generate New Key
          </button>
        </div>

        {loadError && <div className="p-3 bg-red-600/20 border border-red-500/40 rounded-lg text-sm text-red-300 mb-4">{loadError}</div>}

        {loading ? (
          <p className="text-sm text-blue-300/60">Loading keys...</p>
        ) : keys.length === 0 ? (
          <div className="text-center py-8">
            <Key className="w-10 h-10 text-blue-300/30 mx-auto mb-3" />
            <p className="text-sm text-blue-300/60">No API keys yet. Generate one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key.id} className={`p-4 bg-slate-700/40 border rounded-lg ${isExpired(key.expiresAt) ? 'border-amber-600/30 opacity-60' : 'border-blue-700/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-sm">{key.name}</p>
                      {isExpired(key.expiresAt) && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded">Expired</span>
                      )}
                    </div>
                    <p className="text-xs text-blue-300/50 mt-0.5">{key.prefix}</p>
                  </div>
                  <button onClick={() => setShowRevokeConfirm(key.id)} className="px-3 py-1.5 text-xs text-red-400 border border-red-600/40 rounded-lg hover:bg-red-600/20 transition-colors shrink-0">
                    Revoke
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-blue-300/50">
                  <span>Created {new Date(key.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>·</span>
                  <span>{formatExpiry(key.expiresAt)}</span>
                  <span>·</span>
                  <span>{key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}` : 'Never used'}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {key.permissions.map((perm) => (
                    <span key={perm} className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      perm === 'admin' ? 'bg-red-600/20 text-red-300 border border-red-500/30' :
                      perm === 'write' ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30' :
                      'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                    }`}>{perm}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Key Modal */}
      {showGenerate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-key-modal-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { if (!generatedKey) { setShowGenerate(false); setError(null) }}}
        >
          <div className="bg-slate-800 border border-cyan-700/50 rounded-xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            {generatedKey ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Key className="w-6 h-6 text-cyan-400" />
                  <h3 id="generate-key-modal-title" className="text-lg font-semibold text-white">API Key Generated</h3>
                </div>
                <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-4">
                  <p className="text-xs text-amber-400 font-medium mb-2">Copy this key now. You won&apos;t be able to see it again.</p>
                  <div className="bg-slate-950 border border-blue-700/30 rounded p-3">
                    <code className="text-sm text-cyan-300 break-all">{generatedKey}</code>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(generatedKey).catch(() => {}) }}
                    className="mt-3 px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium hover:shadow-lg transition-all w-full"
                  >
                    Copy Key
                  </button>
                </div>
                <button onClick={() => { setShowGenerate(false); setGeneratedKey(null) }} className="w-full py-2.5 text-sm text-blue-300/60 hover:text-white border border-blue-700/40 rounded-lg transition-colors">
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 id="generate-key-modal-title" className="text-lg font-semibold text-white">Generate New API Key</h3>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Key Name</label>
                  <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. Production, Staging" className="w-full px-4 py-2 bg-slate-700/50 border border-blue-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Permissions</label>
                  <div className="flex gap-2">
                    {['read', 'write', 'admin'].map((perm) => (
                      <button
                        key={perm}
                        onClick={() => togglePermission(perm)}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                          newKeyPermissions.includes(perm)
                            ? perm === 'admin' ? 'bg-red-600/30 text-red-300 border-red-500/50' :
                              perm === 'write' ? 'bg-amber-600/30 text-amber-300 border-amber-500/50' :
                              'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                            : 'bg-slate-700/30 text-blue-300/50 border-blue-700/30 hover:bg-slate-700/50'
                        }`}
                      >
                        {perm}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-blue-300/40 mt-1.5">
                    {newKeyPermissions.includes('admin') ? 'Full access to all resources' :
                     newKeyPermissions.includes('write') ? 'Read and modify resources' :
                     'Read-only access to resources'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">Expiration</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['30d', '90d', '365d', 'never'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setNewKeyExpiresIn(opt)}
                        className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${
                          newKeyExpiresIn === opt
                            ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                            : 'bg-slate-700/30 text-blue-300/50 border-blue-700/30 hover:bg-slate-700/50'
                        }`}
                      >
                        {opt === 'never' ? 'Never' : opt.replace('d', ' days')}
                      </button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-sm text-red-300/80 bg-red-600/20 border border-red-700/30 rounded-lg p-3">{error}</p>}
                <div className="flex space-x-3">
                  <button onClick={() => { setShowGenerate(false); setError(null) }} className="flex-1 py-2.5 text-sm text-blue-300/60 hover:text-white border border-blue-700/40 rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleGenerate} disabled={!newKeyName.trim() || generating} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 disabled:opacity-50 transition-all">
                    {generating ? 'Generating...' : 'Generate Key'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirm Modal */}
      {showRevokeConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-key-modal-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowRevokeConfirm(null)}
        >
          <div className="bg-slate-800 border border-red-700/50 rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 id="revoke-key-modal-title" className="text-lg font-semibold text-white mb-2">Revoke API Key?</h3>
            <p className="text-sm text-blue-300/80 mb-6">Any service using this key will immediately lose access. This cannot be undone.</p>
            <div className="flex space-x-3">
              <button onClick={() => setShowRevokeConfirm(null)} className="flex-1 py-2.5 text-sm text-blue-300/60 hover:text-white border border-blue-700/40 rounded-lg transition-colors">Cancel</button>
              <button onClick={() => handleRevoke(showRevokeConfirm)} className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all">Revoke</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
        <div className="bg-slate-700/40 border border-cyan-500/30 rounded-lg p-4">
          <h3 className="font-medium text-cyan-300 mb-2">API Documentation</h3>
          <p className="text-sm text-blue-300/80 mb-4">Learn how to use our API to integrate CartGain with your custom systems.</p>
          <Link href="/docs/api" className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">View Documentation →</Link>
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
  ariaLabel,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  ariaLabel?: string
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-blue-300/60">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        aria-label={ariaLabel ?? label}
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
