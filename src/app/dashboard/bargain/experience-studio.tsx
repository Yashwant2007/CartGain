'use client'

import { useEffect, useState } from 'react'
import { useResolvedStoreId } from '@/hooks/useResolvedStoreId'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'
import { Sparkles, Save, Eye, RotateCcw, CheckCircle2, History, Bot } from 'lucide-react'
import ShopkeeperStage from '@/components/bargain/ShopkeeperStage'
import StorefrontInvitation from '@/components/bargain/StorefrontInvitation'
import { PERSONALITY_META, DESIGN_VARIANT_META, type AvatarVariant, type BargainExperienceConfig } from '@/lib/bargain/experience/types'
import { V2_AVATARS, V2_CELL_POSITIONS } from '@/lib/bargain/experience/v2-shopkeepers'
import { VRM_AVATARS, isVrmAvatarVariant } from '@/lib/bargain/experience/vrm-shopkeepers'
import {
  expressionForEvent,
  expressionForShopperMessage,
  expressionForTurn,
} from '@/lib/bargain/experience/expressions'
import type { AvatarState } from '@/lib/bargain/experience/avatar-state'
import { gestureFor } from '@/lib/bargain/experience/character'
import { strategyForPersonality } from '@/lib/bargain/experience/strategy'
import type { AvatarPosition } from '@/lib/bargain/experience/positions'

type PublishHistoryRow = {
  id: string
  version: number
  action: 'publish' | 'rollback' | 'defaults'
  publishedBy: string | null
  createdAt: string
  config: BargainExperienceConfig
}

type AvatarOption = {
  id: AvatarVariant
  name: string
  role: string
  accent: string
  initials: string
  sheet?: string
  position?: string
}

const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'robot', name: 'Robot', role: 'Animated 3D', accent: '#22d3ee', initials: '3D' },
  ...(Object.keys(V2_AVATARS) as (keyof typeof V2_AVATARS)[]).map(id => ({
    id,
    name: V2_AVATARS[id].name,
    role: V2_AVATARS[id].motion === 'soft' ? 'Friendly sprite' : V2_AVATARS[id].motion === 'bouncy' ? 'Playful sprite' : 'Strict sprite',
    accent: V2_AVATARS[id].accent,
    initials: V2_AVATARS[id].name.charAt(0),
    sheet: V2_AVATARS[id].expressionSheet,
    position: V2_CELL_POSITIONS.listening,
  })),
  ...(Object.keys(VRM_AVATARS) as (keyof typeof VRM_AVATARS)[]).map(id => ({
    id,
    name: VRM_AVATARS[id].name,
    role: VRM_AVATARS[id].role,
    accent: VRM_AVATARS[id].accent,
    initials: VRM_AVATARS[id].initials,
  })),
]

