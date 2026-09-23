'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import {
  Sparkles,
  Save,
  Loader2,
  MessageSquare,
  TrendingUp,
  Percent,
  Users,
  ListChecks,
  Settings,
  BarChart3,
  IndianRupee,
  RotateCcw,
  PlayCircle,
  Link2,
  Target,
  Timer,
  Gauge,
} from 'lucide-react'
import { DemoPanel } from './demo-panel'
import { ProductCatalogPanel } from './product-catalog'

type BargainConfig = {
  id: string
  storeId: string
  enabled: boolean
  maxAttempts: number
  aiModel: string
  aiPersona: string
  language: string
  minProfitPercent: number
  sessionTimeout: number
  goalEnabled: boolean
  goalType: string
  goalTarget: number
  goalStartTime: string | null
  goalEndTime: string | null
  goalTimezone: string | null
  dynamicStrategyEnabled: boolean
  campaignName: string | null
  campaignMessage: string | null
  campaignStart: string | null
  campaignEnd: string | null
  negotiationMode: string
  approvedSellingPoints: string[]
  disallowedClaims: string[]
  recommendationsEnabled: boolean
  alternativeRecommendationsEnabled: boolean
  complementRecommendationsEnabled: boolean
}

type GoalStatus = {
  enabled: boolean
  windowState: string
  goalType: string
  targetValue: number
  achievedValue: number
  orderCount: number
  businessDate: string
  timezone: string
  progressPercent: number
  elapsedPercent: number
  strategy: string
  mode: string
  startsAtISO: string | null
  closesAtISO: string | null
  campaignName: string | null
  campaignMessage: string | null
}

type BargainSession = {
  id: string
  shopifyProductId: string
  customerEmail: string | null
  originalPrice: number
  finalPrice: number | null
  discountCode: string | null
  attemptsUsed: number
  status: string
  startedAt: string
}

type Summary = {
  totalSessions: number
  accepted: number
  rejected: number
  expired: number
  abandoned: number
  active: number
  avgOriginalPrice: number | null
  avgFinalPrice: number | null
  winRate: number
  revenueSaved: number
  productBreakdown: Array<{
    productId: string
    sessions: number
    accepted: number
    winRate: number
    revenueSaved: number
    avgOriginal: number
  }>
}

type Tab = 'config' | 'products' | 'analytics' | 'logs' | 'demo' | 'goals'

