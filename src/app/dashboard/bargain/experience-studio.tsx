'use client'

import { useEffect, useState } from 'react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import { Sparkles, Save, Eye, RotateCcw, CheckCircle2 } from 'lucide-react'
import ShopkeeperAvatar from '@/components/bargain/ShopkeeperAvatar'
import StorefrontInvitation from '@/components/bargain/StorefrontInvitation'
import { PERSONALITY_META, DESIGN_VARIANT_META, type BargainExperienceConfig } from '@/lib/bargain/experience/types'

export function BargainExperienceStudio() {
  const { storeId } = useResolvedStoreId()
  const [exp, setExp] = useState<BargainExperienceConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!storeId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await shopifySessionFetch(`/api/merchant/bargain-experience?storeId=${storeId}`)
        if (res.ok) {
          const data = await res.json()
          setExp(data.experience)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [storeId])

  const save = async (action: 'draft' | 'publish' = 'draft') => {
    if (!storeId || !exp) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await shopifySessionFetch('/api/merchant/bargain-experience', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, action, ...exp }),
      })
      if (res.ok) {
        const data = await res.json()
        setExp(data.experience)
        setMessage(action === 'publish' ? 'Published to storefront' : 'Draft saved')
      }
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!storeId) return
    setSaving(true)
    try {
      const res = await shopifySessionFetch('/api/merchant/bargain-experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      if (res.ok) {
        const data = await res.json()
        setExp(data.experience)
        setMessage('Restored defaults')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !exp) return <div className="text-blue-300/70 text-sm">Loading experience studio...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" /> Bargain Experience Studio</h2>
          <p className="text-sm text-blue-300/70 mt-1">Configure shopkeeper personality, avatar reactions, and storefront invitation designs</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} disabled={saving} className="px-3 py-2 rounded-lg border border-blue-800/40 text-blue-200 text-sm flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Restore defaults</button>
          <button onClick={() => save('draft')} disabled={saving} className="px-3 py-2 rounded-lg border border-blue-800/40 text-blue-200 text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Save draft</button>
          <button onClick={() => save('publish')} disabled={saving} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm flex items-center gap-2"><Eye className="w-4 h-4" /> Publish</button>
        </div>
      </div>
      {message && <div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle2 className="w-4 h-4" /> {message}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-6 space-y-6">
          <div>
            <h3 className="text-white font-medium mb-3">Shopkeeper Personality</h3>
            <div className="grid gap-3">
              {PERSONALITY_META.map(p => (
                <button key={p.id} onClick={() => setExp({ ...exp, personality: p.id })} className={`p-4 rounded-xl border text-left flex items-start gap-3 transition ${exp.personality === p.id ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-blue-800/40 bg-slate-950/40'}`}>
                  <ShopkeeperAvatar personality={p.id} expression={exp.personality === p.id ? 'listening' : 'idle'} size="md" motionEnabled={exp.motionEnabled} />
                  <div>
                    <div className="text-white font-medium">{p.name}</div>
                    <div className="text-sm text-blue-300/70 mt-1">{p.description}</div>
                    <div className="text-xs text-blue-400/60 mt-2 italic">&ldquo;{p.exampleDialogue[0]}&rdquo;</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-medium mb-3">Storefront Invitation Design</h3>
            <div className="grid gap-3">
              {DESIGN_VARIANT_META.map(d => (
                <button key={d.id} onClick={() => setExp({ ...exp, designVariant: d.id })} className={`p-4 rounded-xl border text-left transition ${exp.designVariant === d.id ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-blue-800/40 bg-slate-950/40'}`}>
                  <div className="text-white font-medium">{d.name}</div>
                  <div className="text-sm text-blue-300/70 mt-1">{d.positioning}</div>
                  <div className="text-xs text-blue-400/60 mt-2">CTA: {d.defaultCta} • Copy: {d.defaultCopy}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="text-blue-100 text-sm">Avatar enabled</span>
              <input type="checkbox" checked={exp.avatarEnabled} onChange={e => setExp({ ...exp, avatarEnabled: e.target.checked })} className="accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="text-blue-100 text-sm">Motion enabled</span>
              <input type="checkbox" checked={exp.motionEnabled} onChange={e => setExp({ ...exp, motionEnabled: e.target.checked })} className="accent-cyan-500" />
            </label>
            <label className="flex items-center justify-between p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="text-blue-100 text-sm">Compact invitation</span>
              <input type="checkbox" checked={exp.compact} onChange={e => setExp({ ...exp, compact: e.target.checked })} className="accent-cyan-500" />
            </label>
            <label className="p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="block text-blue-100 text-sm mb-2">Avatar size</span>
              <select value={exp.avatarSize} onChange={e => setExp({ ...exp, avatarSize: e.target.value as typeof exp.avatarSize })} className="w-full rounded-md bg-slate-900 border border-blue-800/50 px-2 py-1.5 text-sm text-blue-100">
                <option value="sm">Small</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
              </select>
            </label>
            <label className="p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="block text-blue-100 text-sm mb-2">Invitation copy</span>
              <input value={exp.customGreeting ?? ''} maxLength={280} placeholder="Use design default" onChange={e => setExp({ ...exp, customGreeting: e.target.value || null })} className="w-full rounded-md bg-slate-900 border border-blue-800/50 px-2 py-1.5 text-sm text-blue-100 placeholder:text-blue-400/40" />
            </label>
            <label className="p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="block text-blue-100 text-sm mb-2">CTA label</span>
              <input value={exp.ctaLabel ?? ''} maxLength={40} placeholder="Use design default" onChange={e => setExp({ ...exp, ctaLabel: e.target.value || null })} className="w-full rounded-md bg-slate-900 border border-blue-800/50 px-2 py-1.5 text-sm text-blue-100 placeholder:text-blue-400/40" />
            </label>
            <label className="p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="block text-blue-100 text-sm mb-2">Accent color</span>
              <input type="color" value={exp.accentColor ?? '#4f46e5'} onChange={e => setExp({ ...exp, accentColor: e.target.value })} className="w-full h-9 rounded-md bg-slate-900 border border-blue-800/50 px-1" />
            </label>
            <label className="p-3 rounded-xl border border-blue-800/40 bg-slate-950/40">
              <span className="block text-blue-100 text-sm mb-2">Position</span>
              <select value={exp.position} onChange={e => setExp({ ...exp, position: e.target.value as typeof exp.position })} className="w-full rounded-md bg-slate-900 border border-blue-800/50 px-2 py-1.5 text-sm text-blue-100">
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="inline">Inline</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-6 space-y-4">
          <h3 className="text-white font-medium">Live Preview</h3>
          <div className="rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 p-6 min-h-[200px] flex items-end justify-end">
            <StorefrontInvitation experience={exp} onOpen={() => {}} />
          </div>
          <div className="flex items-center justify-between text-xs text-blue-300/60">
            <span>Draft v{exp.draftVersion} • Published v{exp.publishedVersion}</span>
            <span>Personality: {exp.personality} • Design: {exp.designVariant}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