export function BargainExperienceStudio() {
  const { storeId } = useResolvedStoreId()
  const [exp, setExp] = useState<BargainExperienceConfig | null>(null)
  const [history, setHistory] = useState<PublishHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [previewScenario, setPreviewScenario] = useState<'welcome' | 'lowball' | 'walkout' | 'deal'>('welcome')

  useEffect(() => {
    if (!storeId) return
    const load = async () => {
      setLoading(true)
      try {
        const res = await shopifySessionFetch(`/api/merchant/bargain-experience?storeId=${storeId}`)
        if (res.ok) {
          const data = await res.json()
          setExp(data.experience)
          setHistory(Array.isArray(data.history) ? data.history : [])
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
        body: JSON.stringify({ storeId, action, expectedDraftVersion: exp.draftVersion, ...exp }),
      })
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        if (data.currentDraft) setExp(data.currentDraft)
        setMessage(data.message ?? 'This draft changed in another tab. Reload and try again.')
        return
      }
      if (res.ok) {
        const data = await res.json()
        setExp(data.experience)
        setMessage(action === 'publish' ? 'Published to storefront' : 'Draft saved')
        if (action === 'publish') await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const load = async () => {
    if (!storeId) return
    const res = await shopifySessionFetch(`/api/merchant/bargain-experience?storeId=${storeId}`)
    if (!res.ok) return
    const data = await res.json()
    setExp(data.experience)
    setHistory(Array.isArray(data.history) ? data.history : [])
  }

  const rollback = async (version: number) => {
    if (!storeId) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await shopifySessionFetch('/api/merchant/bargain-experience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, action: 'rollback', version }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage(data.message ?? 'Rollback failed')
        return
      }
      const data = await res.json()
      setExp(data.experience)
      setMessage(`Rolled back to published v${version}`)
      await load()
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
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading || !exp) return <div className="text-blue-300/70 text-sm">Loading experience studio...</div>

  const previewPersona = PERSONALITY_META.find(p => p.id === exp.personality) ?? PERSONALITY_META[0]
  const previewExpression = previewScenario === 'lowball'
    ? expressionForShopperMessage(exp.personality, '₹50 is all I can do.', 1000)
    : previewScenario === 'walkout'
      ? expressionForShopperMessage(exp.personality, 'Forget it, I am leaving.', 1000)
      : previewScenario === 'deal'
        ? expressionForTurn(exp.personality, { decision: 'accept', ended: 'accepted' })
        : expressionForEvent(exp.personality, 'CHAT_OPENED')
  const previewAvatarState: AvatarState = previewScenario === 'lowball'
    ? 'surprised'
    : previewScenario === 'walkout'
      ? 'disappointed'
      : previewScenario === 'deal'
        ? 'celebrating'
        : 'greeting'
  const previewGesture = gestureFor(exp.personality, previewAvatarState)
  const previewPosition: AvatarPosition = 'conversation'
  const previewLine = previewScenario === 'lowball'
    ? 'That is a bold start — let me see what I can do without crossing the floor.'
    : previewScenario === 'walkout'
      ? 'I understand. The door stays open if you change your mind.'
      : previewScenario === 'deal'
        ? 'Deal — that price is yours. Let me get your code ready.'
        : previewPersona.exampleDialogue[0]
  const selectedAvatar = AVATAR_OPTIONS.find(option => option.id === exp.avatarVariant) ?? AVATAR_OPTIONS[0]

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

      <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-medium flex items-center gap-2"><Sparkles className="w-4 h-4 text-cyan-400" /> Storefront avatar</h3>
            <p className="mt-1 text-xs text-blue-300/60">Pick the shopkeeper shoppers see. Personality and pricing rules stay the same; the preview updates instantly.</p>
          </div>
          <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1 text-[11px] font-medium text-cyan-200">{selectedAvatar.name}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {AVATAR_OPTIONS.map(option => {
            const selected = option.id === exp.avatarVariant
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                data-avatar-option={option.id}
                data-avatar-selected={selected ? 'true' : 'false'}
                onClick={() => setExp({ ...exp, avatarVariant: option.id })}
                className={`relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-400/60 ${
                  selected
                    ? 'border-cyan-400/70 bg-cyan-950/30 shadow-[0_0_0_1px_rgba(34,211,238,.22)]'
                    : 'border-blue-800/40 bg-slate-950/40 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-16 items-center justify-center rounded-lg border border-white/5 bg-slate-900/70 sm:h-20"
                  style={option.sheet ? { backgroundImage: `url(${option.sheet})`, backgroundPosition: option.position, backgroundSize: '200% 200%' } : undefined}
                >
                  {option.sheet
                    ? null
                    : option.id === 'robot'
                      ? <Bot className="h-7 w-7" style={{ color: option.accent }} />
                      : <span className="text-xl font-semibold" style={{ color: option.accent }}>{option.initials}</span>}
                </span>
                <span className="mt-2.5 block truncate text-sm font-medium text-white">{option.name}</span>
                <span className="block truncate text-[11px] text-blue-300/60">{option.role}</span>
                {selected && <CheckCircle2 aria-hidden="true" className="absolute right-3 top-3 h-4 w-4 text-cyan-300" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-6 space-y-6">
          <div>
            <h3 className="text-white font-medium mb-3">Shopkeeper Personality</h3>
            <div className="grid gap-3">
              {PERSONALITY_META.map(p => (
                <button key={p.id} onClick={() => { setExp({ ...exp, personality: p.id }); setPreviewScenario('welcome') }}
 className={`p-4 rounded-xl border text-left flex items-start gap-3 transition ${exp.personality === p.id ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-blue-800/40 bg-slate-950/40'}`}>
                  <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-lg font-semibold ${p.id === 'friendly_shopkeeper' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : p.id === 'strict_shopkeeper' ? 'border-sky-400/30 bg-sky-400/10 text-sky-200' : 'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200'}`}>{p.id === 'friendly_shopkeeper' ? '☺' : p.id === 'strict_shopkeeper' ? '◆' : '✦'}</span>
                  <div>
                    <div className="text-white font-medium">{p.name} <span className="text-cyan-300/80 text-xs font-semibold">· {p.title}</span></div>
                    <div className="text-sm text-blue-300/70 mt-1">{p.description}</div>
                    <div className="text-xs text-blue-300/80 mt-2">{p.id === 'friendly_shopkeeper' ? 'Warm, open gestures · reassuring value guidance' : p.id === 'strict_shopkeeper' ? 'Composed posture · direct, respectful negotiation' : 'Expressive reactions · playful, controlled gestures'}</div>
                    <div className="text-xs text-blue-400/60 mt-1">{exp.avatarVariant === 'robot' ? 'Animated robot' : isVrmAvatarVariant(exp.avatarVariant) ? VRM_AVATARS[exp.avatarVariant].name : V2_AVATARS[exp.avatarVariant as keyof typeof V2_AVATARS]?.name ?? 'Animated robot'} · {strategyForPersonality(p.id).label}</div>
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
              <span className="text-blue-100 text-sm">
                Essential motion only
                <span className="block text-[11px] text-blue-300/60">Keeps state changes, drops idle loops, blinking and confetti.</span>
              </span>
              <input type="checkbox" checked={exp.essentialMotionOnly} onChange={e => setExp({ ...exp, essentialMotionOnly: e.target.checked })} className="accent-cyan-500" />
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-white font-medium">Live Preview</h3>
              <p className="mt-1 text-xs text-blue-300/60">
                Watch the selected shopkeeper respond to real bargain scenarios before you publish.
              </p>
            </div>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2 py-1 text-[10px] font-medium text-cyan-200">
              {previewPersona.name}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {exp.avatarEnabled ? (
              <ShopkeeperStage
                personality={exp.personality}
                expression={previewExpression}
                state={previewAvatarState}
                gesture={previewGesture}
                position={previewPosition}
                avatarVariant={exp.avatarVariant}
                characterStyle={exp.characterStyle}
                essentialMotionOnly={exp.essentialMotionOnly}
                name={`${previewPersona.name} · ${previewPersona.title}`}
                status="Preview"
                line={previewLine}
                motionEnabled={exp.motionEnabled}
                enable3D
                showUnavailable
              />
            ) : (
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                Avatar preview is off. Turn on &quot;Avatar enabled&quot; to show the shopkeeper.
              </div>
            )}
            <div className="flex min-h-[150px] items-end justify-end bg-gradient-to-br from-slate-100 to-slate-200 p-6">
              <StorefrontInvitation experience={exp} onOpen={() => {}} preview />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['welcome', 'Say hello'],
              ['lowball', 'Lowball'],
              ['walkout', 'Walkout'],
              ['deal', 'Accept deal'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPreviewScenario(id)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  previewScenario === id
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                    : 'border-blue-800/50 text-blue-300/80 hover:bg-blue-900/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-blue-300/60">
            <span>Draft v{exp.draftVersion} • Published v{exp.publishedVersion}</span>
            <span>Design: {exp.designVariant}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-800/30 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium flex items-center gap-2"><History className="w-4 h-4 text-cyan-400" /> Publish history</h3>
          <span className="text-xs text-blue-300/50">Last {history.length} verified snapshots</span>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-blue-300/60">No published versions yet. Publish this experience to create the first rollback point.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-blue-300/70">
                <tr>
                  <th className="text-left px-3 py-2">Version</th>
                  <th className="text-left px-3 py-2">Action</th>
                  <th className="text-left px-3 py-2">Design</th>
                  <th className="text-left px-3 py-2">Personality</th>
                  <th className="text-left px-3 py-2">Published</th>
                  <th className="text-right px-3 py-2">Restore</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-blue-800/20 text-blue-100">
                    <td className="px-3 py-2 font-mono text-xs">v{row.version}</td>
                    <td className="px-3 py-2 capitalize">{row.action}</td>
                    <td className="px-3 py-2 text-blue-300/70">{row.config.designVariant}</td>
                    <td className="px-3 py-2 text-blue-300/70">{row.config.personality}</td>
                    <td className="px-3 py-2 text-xs text-blue-300/60">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => rollback(row.version)}
                        disabled={saving || row.version === exp.publishedVersion}
                        className="px-2.5 py-1 rounded-md border border-blue-800/50 text-blue-200 text-xs disabled:opacity-40"
                      >
                        {row.version === exp.publishedVersion ? 'Live' : 'Roll back'}
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
  )
}
