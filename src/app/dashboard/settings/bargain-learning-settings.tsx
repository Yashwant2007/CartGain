'use client'

import { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import { shopifySessionFetch } from '@/lib/shopify-session-fetch'

type BargainLearningForm = {
  enabled: boolean
  shadowMode: boolean
  demoEnabled: boolean
  version: string
  explorationRate: number
  minSamplesPerArm: number
  attributionWindowDays: number
  eventRetentionDays: number
  rewardConversion: number
  rewardMargin: number
  rewardExperience: number
  rewardEfficiency: number
  allowedStrategies: string[]
  blockedStrategies: string[]
  promoStrategyEnabled: boolean
}

type LearningArmStat = {
  environment: string
  strategy: string
  contextKey: string
  strategyVersion: string
  pulls: number
  outcomes: number
  accepted: number
  purchased: number
  rewardSum: number
}

const LEARNING_DEFAULTS: BargainLearningForm = {
  enabled: false,
  shadowMode: true,
  demoEnabled: true,
  version: 'v1',
  explorationRate: 0.15,
  minSamplesPerArm: 30,
  attributionWindowDays: 7,
  eventRetentionDays: 180,
  rewardConversion: 0.4,
  rewardMargin: 0.3,
  rewardExperience: 0.2,
  rewardEfficiency: 0.1,
  allowedStrategies: [],
  blockedStrategies: [],
  promoStrategyEnabled: false,
}

const LEARNING_STRATEGY_LABELS: Record<string, string> = {
  FRIENDLY: 'Friendly and warm',
  VALUE: 'Value first',
  GRADUAL: 'Gradual reciprocal',
  BUDGET_ALTERNATIVE: 'Budget alternative',
  BUNDLE: 'Bundle and complement',
  CONCISE: 'Concise and direct',
  FIRM: 'Respectfully firm',
  PROMO: 'Approved promotion',
}

function learningStrategyName(value: string): string {
  return LEARNING_STRATEGY_LABELS[value] ?? value.replace(/_/g, ' ').toLowerCase()
}

export function BargainLearningSettings({ storeId }: { storeId: string | null }) {
  const [form, setForm] = useState<BargainLearningForm>(LEARNING_DEFAULTS)
  const [configured, setConfigured] = useState(false)
  const [mode, setMode] = useState('baseline')
  const [strategies, setStrategies] = useState<string[]>(Object.keys(LEARNING_STRATEGY_LABELS))
  const [stats, setStats] = useState<LearningArmStat[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [totalOutcomes, setTotalOutcomes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load(signal?: AbortSignal) {
    if (!storeId) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await shopifySessionFetch(
        `/api/merchant/bargain-learning?storeId=${encodeURIComponent(storeId)}`,
        { signal },
      )
      if (!res.ok) throw new Error('Could not load bargain learning')
      const data = await res.json()
      setConfigured(Boolean(data.configured))
      setMode(data.mode ?? 'baseline')
      setStrategies(Array.isArray(data.strategies) ? data.strategies : Object.keys(LEARNING_STRATEGY_LABELS))
      setStats(Array.isArray(data.stats) ? data.stats : [])
      setTotalEvents(Number(data.totalEvents) || 0)
      setTotalOutcomes(Number(data.totalOutcomes) || 0)
      setForm({
        enabled: Boolean(data.enabled),
        shadowMode: data.shadowMode !== false,
        demoEnabled: data.demoEnabled !== false,
        version: data.version ?? LEARNING_DEFAULTS.version,
        explorationRate: Number(data.explorationRate ?? LEARNING_DEFAULTS.explorationRate),
        minSamplesPerArm: Number(data.minSamplesPerArm ?? LEARNING_DEFAULTS.minSamplesPerArm),
        attributionWindowDays: Number(data.attributionWindowDays ?? LEARNING_DEFAULTS.attributionWindowDays),
        eventRetentionDays: Number(data.eventRetentionDays ?? LEARNING_DEFAULTS.eventRetentionDays),
        rewardConversion: Number(data.rewardConversion ?? LEARNING_DEFAULTS.rewardConversion),
        rewardMargin: Number(data.rewardMargin ?? LEARNING_DEFAULTS.rewardMargin),
        rewardExperience: Number(data.rewardExperience ?? LEARNING_DEFAULTS.rewardExperience),
        rewardEfficiency: Number(data.rewardEfficiency ?? LEARNING_DEFAULTS.rewardEfficiency),
        allowedStrategies: Array.isArray(data.allowedStrategies) ? data.allowedStrategies : [],
        blockedStrategies: Array.isArray(data.blockedStrategies) ? data.blockedStrategies : [],
        promoStrategyEnabled: Boolean(data.promoStrategyEnabled),
      })
    } catch (err: any) {
      if (err?.name !== 'AbortError') setLoadError(err?.message || 'Could not load bargain learning')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!storeId) return
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  function toggleStrategy(kind: 'allowedStrategies' | 'blockedStrategies', strategy: string) {
    setForm((prev) => {
      const current = prev[kind]
      const next = current.includes(strategy)
        ? current.filter((item) => item !== strategy)
        : [...current, strategy]
      return { ...prev, [kind]: next }
    })
  }

  async function save() {
    if (!storeId) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await shopifySessionFetch(
        `/api/merchant/bargain-learning?storeId=${encodeURIComponent(storeId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Could not save bargain learning')
      setConfigured(true)
      setMode(!data.enabled ? 'baseline' : data.shadowMode ? 'shadow' : 'active')
      setMessage(
        !data.enabled
          ? 'Saved. Learning is off — negotiations use the existing balanced strategy.'
          : data.shadowMode
            ? 'Saved in shadow mode. A new strategy is chosen but customers still see the existing behaviour.'
            : 'Saved. Learning is active and will guide negotiation style within the same price floor.',
      )
      await load()
    } catch (err: any) {
      setMessage(err?.message || 'Could not save bargain learning')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!storeId) return
    if (!window.confirm('Turn off bargain learning and remove this store\'s learning configuration?')) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await shopifySessionFetch(
        `/api/merchant/bargain-learning?storeId=${encodeURIComponent(storeId)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('Could not reset bargain learning')
      setMessage('Learning configuration removed. The existing negotiation strategy is unchanged.')
      await load()
    } catch (err: any) {
      setMessage(err?.message || 'Could not reset bargain learning')
    } finally {
      setSaving(false)
    }
  }

  const modeLabel = mode === 'active' ? 'Active' : mode === 'shadow' ? 'Shadow' : 'Baseline'

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Brain className="w-5 h-5 text-cyan-300 mt-0.5" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Bargain learning</h2>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  mode === 'active'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : mode === 'shadow'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-blue-700/40 bg-slate-900/40 text-blue-300/70'
                }`}
              >
                {modeLabel}
              </span>
              {!configured && <span className="text-xs text-blue-400/60">Not configured</span>}
            </div>
            <p className="text-sm text-blue-300/80 mt-1">
              Learn which negotiation style works best for your store. Learning changes only tone,
              pacing and approved framing — the hidden price floor, margin rules and customer consent
              are enforced separately and can never be overridden.
            </p>
          </div>
        </div>

        {loadError && <p className="mt-4 text-sm text-red-300/80">{loadError}</p>}
        {loading ? (
          <p className="mt-4 text-sm text-blue-300/80">Loading learning settings...</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <LearningToggle
                label="Enable for live stores"
                hint="Uses matched strategies on real negotiations."
                checked={form.enabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
              <LearningToggle
                label="Shadow mode"
                hint="Pick the candidate, keep current behaviour."
                checked={form.shadowMode}
                onChange={(checked) => setForm((prev) => ({ ...prev, shadowMode: checked }))}
              />
              <LearningToggle
                label="Learn from /demo"
                hint="Uses an isolated demo data partition."
                checked={form.demoEnabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, demoEnabled: checked }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <LearningText
                label="Strategy version"
                value={form.version}
                onChange={(value) => setForm((prev) => ({ ...prev, version: value }))}
                hint="1-32 letters, numbers, dots, dashes or underscores."
              />
              <LearningNumber
                label="Exploration rate"
                value={form.explorationRate}
                onChange={(value) => setForm((prev) => ({ ...prev, explorationRate: value }))}
                step="0.01"
                min={0}
                max={0.5}
                hint="0.15 = 15% of uncertain decisions explore."
              />
              <LearningNumber
                label="Samples before trust"
                value={form.minSamplesPerArm}
                onChange={(value) => setForm((prev) => ({ ...prev, minSamplesPerArm: value }))}
                step="1"
                min={1}
                max={10000}
              />
              <LearningNumber
                label="Attribution window (days)"
                value={form.attributionWindowDays}
                onChange={(value) => setForm((prev) => ({ ...prev, attributionWindowDays: value }))}
                step="1"
                min={1}
                max={30}
              />
              <LearningNumber
                label="Event retention (days)"
                value={form.eventRetentionDays}
                onChange={(value) => setForm((prev) => ({ ...prev, eventRetentionDays: value }))}
                step="1"
                min={7}
                max={730}
              />
            </div>

            <div>
              <p className="block text-sm font-medium text-blue-200 mb-2">Reward weights</p>
              <p className="text-xs text-blue-400/60 mb-3">Relative importance. They are normalized automatically.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <LearningNumber label="Conversion" value={form.rewardConversion} onChange={(value) => setForm((prev) => ({ ...prev, rewardConversion: value }))} step="0.05" min={0} max={1} />
                <LearningNumber label="Margin" value={form.rewardMargin} onChange={(value) => setForm((prev) => ({ ...prev, rewardMargin: value }))} step="0.05" min={0} max={1} />
                <LearningNumber label="Experience" value={form.rewardExperience} onChange={(value) => setForm((prev) => ({ ...prev, rewardExperience: value }))} step="0.05" min={0} max={1} />
                <LearningNumber label="Efficiency" value={form.rewardEfficiency} onChange={(value) => setForm((prev) => ({ ...prev, rewardEfficiency: value }))} step="0.05" min={0} max={1} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StrategyPicker
                label="Allowed strategies"
                hint="Empty means all eligible strategies."
                values={strategies}
                selected={form.allowedStrategies}
                onToggle={(strategy) => toggleStrategy('allowedStrategies', strategy)}
                disabled={form.blockedStrategies}
              />
              <StrategyPicker
                label="Blocked strategies"
                hint="Blocked strategies are never selected."
                values={strategies}
                selected={form.blockedStrategies}
                onToggle={(strategy) => toggleStrategy('blockedStrategies', strategy)}
                disabled={form.allowedStrategies}
              />
            </div>

            <LearningToggle
              label="Allow approved promotion framing"
              hint="Only uses campaign copy you already supplied. The AI never invents codes, deadlines or discounts."
              checked={form.promoStrategyEnabled}
              onChange={(checked) => setForm((prev) => ({ ...prev, promoStrategyEnabled: checked }))}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || !storeId}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 font-semibold text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save learning settings'}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={saving || !storeId}
                className="px-4 py-2 rounded-lg border border-blue-700/40 text-blue-300/80 hover:text-white hover:border-blue-600 disabled:opacity-50 text-sm transition-colors"
              >
                Reset
              </button>
              {message && <p className="text-sm text-blue-300/80">{message}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-white">Learning evidence</h3>
            <p className="text-sm text-blue-300/80 mt-1">
              Aggregated, store-scoped outcomes. No conversation text is stored in learning data.
            </p>
          </div>
          <p className="text-xs text-blue-400/60">
            {totalEvents} events · {totalOutcomes} outcomes
          </p>
        </div>
        {stats.length === 0 ? (
          <p className="mt-4 text-sm text-blue-300/70">
            No strategy evidence yet. Enrol live traffic or use the demo to collect outcomes.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-blue-300/60 border-b border-blue-700/30">
                  <th className="py-2 pr-4 font-medium">Strategy</th>
                  <th className="py-2 pr-4 font-medium">Source</th>
                  <th className="py-2 pr-4 font-medium">Context</th>
                  <th className="py-2 pr-4 font-medium text-right">Pulls</th>
                  <th className="py-2 pr-4 font-medium text-right">Outcomes</th>
                  <th className="py-2 pr-4 font-medium text-right">Accepted</th>
                  <th className="py-2 pr-4 font-medium text-right">Purchased</th>
                  <th className="py-2 font-medium text-right">Avg reward</th>
                </tr>
              </thead>
              <tbody>
                {stats.slice(0, 20).map((row, index) => (
                  <tr
                    key={`${row.environment}-${row.contextKey}-${row.strategy}-${index}`}
                    className="border-b border-blue-700/20 last:border-0"
                  >
                    <td className="py-2 pr-4 text-white">{learningStrategyName(row.strategy)}</td>
                    <td className="py-2 pr-4 text-blue-300/70 capitalize">{row.environment}</td>
                    <td className="py-2 pr-4 text-blue-300/60 font-mono text-xs">{row.contextKey}</td>
                    <td className="py-2 pr-4 text-right text-blue-200">{row.pulls}</td>
                    <td className="py-2 pr-4 text-right text-blue-200">{row.outcomes}</td>
                    <td className="py-2 pr-4 text-right text-blue-200">{row.accepted}</td>
                    <td className="py-2 pr-4 text-right text-blue-200">{row.purchased}</td>
                    <td className="py-2 text-right text-blue-200">
                      {row.outcomes > 0 ? (row.rewardSum / row.outcomes).toFixed(2) : '—'}
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

function LearningToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-blue-700/30 bg-slate-900/30 p-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 accent-cyan-400"
      />
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-blue-400/60 mt-0.5">{hint}</span>
      </span>
    </label>
  )
}

function LearningText({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-blue-200 mb-2">{label}</label>
      <input
        type="text"
        value={value}
        maxLength={32}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-slate-900/60 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
      />
      {hint && <p className="text-xs text-blue-400/60 mt-1">{hint}</p>}
    </div>
  )
}

function LearningNumber({
  label,
  value,
  onChange,
  step,
  min,
  max,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step: string
  min: number
  max: number
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-blue-200 mb-2">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full bg-slate-900/60 border border-blue-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
      />
      {hint && <p className="text-xs text-blue-400/60 mt-1">{hint}</p>}
    </div>
  )
}

function StrategyPicker({
  label,
  hint,
  values,
  selected,
  onToggle,
  disabled,
}: {
  label: string
  hint: string
  values: string[]
  selected: string[]
  onToggle: (value: string) => void
  disabled: string[]
}) {
  return (
    <div>
      <p className="text-sm font-medium text-blue-200">{label}</p>
      <p className="text-xs text-blue-400/60 mt-1 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((strategy) => (
          <button
            key={strategy}
            type="button"
            onClick={() => onToggle(strategy)}
            className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
              selected.includes(strategy)
                ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200'
                : disabled.includes(strategy)
                  ? 'border-blue-700/20 text-blue-500/40'
                  : 'border-blue-700/40 text-blue-300/70 hover:border-blue-600'
            }`}
          >
            {learningStrategyName(strategy)}
          </button>
        ))}
      </div>
    </div>
  )
}
