'use client'

import { useEffect, useState } from 'react'
import { User, Phone, CheckCircle2 } from 'lucide-react'

interface Props {
  cartId: string
  storeId: string
  shop?: string
  defaultName?: string
  defaultPhone?: string
}

export default function CaptureCustomerContact({ cartId, storeId, shop, defaultName, defaultPhone }: Props) {
  const [name, setName] = useState(defaultName || '')
  const [phone, setPhone] = useState(defaultPhone || '')
  const [consentWhatsApp, setConsentWhatsApp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(Boolean(defaultName || defaultPhone))
  const [error, setError] = useState('')

  useEffect(() => {
    setName(defaultName || '')
    setPhone(defaultPhone || '')
  }, [defaultName, defaultPhone])

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim()) {
      setError('Please enter your phone number')
      return
    }
    if (!consentWhatsApp) {
      setError('Please agree to WhatsApp reminders')
      return
    }
    setSaving(true)
    try {
      // 1. Save name + phone to the cart record
      await fetch('/api/carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          cartId,
          customerName: name.trim() || null,
          customerPhone: phone.trim(),
        }),
      })

      // 2. Record explicit WhatsApp consent
      await fetch('/api/recovery/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: shop || '',
          phone: phone.trim(),
          consentWhatsApp: true,
          source: 'storefront_cart',
          cartToken: cartId,
        }),
      })

      setSaved(true)
    } catch (err: any) {
      setError(err?.message || 'Could not save your preference. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <p className="text-blue-200 mb-6 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-blue-400" />
        Thanks <span className="font-semibold">{name.trim() || 'there'}</span> — we&rsquo;ll send you a WhatsApp reminder for your cart.
      </p>
    )
  }

  return (
    <form onSubmit={saveContact} className="space-y-3 mb-6">
      <label className="text-blue-300/70 text-sm font-medium flex items-center gap-2">
        <User className="w-4 h-4" />
        Your details
      </label>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id="customer-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="flex-1 px-4 py-3 rounded-xl bg-slate-700/50 border border-blue-700/30 text-white placeholder-blue-500/40 focus:ring-2 focus:ring-blue-400 outline-none transition-all"
          disabled={saving}
        />
        <input
          id="customer-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 99999 99999"
          className="flex-1 px-4 py-3 rounded-xl bg-slate-700/50 border border-blue-700/30 text-white placeholder-blue-500/40 focus:ring-2 focus:ring-blue-400 outline-none transition-all"
          disabled={saving}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={consentWhatsApp}
          onChange={(e) => setConsentWhatsApp(e.target.checked)}
          disabled={saving}
          className="rounded border-blue-500 bg-slate-700/50 text-blue-500 focus:ring-blue-400"
        />
        <span className="text-blue-300/90 text-sm">
          Yes, send me a WhatsApp reminder for this cart
        </span>
      </label>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving || !phone.trim() || !consentWhatsApp}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-cyan-500/50 active:scale-95"
      >
        {saving ? 'Saving…' : 'Get WhatsApp Reminder'}
      </button>
    </form>
  )
}
