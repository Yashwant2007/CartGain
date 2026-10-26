'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'

type Recipient = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  consentWhatsApp: boolean
  whatsappStatus: string
  whatsappStatusLabel: string
  whatsappConsentAt: string | null
  whatsappConsentSource: string | null
  optedOutAt: string | null
  suppressed: boolean
  lastSeenAt: string | null
  lastContactedAt: string | null
  lastChannel: string | null
}

type Counts = {
  all: number
  eligible: number
  no_consent: number
  missing_phone: number
  opted_out: number
  email_only: number
}

type Diagnostics = {
  whatsapp: {
    configured: boolean
    phoneNumberId: string | null
    storePhoneNumberId: string | null
    inboundWebhookMapped: boolean
    webhookSecretConfigured: boolean
  }
  consentRule: string
}

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'no_consent', label: 'No consent' },
  { key: 'missing_phone', label: 'No phone' },
  { key: 'opted_out', label: 'Opted out' },
  { key: 'email_only', label: 'Email only' },
]

export default function RecipientsPage() {
  const { storeId, loading: resolving, error: storeError } = useResolvedStoreId()
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [phoneIdInput, setPhoneIdInput] = useState('')

  const load = useCallback(() => {
    if (!storeId) return () => {}
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ storeId, filter })
    if (search.trim()) params.set('q', search.trim())
    shopifySessionFetch(`/api/recipients?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.message || 'Failed to load recipients')
        return data
      })
      .then((data) => {
        setRecipients(data.recipients || [])
        setCounts(data.counts || null)
        setDiagnostics(data.diagnostics || null)
        setPhoneIdInput(data.diagnostics?.whatsapp?.storePhoneNumberId || '')
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setError(err?.message || 'Failed to load recipients')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [storeId, filter, search])

  useEffect(() => {
    const cleanup = load()
    return cleanup
  }, [load])

  const act = async (recipient: Recipient, action: 'grant_whatsapp_consent' | 'suppress') => {
    if (!recipient) return
    const confirmText =
      action === 'grant_whatsapp_consent'
        ? `Record WhatsApp opt-in for ${recipient.name || recipient.phone}?\n\nOnly do this if you actually hold their explicit consent to receive WhatsApp messages.`
        : `Suppress ${recipient.name || recipient.phone}?\n\nThey will receive no further WhatsApp or email recovery messages.`
    if (!window.confirm(confirmText)) return

    setBusyId(recipient.id)
    try {
      const res = await shopifySessionFetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          identityId: recipient.id,
          attested: action === 'grant_whatsapp_consent' ? true : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Update failed')
      load()
    } catch (err: any) {
      setError(err?.message || 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  const saveMapping = async () => {
    if (!storeId) return
    setBusyId('mapping')
    try {
      const res = await shopifySessionFetch('/api/integrations/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, whatsappPhoneNumberId: phoneIdInput.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save mapping')
      load()
    } catch (err: any) {
      setError(err?.message || 'Could not save mapping')
    } finally {
      setBusyId(null)
    }
  }

  const badge = (recipient: Recipient) => {
    switch (recipient.whatsappStatus) {
      case 'eligible':
        return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
      case 'no_consent':
        return 'bg-amber-600/20 text-amber-300 border-amber-500/30'
      case 'missing_phone':
      case 'invalid_phone':
        return 'bg-slate-600/30 text-blue-200 border-slate-500/40'
      default:
        return 'bg-red-600/20 text-red-300 border-red-500/30'
    }
  }

  const isLoading = resolving || loading

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            Recipients
          </h1>
          <p className="text-blue-300 text-sm mt-1">
            Automatic registry from Shopify carts, checkouts, orders and customer sync. WhatsApp is only sent to explicit opt-ins.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
            <input
              type="text"
              placeholder="Search name, email or phone..."
              aria-label="Search recipients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800/40 border border-blue-700/30 rounded-lg text-sm text-white placeholder-blue-400/50 focus:border-blue-500/70 outline-none"
            />
          </div>
          <button
            onClick={() => load()}
            className="p-2 rounded-lg bg-slate-800/40 border border-blue-700/30 text-blue-300 hover:text-white"
            aria-label="Refresh recipients"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {diagnostics && (!diagnostics.whatsapp.configured || !diagnostics.whatsapp.inboundWebhookMapped) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-amber-100/90">
              {!diagnostics.whatsapp.configured && (
                <p>
                  WhatsApp provider is not configured on this deployment. Set <code>WHATSAPP_PHONE_NUMBER_ID</code> and{' '}
                  <code>WHATSAPP_BUSINESS_TOKEN</code> before any WhatsApp send can succeed.
                </p>
              )}
              {!diagnostics.whatsapp.inboundWebhookMapped && (
                <div className="space-y-2">
                  <p>
                    This store has no <code>whatsappPhoneNumberId</code> mapping. Inbound STOP/START keywords cannot be
                    attributed to the right store when more than one store is active. Enter the business phone-number id
                    (Meta → WhatsApp → API setup) to map it.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={phoneIdInput}
                      onChange={(e) => setPhoneIdInput(e.target.value)}
                      placeholder={diagnostics.whatsapp.phoneNumberId || 'e.g. 1266364546554326'}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-amber-500/30 text-xs text-white placeholder-amber-200/30 outline-none"
                    />
                    <button
                      onClick={saveMapping}
                      disabled={busyId === 'mapping' || !phoneIdInput.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs bg-amber-600/30 border border-amber-500/40 text-amber-100 disabled:opacity-40"
                    >
                      Save mapping
                    </button>
                  </div>
                </div>
              )}
              {!diagnostics.whatsapp.webhookSecretConfigured && (
                <p>
                  Meta app secret is not set, so inbound webhooks (STOP/START and delivery receipts) are rejected with 401.
                  Set <code>WHATSAPP_APP_SECRET</code> (or <code>META_APP_SECRET</code>).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((tab) => {
          const count = counts ? (counts as any)[tab.key] ?? 0 : undefined
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                active
                  ? 'bg-blue-600/30 border-blue-500/50 text-blue-100'
                  : 'bg-slate-800/30 border-blue-700/20 text-blue-300/70 hover:text-blue-100'
              }`}
            >
              {tab.label}
              {count !== undefined && <span className="ml-1.5 text-blue-300/50">{count}</span>}
            </button>
          )
        })}
      </div>

      {storeError ? (
        <div className="bg-slate-800/40 border border-red-800/40 rounded-xl p-12 text-center">
          <p className="text-red-300 text-sm">{storeError}</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-slate-800/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-slate-800/40 border border-red-800/40 rounded-xl p-12 text-center">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      ) : recipients.length === 0 ? (
        <div className="bg-slate-800/40 border border-blue-700/20 rounded-xl p-12 text-center">
          <Users className="w-12 h-12 text-blue-300/20 mx-auto mb-4" />
          <p className="text-blue-300/60">No recipients in this filter</p>
          <p className="text-sm text-blue-300/40 mt-1">
            Contacts are added automatically from Shopify carts, abandoned checkouts, orders and customer webhooks.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-blue-700/20 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-blue-300/70 border-b border-blue-700/20">
                  <th className="p-4 font-medium">Recipient</th>
                  <th className="p-4 font-medium">WhatsApp</th>
                  <th className="p-4 font-medium">Consent source</th>
                  <th className="p-4 font-medium">Last seen</th>
                  <th className="p-4 font-medium">Last contact</th>
                  <th className="p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="border-b border-blue-700/10 last:border-0 hover:bg-slate-700/20">
                    <td className="p-4">
                      <div className="font-medium text-white">{recipient.name || 'Unknown'}</div>
                      <div className="text-blue-300/50 text-xs space-y-0.5 mt-1">
                        {recipient.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {recipient.email}
                          </div>
                        )}
                        {recipient.phone && (
                          <div className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {recipient.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${badge(recipient)}`}>
                        {recipient.whatsappStatusLabel}
                      </span>
                    </td>
                    <td className="p-4 text-blue-300/60 text-xs">
                      {recipient.whatsappConsentSource || '—'}
                      {recipient.whatsappConsentAt && (
                        <div className="text-blue-300/40">
                          {new Date(recipient.whatsappConsentAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-blue-300/60 whitespace-nowrap">
                      {recipient.lastSeenAt
                        ? new Date(recipient.lastSeenAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="p-4 text-blue-300/60 text-xs">
                      {recipient.lastContactedAt ? (
                        <>
                          <div>{new Date(recipient.lastContactedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                          <div className="text-blue-300/40 uppercase">{recipient.lastChannel || '—'}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {!recipient.consentWhatsApp && !recipient.suppressed && !recipient.optedOutAt && (
                          <button
                            disabled={busyId === recipient.id || !recipient.phone}
                            onClick={() => act(recipient, 'grant_whatsapp_consent')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Record opt-in
                          </button>
                        )}
                        {!recipient.suppressed && (
                          <button
                            disabled={busyId === recipient.id}
                            onClick={() => act(recipient, 'suppress')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-red-600/20 border border-red-500/30 text-red-200 hover:bg-red-600/30 disabled:opacity-40"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Suppress
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {diagnostics && (
        <p className="text-xs text-blue-300/40">{diagnostics.consentRule}</p>
      )}
    </div>
  )
}
