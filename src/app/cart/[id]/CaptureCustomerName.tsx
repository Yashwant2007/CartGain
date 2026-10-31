'use client'

import { useState } from 'react'
import { User } from 'lucide-react'

interface Props {
  cartId: string
  storeId: string
}

export default function CaptureCustomerName({ cartId, storeId }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          cartId,
          customerName: name.trim(),
        }),
      })
      if (res.ok) {
        setSaved(true)
      }
    } catch {
      // best effort — name capture should never block the checkout flow
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <p className="text-blue-200 mb-6 flex items-center gap-2">
        <User className="w-4 h-4" />
        Hi <span className="font-semibold">{name.trim()}</span>, these items are still waiting for you!
      </p>
    )
  }

  return (
    <form onSubmit={saveName} className="flex gap-2 mb-6">
      <label className="text-blue-300/70 text-sm" htmlFor="customer-name">
        What should we call you?
      </label>
      <input
        id="customer-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700/50 border border-blue-700/30 text-white placeholder-blue-500/40 focus:ring-2 focus:ring-blue-400 outline-none transition-all"
        disabled={saving}
      />
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-cyan-500/50 active:scale-95"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
