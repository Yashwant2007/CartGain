'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Trash2 } from 'lucide-react'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'

type PaymentStatus = {
  configured: boolean
  status: string
  keyFingerprint: string | null
  webhookConfigured: boolean
  lastUsedAt: string | null
}

export function CustomerPaymentSettings({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<PaymentStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await shopifySessionFetch(`/api/merchant/customer-payments/razorpay?storeId=${encodeURIComponent(storeId)}`)
      if (res.status === 404) {
        setUnavailable(true)
        setStatus(null)
        return
      }
      if (!res.ok) throw new Error(`Failed to load payment settings (HTTP ${res.status})`)
      setUnavailable(false)
      setStatus(await res.json())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load payment settings')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await shopifySessionFetch('/api/merchant/customer-payments/razorpay', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId, keyId, keySecret, webhookSecret }),
      })
      if (!res.ok) throw new Error(`Failed to save payment settings (HTTP ${res.status})`)
      setKeyId('')
      setKeySecret('')
      setWebhookSecret('')
      setMessage('Merchant payment credentials saved. Webhook signature verification is active.')
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save payment settings')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await shopifySessionFetch(`/api/merchant/customer-payments/razorpay?storeId=${encodeURIComponent(storeId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Failed to remove payment settings (HTTP ${res.status})`)
      setMessage('Merchant payment credentials revoked.')
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to remove payment settings')
    } finally {
      setSaving(false)
    }
  }

  if (!storeId) return null

  if (unavailable) {
    return (
      <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-cyan-400" /> Customer payments</h2>
        <p className="text-sm text-blue-300/70 mt-2">
          Customer-order payment links are not enabled for this deployment. Existing Shopify Billing and subscription billing are unchanged.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900/60 border border-blue-800/30 rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-cyan-400" /> Customer payments</h2>
          <p className="text-sm text-blue-300/70 mt-1">
            Optional merchant-funded Razorpay Payment Links for accepted bargains. Keys are encrypted at rest and never shown again.
          </p>
        </div>
        {status?.configured && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-emerald-800/50 bg-emerald-950/50 text-emerald-300 shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Configured
          </span>
        )}
      </div>

      {loading && <div className="text-sm text-blue-300/70 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
      {error && <div className="text-sm text-red-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
      {message && <div className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> {message}</div>}

      {status && (
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg border border-blue-800/30 bg-slate-950/40 p-3">
            <div className="text-blue-300/60">Key fingerprint</div>
            <div className="text-blue-100 font-mono mt-1">{status.keyFingerprint ?? '—'}</div>
          </div>
          <div className="rounded-lg border border-blue-800/30 bg-slate-950/40 p-3">
            <div className="text-blue-300/60">Webhook secret</div>
            <div className="text-blue-100 mt-1">{status.webhookConfigured ? 'Configured' : 'Missing'}</div>
          </div>
          <div className="rounded-lg border border-blue-800/30 bg-slate-950/40 p-3">
            <div className="text-blue-300/60">Status</div>
            <div className="text-blue-100 mt-1">{status.status}</div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-blue-200">Razorpay key id</span>
          <input
            type="text"
            value={keyId}
            onChange={(event) => setKeyId(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-950/60 border border-blue-800/40 px-3 py-2 text-blue-100"
            placeholder="rzp_live_…"
          />
        </label>
        <label className="block text-sm">
          <span className="text-blue-200">Key secret</span>
          <input
            type="password"
            value={keySecret}
            onChange={(event) => setKeySecret(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-950/60 border border-blue-800/40 px-3 py-2 text-blue-100"
            placeholder="••••••••"
          />
        </label>
        <label className="block text-sm">
          <span className="text-blue-200">Webhook secret</span>
          <input
            type="password"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
            className="mt-1 w-full rounded-lg bg-slate-950/60 border border-blue-800/40 px-3 py-2 text-blue-100"
            placeholder="••••••••"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving || !keyId.trim() || !keySecret.trim() || !webhookSecret.trim()}
          className="px-4 py-2 rounded-lg bg-cyan-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save credentials'}
        </button>
        {status?.configured && (
          <button
            onClick={() => void remove()}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-red-800/50 text-red-300 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Revoke
          </button>
        )}
        <span className="text-xs text-blue-300/50">
          Webhook events only redeem an already accepted, server-issued quote. They never create Shopify or WooCommerce orders directly.
        </span>
      </div>
    </div>
  )
}
