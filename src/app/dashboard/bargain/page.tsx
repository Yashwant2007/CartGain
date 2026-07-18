'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import {
  Sparkles,
  Save,
  Loader2,
  Trash2,
  Plus,
  MessageSquare,
  TrendingUp,
  Percent,
  Users,
  ListChecks,
  Settings,
  BarChart3,
} from 'lucide-react'

type BargainConfig = {
  id: string
  storeId: string
  enabled: boolean
  maxAttempts: number
  aiModel: string
  aiPersona: string
  minProfitPercent: number
  sessionTimeout: number
}

type BargainProduct = {
  id: string
  storeId: string
  shopifyProductId: string
  variantId: string | null
  productTitle: string | null
  minPrice: number | null
  minProfitPercent: number | null
  maxDiscountPercent: number | null
  isBargainable: boolean
}

type BargainSession = {
  id: string
  shopifyProductId: string
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
}

type Tab = 'config' | 'products' | 'analytics' | 'logs'

export default function BargainDashboardPage() {
  const router = useRouter()
  const { storeId, loading: resolvingStore, error: storeError } = useResolvedStoreId()
  const [tab, setTab] = useState<Tab>('config')

  const [config, setConfig] = useState<BargainConfig | null>(null)
  const [configForm, setConfigForm] = useState<Partial<BargainConfig>>({})
  const [savingConfig, setSavingConfig] = useState(false)
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [products, setProducts] = useState<BargainProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [newProduct, setNewProduct] = useState<Partial<BargainProduct>>({
    shopifyProductId: '',
    productTitle: '',
    minPrice: undefined,
    maxDiscountPercent: undefined,
    isBargainable: true,
  })
  const [addingProduct, setAddingProduct] = useState(false)

  const [sessions, setSessions] = useState<BargainSession[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [sessionMessages, setSessionMessages] = useState<
    Array<{ id: string; role: string; content: string; offeredPrice: number | null; createdAt: string }>
  >([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  useEffect(() => {
    if (!storeError) return
    if (storeError.includes('Sign in')) router.push('/login')
    if (storeError.includes('store')) router.push('/dashboard/integrations')
  }, [storeError, router])

  useEffect(() => {
    if (!storeId) return
    void fetchConfig()
    void fetchProducts()
    void fetchSessions()
  }, [storeId])

  async function fetchConfig() {
    try {
      const res = await fetch(`/api/bargain/config?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load config')
      const data = await res.json()
      setConfig(data.config)
      setConfigForm(data.config)
    } catch (err: any) {
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

  async function fetchProducts() {
    if (!storeId) return
    setLoadingProducts(true)
    try {
      const res = await fetch(`/api/bargain/products?storeId=${storeId}&take=100`)
      if (!res.ok) throw new Error('Failed to load products')
      const data = await res.json()
      setProducts(data.products || [])
    } catch {
      setProducts([])
    } finally {
      setLoadingProducts(false)
    }
  }

  async function addProduct() {
    if (!storeId || !newProduct.shopifyProductId) return
    setAddingProduct(true)
    try {
      const res = await fetch('/api/bargain/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...newProduct }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Failed to add product')
      }
      setNewProduct({ shopifyProductId: '', productTitle: '', minPrice: undefined, maxDiscountPercent: undefined, isBargainable: true })
      await fetchProducts()
    } catch (err: any) {
      alert(err.message ?? 'Failed to add product')
    } finally {
      setAddingProduct(false)
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product override?')) return
    try {
      const res = await fetch(`/api/bargain/products?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      await fetchProducts()
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete')
    }
  }

  async function fetchSessions() {
    if (!storeId) return
    setLoadingSessions(true)
    try {
      const res = await fetch(`/api/bargain/sessions?storeId=${storeId}&take=50`)
      if (!res.ok) throw new Error('Failed to load sessions')
      const data = await res.json()
      setSessions(data.sessions || [])
      setSummary(data.summary || null)
    } catch {
      setSessions([])
      setSummary(null)
    } finally {
      setLoadingSessions(false)
    }
  }

  async function openSessionLog(id: string) {
    setSelectedSessionId(id)
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/bargain/sessions/${id}`)
      if (!res.ok) throw new Error('Failed to load messages')
      const data = await res.json()
      setSessionMessages(data.session?.messages || [])
    } catch {
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
    { id: 'products', label: 'Products', icon: ListChecks },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
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
              <div className="text-red-300 text-sm p-4 text-center">{configMessage.text}</div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400 mr-2" />
                <span className="text-blue-300/60 text-sm">Loading config…</span>
              </div>
            )
          ) : (
            <>
              <label className="flex items-center justify-between">
                <span className="text-blue-100">Enable Bargain for this store</span>
                <input
                  type="checkbox"
                  checked={configForm.enabled ?? false}
                  onChange={e => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  className="w-5 h-5 accent-blue-500"
                />
              </label>

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
              </div>

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
              </div>

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
              </div>

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

      {/* Products tab */}
      {tab === 'products' && (
        <div className="space-y-5">
          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-5 space-y-3">
            <h3 className="text-blue-100 font-semibold">Add Product Override</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                placeholder="Shopify Product ID"
                value={newProduct.shopifyProductId ?? ''}
                onChange={e => setNewProduct({ ...newProduct, shopifyProductId: e.target.value })}
                className="bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm"
              />
              <input
                placeholder="Title (optional)"
                value={newProduct.productTitle ?? ''}
                onChange={e => setNewProduct({ ...newProduct, productTitle: e.target.value })}
                className="bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm"
              />
              <input
                type="number"
                placeholder="Min Price (absolute)"
                value={newProduct.minPrice ?? ''}
                onChange={e => setNewProduct({ ...newProduct, minPrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm"
              />
              <input
                type="number"
                placeholder="Max Discount %"
                value={newProduct.maxDiscountPercent ?? ''}
                onChange={e => setNewProduct({ ...newProduct, maxDiscountPercent: e.target.value ? parseInt(e.target.value) : undefined })}
                className="bg-slate-950 border border-blue-800/40 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
            <button
              onClick={addProduct}
              disabled={addingProduct}
              className="flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {addingProduct ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              {addingProduct ? 'Adding…' : 'Add Override'}
            </button>
          </div>

          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-800/30 text-blue-100 font-semibold">
              Product Overrides ({products.length})
            </div>
            {loadingProducts ? (
              <div className="p-5 text-blue-300/60"><Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> Loading…</div>
            ) : products.length === 0 ? (
              <div className="p-5 text-blue-300/60 text-sm">No overrides yet. Per-product settings cascade over the global config.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/60 text-blue-300/80">
                    <tr>
                      <th className="text-left px-4 py-2">Product</th>
                      <th className="text-left px-4 py-2">Min Price</th>
                      <th className="text-left px-4 py-2">Max Discount</th>
                      <th className="text-left px-4 py-2">Bargainable</th>
                      <th className="text-right px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} className="border-t border-blue-800/20 text-blue-100">
                        <td className="px-4 py-2">
                          <div className="font-mono text-xs">{p.shopifyProductId}</div>
                          {p.productTitle && <div className="text-xs text-blue-300/60">{p.productTitle}</div>}
                        </td>
                        <td className="px-4 py-2">{p.minPrice != null ? `₹${p.minPrice.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-2">{p.maxDiscountPercent != null ? `${p.maxDiscountPercent}%` : '—'}</td>
                        <td className="px-4 py-2">
                          <span className={p.isBargainable ? 'text-emerald-300' : 'text-red-300'}>
                            {p.isBargainable ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => deleteProduct(p.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics tab */}
      {tab === 'analytics' && (
        <div className="space-y-5">
          {summary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard icon={Users} label="Total Sessions" value={summary.totalSessions} color="text-blue-300" />
              <MetricCard icon={TrendingUp} label="Win Rate" value={`${summary.winRate}%`} color="text-emerald-300" />
              <MetricCard icon={Percent} label="Accepted" value={summary.accepted} color="text-emerald-300" />
              <MetricCard icon={BarChart3} label="Abandoned" value={summary.abandoned} color="text-amber-300" />
            </div>
          ) : (
            <div className="text-blue-300/60 text-sm">No analytics yet.</div>
          )}

          <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-blue-800/30 text-blue-100 font-semibold">Recent Sessions</div>
            {loadingSessions ? (
              <div className="p-5"><Loader2 className="w-4 h-4 animate-spin mr-2 inline text-blue-300" /> Loading…</div>
            ) : sessions.length === 0 ? (
              <div className="p-5 text-blue-300/60 text-sm">No bargain sessions yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/60 text-blue-300/80">
                    <tr>
                      <th className="text-left px-4 py-2">Product ID</th>
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