export default function BargainDashboardPage() {
  const router = useRouter()
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [tab, setTab] = useState<Tab>('config')

  const [config, setConfig] = useState<BargainConfig | null>(null)
  const [configForm, setConfigForm] = useState<Partial<BargainConfig>>({})
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [sessions, setSessions] = useState<BargainSession[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionMessages, setSessionMessages] = useState<
    Array<{ id: string; role: string; content: string; offeredPrice: number | null; createdAt: string }>
  >([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const abortRef = useRef<(() => void)[]>([])

  const [goalStatus, setGoalStatus] = useState<GoalStatus | null>(null)

  async function fetchGoalStatus() {
    if (!storeId) return
    try {
      const res = await fetch(`/api/bargain/goals/status?storeId=${storeId}`)
      if (!res.ok) return
      const data = await res.json()
      setGoalStatus(data.status ?? null)
    } catch {
      // Non-fatal — the goals tab shows an empty state.
    }
  }

  useEffect(() => {
    if (!storeId || tab !== 'goals') return
    void fetchGoalStatus()
    const id = setInterval(fetchGoalStatus, 30_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, tab])

  useEffect(() => {
    if (!storeError) return
    if (storeError.includes('Sign in')) router.push('/login')
    if (storeError.includes('store')) router.push('/dashboard/integrations')
  }, [storeError, router])

  useEffect(() => {
    if (!storeId) return
void fetchConfig()
      void fetchSessions()
    return () => {
      abortRef.current.forEach(abort => abort())
      abortRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  async function fetchConfig() {
    const controller = new AbortController()
    abortRef.current.push(() => controller.abort())
    try {
      setConfigMessage(null)
      const res = await fetch(`/api/bargain/config?storeId=${storeId}`, { signal: controller.signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 401) {
          router.push('/login')
          return
        }
        throw new Error(body?.message ?? `Failed to load config (HTTP ${res.status})`)
      }
      const data = await res.json()
      setConfig(data.config)
      setConfigForm(data.config)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setConfigMessage({ type: 'error', text: err.message ?? 'Failed to load config' })
    }
  }

  async function saveConfig() {
    if (!storeId || !config) return
    setSavingConfig(true)
    setConfigMessage(null)
    try {
      const res = await fetch('/api/bargain/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...configForm }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Failed to save config')
      }
      const data = await res.json()
      setConfig(data.config)
      setConfigForm(data.config)
      setConfigMessage({ type: 'success', text: 'Config saved' })
    } catch (err: any) {
      setConfigMessage({ type: 'error', text: err.message ?? 'Failed to save config' })
    } finally {
      setSavingConfig(false)
    }
  }

    async function fetchSessions() {
    if (!storeId) return
    setLoadingSessions(true)
    setSessionsError(null)
    const controller = new AbortController()
    abortRef.current.push(() => controller.abort())
    try {
      const res = await fetch(`/api/bargain/sessions?storeId=${storeId}&take=50`, { signal: controller.signal })
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = await res.json()
      setSessions(data.sessions || [])
      setSummary(data.summary || null)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setSessionsError('Failed to load sessions')
    } finally {
      if (!controller.signal.aborted) setLoadingSessions(false)
    }
  }

  async function openSessionLog(id: string) {
    setSelectedSessionId(id)
    setLoadingMessages(true)
    setMessagesError(null)
    try {
      const res = await fetch(`/api/bargain/sessions/${id}`)
      if (!res.ok) throw new Error('Failed to load conversation')
      const data = await res.json()
      setSessionMessages(data.session?.messages || [])
    } catch {
      setMessagesError('Failed to load conversation')
      setSessionMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }

  if (resolvingStore) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="ml-3 text-blue-200">Loading bargain dashboard…</span>
      </div>
    )
  }
  if (storeError) {
    return <div className="text-amber-200">{storeError}</div>
  }
  if (!storeId) return null

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'config', label: 'Config', icon: Settings },
    { id: 'demo', label: 'Live Demo', icon: PlayCircle },
    { id: 'products', label: 'Products', icon: ListChecks },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'goals', label: 'Daily Goal', icon: Target },
    { id: 'logs', label: 'Conversation Logs', icon: MessageSquare },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center">
            <Sparkles className="w-6 h-6 mr-2 text-blue-400" />
            Bargain System
          </h1>
          <p className="text-blue-300/70 text-sm mt-1">
            AI-powered negotiation at checkout. Turn price-sensitive visitors into paying customers.
          </p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b border-blue-800/30 overflow-x-auto">
        {tabs.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                active
                  ? 'border-blue-400 text-blue-200'
                  : 'border-transparent text-blue-300/60 hover:text-blue-200'
              }`}
            >
              <t.icon className="w-4 h-4 mr-2" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Config tab */}
      {tab === 'config' && (
        <div className="max-w-2xl space-y-5 bg-slate-900/60 border border-blue-800/30 rounded-xl p-6">
          {!config ? (
            configMessage ? (
              <div className="text-red-300 text-sm p-4 text-center space-y-3">
                <div>{configMessage.text}</div>
                <button
                  onClick={() => fetchConfig()}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-blue-800/40 text-blue-200 text-xs font-medium transition"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400 mr-2" />
                <span className="text-blue-300/60 text-sm">Loading config…</span>
              </div>
            )
          ) : (
            <>
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-blue-800/40 bg-slate-950/40">
                <div>
                  <div className="text-blue-100 font-medium">Enable Bargain for this store</div>
                  <div className="text-xs text-blue-300/60 mt-0.5">
                    When on, the AI negotiator is available to your customers at checkout on bargainable products.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.enabled ?? false}
                  onChange={e => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  className="w-5 h-5 accent-blue-500"
                />
              </div>

              {/* Group: Conversation behaviour */}
              <GroupTitle icon={MessageSquare} title="Negotiation" subtitle="How many rounds and how long a session stays open." />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Max attempts per customer</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={configForm.maxAttempts ?? 3}
                    onChange={e => setConfigForm({ ...configForm, maxAttempts: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">Quality offers only — fewer rounds feels premium.</p>
                </div>
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Session timeout (seconds)</label>
                  <input
                    type="number"
                    min={30}
                    max={3600}
                    value={configForm.sessionTimeout ?? 300}
                    onChange={e => setConfigForm({ ...configForm, sessionTimeout: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">A timed offer adds gentle urgency without pressure.</p>
                </div>
              </div>

              {/* Group: AI Salesperson — negotiation mode + product knowledge */}
              <GroupTitle
                icon={Sparkles}
                title="AI Selling & Product Knowledge"
                subtitle="Merchant-controlled: the negotiating temperament, the claims the AI may use, the claims it must never repeat, and cross-sell behaviour."
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Negotiation mode</label>
                  <select
                    value={configForm.negotiationMode ?? 'balanced'}
                    onChange={e => setConfigForm({ ...configForm, negotiationMode: e.target.value })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="conservative">Conservative · protect margin</option>
                    <option value="balanced">Balanced · fair deals (default)</option>
                    <option value="flexible">Flexible · closing-focused</option>
                  </select>
                  <p className="text-xs text-blue-300/60 mt-1">
                    Sets how hard the AI pushes toward the listed price. The hidden margin floor always holds.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-200">Cross-sell suggestions</span>
                    <input
                      type="checkbox"
                      checked={configForm.recommendationsEnabled ?? true}
                      onChange={e => setConfigForm({ ...configForm, recommendationsEnabled: e.target.checked })}
                      className="w-5 h-5 accent-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-200">Recommend similar alternatives</span>
                    <input
                      type="checkbox"
                      checked={configForm.alternativeRecommendationsEnabled ?? true}
                      onChange={e => setConfigForm({ ...configForm, alternativeRecommendationsEnabled: e.target.checked })}
                      className="w-5 h-5 accent-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-200">Recommend complements <span className="text-xs text-blue-300/50">· next phase</span></span>
                    <input
                      type="checkbox"
                      checked={configForm.complementRecommendationsEnabled ?? true}
                      onChange={e => setConfigForm({ ...configForm, complementRecommendationsEnabled: e.target.checked })}
                      className="w-5 h-5 accent-blue-500"
                    />
                  </div>
                  <p className="text-xs text-blue-300/60 mt-1">
                    When both master + alternative toggles are on, the agent suggests matching
                    products from your verified catalog when a shopper&apos;s budget can&apos;t reach your
                    floor (or a lowball risks the sale). Cards rank by budget fit; over-budget picks
                    are clearly labelled. Complement suggestions ship with the next phase.
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Approved selling points (one per line)</label>
                  <textarea
                    rows={4}
                    value={(configForm.approvedSellingPoints ?? []).join('\n')}
                    onChange={e =>
                      setConfigForm({
                        ...configForm,
                        approvedSellingPoints: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                      })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                    placeholder={'machine-washable\n7-day replacement warranty'}
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    Only these merchant-vetted claims reach the AI. It may mention them when relevant.
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Claims the AI must never repeat (one per line)</label>
                  <textarea
                    rows={4}
                    value={(configForm.disallowedClaims ?? []).join('\n')}
                    onChange={e =>
                      setConfigForm({
                        ...configForm,
                        disallowedClaims: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                      })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                    placeholder={'cures skin problems\nworld #1 brand'}
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    These phrases are scrubbed from product context so the AI never repeats unverified claims.
                  </p>
                </div>
              </div>

              {/* Group: Personality & voice */}
              <GroupTitle icon={Sparkles} title="Personality" subtitle="The tone your customers experience, in their language." />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-blue-200 mb-1">AI Persona</label>
                  <select
                    value={configForm.aiPersona ?? 'friendly_shopkeeper'}
                    onChange={e => setConfigForm({ ...configForm, aiPersona: e.target.value })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="friendly_shopkeeper">Friendly Shopkeeper</option>
                    <option value="strict_negotiator">Strict Negotiator</option>
                    <option value="playful_friend">Playful Friend</option>
                  </select>
                  <p className="text-xs text-blue-300/60 mt-1">Strict protects margin, Friendly recovers more, Playful is a balance.</p>
                </div>
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Default language</label>
                  <select
                    value={configForm.language ?? 'auto'}
                    onChange={e => setConfigForm({ ...configForm, language: e.target.value })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="auto">Auto · mirror the customer</option>
                    <option value="en">English</option>
                    <option value="hinglish">Hinglish</option>
                    <option value="hi">हिन्दी (Hindi)</option>
                    <option value="ta">தமிழ் (Tamil)</option>
                    <option value="te">తెలుగు (Telugu)</option>
                    <option value="bn">বাংলা (Bengali)</option>
                    <option value="mr">मराठी (Marathi)</option>
                    <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
                  </select>
                  <p className="text-xs text-blue-300/60 mt-1">
                    Auto mirrors whatever language the customer writes in. Pick one to force that language branch.
                  </p>
                </div>
              </div>

              {/* Group: Margin protection */}
              <GroupTitle icon={Percent} title="Margin protection" subtitle="Guardrails the AI can never cross — never shown to customers." />
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-blue-200 mb-1">Min Profit % (global fallback)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={configForm.minProfitPercent ?? 20}
                    onChange={e => setConfigForm({ ...configForm, minProfitPercent: parseFloat(e.target.value) })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  />
                  <p className="text-xs text-blue-300/60 mt-1">
                    The AI will never agree to a price below this margin of the original.
                  </p>
                  <button
                    onClick={() => setTab('products')}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-blue-300/70 hover:text-blue-200 transition"
                  >
                    <Link2 className="w-3 h-3" /> Set a different floor per product →
                  </button>
                </div>
                <div>
                  <label className="block text-sm text-blue-200 mb-1">AI Model</label>
                  <select
                    value={configForm.aiModel ?? 'gpt-4o-mini'}
                    onChange={e => setConfigForm({ ...configForm, aiModel: e.target.value })}
                    className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (cheap, fast)</option>
                    <option value="gpt-4o">gpt-4o (higher quality)</option>
                    <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                    <option value="gpt-4.1">gpt-4.1 (best)</option>
                  </select>
                  <p className="text-xs text-blue-300/60 mt-1">Higher quality models write more personality; mini is fastest and cheapest.</p>
                </div>
              </div>

              {/* Group: Daily goal & strategy */}
              <GroupTitle
                icon={Target}
                title="AI Salesperson · Daily Goal"
                subtitle="Set a real daily target. CartGain paces the negotiation toward it — always inside your margin floor."
              />
              <div className="flex items-center justify-between p-4 rounded-xl border border-blue-800/40 bg-slate-950/40">
                <div>
                  <div className="text-blue-100 font-medium">Enable daily goal</div>
                  <div className="text-xs text-blue-300/60 mt-0.5">
                    When on, negotiation intensity follows your progress automatically. Customers never see this.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.goalEnabled ?? false}
                  onChange={e => setConfigForm({ ...configForm, goalEnabled: e.target.checked })}
                  className="w-5 h-5 accent-blue-500"
                />
              </div>

              {configForm.goalEnabled && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Goal measures</label>
                      <select
                        value={configForm.goalType ?? 'orders'}
                        onChange={e => setConfigForm({ ...configForm, goalType: e.target.value })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      >
                        <option value="orders">Orders placed</option>
                        <option value="revenue">Revenue (₹)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm text-blue-200 mb-1">Daily target</label>
                      <input
                        type="number"
                        min={1}
                        step={configForm.goalType === 'revenue' ? 100 : 1}
                        value={configForm.goalTarget ?? 10}
                        onChange={e => setConfigForm({ ...configForm, goalTarget: parseFloat(e.target.value) })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-xs text-blue-300/60 mt-1">
                        {configForm.goalType === 'revenue'
                          ? 'Target revenue (order net) to recognize by the end of the window.'
                          : 'Number of confirmed orders to recognize by the end of the window.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Window starts</label>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeInput(configForm.goalStartTime ?? null)}
                        onChange={e => setConfigForm({ ...configForm, goalStartTime: fromLocalDateTimeInput(e.target.value) })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-xs text-blue-300/60 mt-1">Set the time in your browser; shown in your store timezone.</p>
                    </div>
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Window ends</label>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeInput(configForm.goalEndTime ?? null)}
                        onChange={e => setConfigForm({ ...configForm, goalEndTime: fromLocalDateTimeInput(e.target.value) })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-xs text-blue-300/60 mt-1">Orders placed during this window count toward the goal.</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Store timezone</label>
                      <select
                        value={configForm.goalTimezone ?? 'Asia/Kolkata'}
                        onChange={e => setConfigForm({ ...configForm, goalTimezone: e.target.value })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                        <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                        <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                        <option value="Asia/Dhaka">Asia/Dhaka (BST)</option>
                        <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                        <option value="Europe/London">Europe/London (GMT/BST)</option>
                        <option value="America/New_York">America/New_York (EST/EDT)</option>
                        <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                        <option value="UTC">UTC</option>
                      </select>
                      <p className="text-xs text-blue-300/60 mt-1">Used to bucket the day and display the window.</p>
                    </div>
                    <div className="flex items-end">
                      <label className="block text-sm text-blue-200 mb-1">
                        <span className="block">Auto dynamic strategy</span>
                        <span className="block text-xs text-blue-300/60 mt-1 font-normal">
                          Let CartGain switch between Conservative / Normal / Aggressive / Closing based on your progress.
                        </span>
                        <input
                          type="checkbox"
                          checked={configForm.dynamicStrategyEnabled ?? false}
                          onChange={e => setConfigForm({ ...configForm, dynamicStrategyEnabled: e.target.checked })}
                          className="mt-2 w-5 h-5 accent-blue-500"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Campaign name (optional)</label>
                      <input
                        type="text"
                        maxLength={60}
                        value={configForm.campaignName ?? ''}
                        onChange={e => setConfigForm({ ...configForm, campaignName: e.target.value || null })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                        placeholder="e.g. Diwali sale"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Campaign message (optional)</label>
                      <input
                        type="text"
                        maxLength={250}
                        value={configForm.campaignMessage ?? ''}
                        onChange={e => setConfigForm({ ...configForm, campaignMessage: e.target.value || null })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                        placeholder="Only truthful context you want the AI to reference"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Campaign starts</label>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeInput(configForm.campaignStart ?? null)}
                        onChange={e => setConfigForm({ ...configForm, campaignStart: fromLocalDateTimeInput(e.target.value) })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-xs text-blue-300/60 mt-1">Leave empty to run for the whole goal window.</p>
                    </div>
                    <div>
                      <label className="block text-sm text-blue-200 mb-1">Campaign ends</label>
                      <input
                        type="datetime-local"
                        value={toLocalDateTimeInput(configForm.campaignEnd ?? null)}
                        onChange={e => setConfigForm({ ...configForm, campaignEnd: fromLocalDateTimeInput(e.target.value) })}
                        className="w-full bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white"
                      />
                      <p className="text-xs text-blue-300/60 mt-1">The AI only references the campaign while it is live.</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setTab('goals')}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-300/70 hover:text-blue-200 transition"
                  >
                    <Gauge className="w-3.5 h-3.5" /> View live goal progress →
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="flex items-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {savingConfig ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Config
                </button>
                {configMessage && (
                  <span className={configMessage.type === 'success' ? 'text-emerald-300 text-sm' : 'text-red-300 text-sm'}>
                    {configMessage.text}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Demo tab */}
      {tab === 'demo' && (
        <DemoPanel
          defaultPersona={(config?.aiPersona as 'friendly_shopkeeper' | 'strict_negotiator' | 'playful_friend') ?? 'friendly_shopkeeper'}
          defaultLanguage={config?.language ?? 'auto'}
          maxAttempts={config?.maxAttempts ?? 3}
          minProfitPercent={config?.minProfitPercent ?? 20}
        />
      )}

      {/* Products tab */}
      {tab === 'products' && storeId && (
        <ProductCatalogPanel
          storeId={storeId}
          globalMinProfitPercent={configForm.minProfitPercent ?? 20}
        />
      )}

      {/* Analytics tab */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          {sessionsError ? (
            <div className="text-red-300 text-sm">{sessionsError}</div>
          ) : summary ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard icon={Users} label="Total Sessions" value={summary.totalSessions} color="text-blue-300" />
              <MetricCard icon={TrendingUp} label="Win Rate" value={`${summary.winRate}%`} color="text-emerald-300" />
              <MetricCard icon={Percent} label="Accepted" value={summary.accepted} color="text-emerald-300" />
              <MetricCard icon={IndianRupee} label="Revenue Saved" value={`₹${summary.revenueSaved.toLocaleString('en-IN')}`} color="text-emerald-300" />
              <MetricCard icon={BarChart3} label="Abandoned" value={summary.abandoned} color="text-amber-300" />
              </div>

            {summary.productBreakdown.length > 0 && (
              <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-blue-800/30 text-blue-100 font-semibold">
                  Revenue by Product
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-950/60 text-blue-300/80">
                      <tr>
                        <th className="text-left px-4 py-2">Product ID</th>
                        <th className="text-right px-4 py-2">Sessions</th>
                        <th className="text-right px-4 py-2">Win Rate</th>
                        <th className="text-right px-4 py-2">Avg Original</th>
                        <th className="text-right px-4 py-2">Revenue Saved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.productBreakdown.map(p => (
                        <tr key={p.productId} className="border-t border-blue-800/20 text-blue-100">
                          <td className="px-4 py-2 font-mono text-xs">{p.productId}</td>
                          <td className="px-4 py-2 text-right">{p.sessions}</td>
                          <td className="px-4 py-2 text-right">{p.winRate}%</td>
                          <td className="px-4 py-2 text-right">₹{p.avgOriginal.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-emerald-300">₹{p.revenueSaved.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </div>
          ) : (
            <div className="text-blue-300/60 text-sm">No analytics yet.</div>
          )}

          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-800/30 text-blue-100 font-semibold">Recent Sessions</div>
            {loadingSessions ? (
              <div className="p-5"><Loader2 className="w-4 h-4 animate-spin mr-2 inline text-blue-300" /> Loading…</div>
            ) : sessionsError ? (
              <div className="p-5 text-red-300 text-sm">{sessionsError}</div>
            ) : sessions.length === 0 ? (
              <div className="p-5 text-blue-300/60 text-sm">No bargain sessions yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/60 text-blue-300/80">
                    <tr>
                      <th className="text-left px-4 py-2">Product ID</th>
                      <th className="text-left px-4 py-2">Customer</th>
                      <th className="text-left px-4 py-2">Original</th>
                      <th className="text-left px-4 py-2">Final</th>
                      <th className="text-left px-4 py-2">Attempts</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id} className="border-t border-blue-800/20 text-blue-100">
                        <td className="px-4 py-2 font-mono text-xs">{s.shopifyProductId}</td>
                        <td className="px-4 py-2 text-xs text-blue-300/70">{s.customerEmail ?? '—'}</td>
                        <td className="px-4 py-2">₹{s.originalPrice.toFixed(2)}</td>
                        <td className="px-4 py-2">{s.finalPrice != null ? `₹${s.finalPrice.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-2">{s.attemptsUsed}</td>
                        <td className="px-4 py-2">
                          <StatusPill status={s.status} />
                        </td>
                        <td className="px-4 py-2 text-xs text-blue-300/70">{new Date(s.startedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conversation logs tab */}
      {tab === 'logs' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden lg:col-span-1">
            <div className="px-5 py-3 border-b border-blue-800/30 text-blue-100 font-semibold">Sessions</div>
            {loadingSessions ? (
              <div className="p-5"><Loader2 className="w-4 h-4 animate-spin mr-2 inline text-blue-300" /> Loading…</div>
            ) : sessionsError ? (
              <div className="p-5 text-red-300 text-sm">{sessionsError}</div>
            ) : sessions.length === 0 ? (
              <div className="p-5 text-blue-300/60 text-sm">No sessions to inspect.</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => openSessionLog(s.id)}
                    className={`w-full text-left px-4 py-3 border-b border-blue-800/10 hover:bg-slate-800/40 transition ${
                      selectedSessionId === s.id ? 'bg-blue-900/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-blue-200">{s.shopifyProductId}</span>
                      <StatusPill status={s.status} />
                    </div>
                    <div className="text-xs text-blue-300/60 mt-1">
                      {new Date(s.startedAt).toLocaleString()}
                      {s.finalPrice != null && ` · ₹${s.finalPrice.toFixed(2)}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-slate-900/60 border border-blue-800/30 rounded-xl p-5 min-h-[300px]">
            {!selectedSessionId ? (
              <div className="text-blue-300/60 text-sm">Select a session to view the conversation.</div>
            ) : loadingMessages ? (
              <div><Loader2 className="w-4 h-4 animate-spin mr-2 inline text-blue-300" /> Loading conversation…</div>
            ) : messagesError ? (
              <div className="text-red-300 text-sm">{messagesError}</div>
            ) : sessionMessages.length === 0 ? (
              <div className="text-blue-300/60 text-sm">No messages.</div>
            ) : (
              <div className="space-y-4">
                {sessionMessages.map(m => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                        m.role === 'customer'
                          ? 'bg-blue-600 text-white'
                          : m.role === 'system'
                          ? 'bg-slate-700 text-slate-200 italic'
                          : 'bg-slate-800 text-blue-100'
                      }`}
                    >
                      {m.content}
                      {m.offeredPrice != null && (
                        <div className="text-xs opacity-70 mt-1">Offered: ₹{m.offeredPrice.toFixed(2)}</div>
                      )}
                      <div className="text-[10px] opacity-50 mt-1">
                        {m.role} · {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Daily Goal tab */}
      {tab === 'goals' && (
        <div className="space-y-5">
          {!goalStatus ? (
            <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-6 text-blue-300/60 text-sm">
              No goal data yet. Open the Config tab, enable a daily goal and pick a window.
            </div>
          ) : !goalStatus.enabled ? (
            <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-6 text-blue-300/60 text-sm">
              The daily goal is currently disabled. Enable it in the Config tab to see live progress here.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
                  <div className="flex items-center mb-2">
                    <Target className="w-5 h-5 mr-2 text-blue-300" />
                    <span className="text-xs text-blue-300/70">Daily {goalStatus.goalType}</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {goalStatus.goalType === 'revenue'
                      ? `₹${goalStatus.achievedValue.toLocaleString('en-IN')}`
                      : goalStatus.orderCount}
                  </div>
                  <div className="text-xs text-blue-300/60 mt-1">
                    of {goalStatus.goalType === 'revenue'
                      ? `₹${goalStatus.targetValue.toLocaleString('en-IN')}`
                      : goalStatus.targetValue}{' '}
                    target
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
                  <div className="flex items-center mb-2">
                    <TrendingUp className="w-5 h-5 mr-2 text-emerald-300" />
                    <span className="text-xs text-blue-300/70">Progress</span>
                  </div>
                  <div className="text-2xl font-bold text-white">{goalStatus.progressPercent.toFixed(0)}%</div>
                  <div className="text-xs text-blue-300/60 mt-1">of target reached</div>
                </div>
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
                  <div className="flex items-center mb-2">
                    <Gauge className="w-5 h-5 mr-2 text-blue-300" />
                    <span className="text-xs text-blue-300/70">Strategy</span>
                  </div>
                  <div className="text-xl font-bold text-white">{goalStatus.strategy}</div>
                  <div className="text-xs text-blue-300/60 mt-1">
                    {goalStatus.mode.charAt(0).toUpperCase() + goalStatus.mode.slice(1)} pace
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
                  <div className="flex items-center mb-2">
                    <Timer className="w-5 h-5 mr-2 text-amber-300" />
                    <span className="text-xs text-blue-300/70">Window</span>
                  </div>
                  <div className="text-xl font-bold text-white">{goalStatus.elapsedPercent.toFixed(0)}%</div>
                  <div className="text-xs text-blue-300/60 mt-1">elapsed · <GoalStatusPill status={goalStatus.windowState} /></div>
                </div>
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
                  <div className="flex items-center mb-2">
                    <TrendingUp className="w-5 h-5 mr-2 text-amber-300" />
                    <span className="text-xs text-blue-300/70">Remaining</span>
                  </div>
                  <div className="text-xl font-bold text-white">
                    {goalStatus.goalType === 'revenue'
                      ? `₹${Math.max(0, goalStatus.targetValue - goalStatus.achievedValue).toLocaleString('en-IN')}`
                      : Math.max(0, goalStatus.targetValue - goalStatus.orderCount)}
                  </div>
                  <div className="text-xs text-blue-300/60 mt-1">still needed to reach target</div>
                </div>
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
                  <div className="flex items-center mb-2">
                    <Timer className="w-5 h-5 mr-2 text-emerald-300" />
                    <span className="text-xs text-blue-300/70">Time Remaining</span>
                  </div>
                  <div className="text-xl font-bold text-white">{formatTimeRemaining(goalStatus.closesAtISO)}</div>
                  <div className="text-xs text-blue-300/60 mt-1">until the window closes</div>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-blue-100 font-semibold">
                    {goalStatus.goalType === 'revenue' ? 'Revenue recognized' : 'Confirmed orders'} — {goalStatus.businessDate}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      goalStatus.progressPercent >= 100
                        ? 'bg-emerald-500'
                        : goalStatus.mode === 'behind'
                        ? 'bg-amber-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, goalStatus.progressPercent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-blue-300/60">
                  <span>
                    {goalStatus.startsAtISO ? new Date(goalStatus.startsAtISO).toLocaleString() : '—'}
                  </span>
                  <span>
                    {goalStatus.closesAtISO ? new Date(goalStatus.closesAtISO).toLocaleString() : '—'}
                  </span>
                </div>
                <p className="text-xs text-blue-300/60 mt-2">
                  Timezone: {goalStatus.timezone} · Only confirmed bargain orders (not refunded) count · Strategy and pacing
                  are merchant-only — customers never see them.
                </p>
              </div>

              {(goalStatus.campaignName || goalStatus.campaignMessage) && (
                <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4 text-sm text-blue-100">
                  <span className="text-blue-300/70 font-medium">Campaign:</span>{' '}
                  {goalStatus.campaignName ?? 'Untitled'}{' '}
                  {goalStatus.campaignMessage && <span className="text-blue-300/60">- {goalStatus.campaignMessage}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
// Convert an ISO timestamp to a <input type="datetime-local"> value (browser-local).
function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convert a datetime-local value back to ISO (or null to clear).
function fromLocalDateTimeInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// "4h 32m" style countdown to the window close (client clock), else '—'.
function formatTimeRemaining(iso: string | null): string {
  if (!iso) return '—'
  const end = new Date(iso).getTime()
  if (Number.isNaN(end)) return '—'
  const ms = Math.max(0, end - Date.now())
  const totalMinutes = Math.floor(ms / 60_000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h <= 0 && m <= 0) return 'Closed'
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

function GoalStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active now', cls: 'bg-emerald-900/40 text-emerald-300' },
    not_started: { label: 'Not started', cls: 'bg-slate-800 text-slate-300' },
    ended: { label: 'Window ended', cls: 'bg-slate-800 text-slate-300' },
    disabled: { label: 'Disabled', cls: 'bg-slate-800 text-slate-300' },
  }
  const m = map[status] ?? { label: status, cls: 'bg-slate-800 text-slate-300' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span>
}

function GroupTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 text-blue-100 font-semibold">
        <Icon className="w-4 h-4 text-blue-400" />
        {title}
      </div>
      <p className="text-xs text-blue-300/60 mt-0.5 mb-3">{subtitle}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-blue-900/40 text-blue-300',
    accepted: 'bg-emerald-900/40 text-emerald-300',
    rejected: 'bg-red-900/40 text-red-300',
    expired: 'bg-slate-800 text-slate-300',
    abandoned: 'bg-amber-900/40 text-amber-300',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-slate-800 text-slate-300'}`}>
      {status}
    </span>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-4">
      <div className="flex items-center mb-2">
        <Icon className={`w-5 h-5 mr-2 ${color}`} />
        <span className="text-xs text-blue-300/70">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}
