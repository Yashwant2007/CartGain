'use client'

import { useEffect, useState } from 'react'
import { User, Phone, Mail, CheckCircle2, ArrowRight } from 'lucide-react'

interface Props {
  cartId: string
  shop?: string
  defaultName?: string
  defaultPhone?: string
  defaultEmail?: string
}

export default function CaptureCustomerContact({ cartId, shop, defaultName, defaultPhone, defaultEmail }: Props) {
  const [name, setName] = useState(defaultName || '')
  const [phone, setPhone] = useState(defaultPhone || '')
  const [email, setEmail] = useState(defaultEmail || '')
  const [isWhatsAppConsentChecked, setIsWhatsAppConsentChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(Boolean(defaultName || defaultPhone || defaultEmail))
  const [error, setError] = useState('')

  useEffect(() => {
    setName(defaultName || '')
    setPhone(defaultPhone || '')
    setEmail(defaultEmail || '')
  }, [defaultName, defaultPhone, defaultEmail])

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const hasName = Boolean(name.trim())
      const hasPhone = Boolean(phone.trim())
      const hasEmail = Boolean(email.trim())

      if (!hasName && !hasPhone && !hasEmail) {
        setError('Please enter your name, email, or phone number')
        return
      }

      // Email consent is automatic if email is provided (it's already on the cart
      // from Shopify checkout). WhatsApp consent is explicit and optional.
      const consentEmail = hasEmail
      const consentWhatsApp = hasPhone && isWhatsAppConsentChecked

      // If only phone is provided (no email), WhatsApp consent is required to save
      if (hasPhone && !hasEmail && !isWhatsAppConsentChecked) {
        setError('Please agree to WhatsApp reminders to save your phone number')
        return
      }

      const response = await fetch('/api/recovery/opt-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shop: shop || '',
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          consentEmail,
          consentWhatsApp,
          source: 'storefront_cart',
          cartToken: cartId,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Could not save your details. Please try again.')
      }

      setSaved(true)
    } catch (err: any) {
      setError(err?.message || 'Could not save your details. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Thanks, {name.trim() || 'there'}!</h3>
        <p className="text-blue-300/70 text-sm mb-6 max-w-md">
          We&rsquo;ve saved your details. You&rsquo;ll receive a WhatsApp reminder for this cart.
        </p>
        <button
          onClick={() => setSaved(false)}
          className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-4"
        >
          Edit details
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={saveContact} className="space-y-4 max-w-md mx-auto">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center mb-3">
          <User className="w-5 h-5 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Complete your details</h2>
        <p className="text-blue-300/70 text-sm mt-2">
          Enter your name and phone so we can send you a WhatsApp reminder for this cart.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex flex-col gap-1.5 text-sm text-blue-300/80 font-medium">
          <span className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Full name
          </span>
          <input
            id="customer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya Sharma"
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-blue-700/30 text-white placeholder-blue-500/40 focus:ring-2 focus:ring-blue-400 outline-none transition-all disabled:opacity-50"
            disabled={saving}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-blue-300/80 font-medium">
          <span className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Phone number
          </span>
          <input
            id="customer-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 99999 99999"
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-blue-700/30 text-white placeholder-blue-500/40 focus:ring-2 focus:ring-blue-400 outline-none transition-all disabled:opacity-50"
            disabled={saving}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-blue-300/80 font-medium">
          <span className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email address <span className="text-blue-500/60 text-xs">(optional)</span>
          </span>
          <input
            id="customer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@example.com"
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-blue-700/30 text-white placeholder-blue-500/40 focus:ring-2 focus:ring-blue-400 outline-none transition-all disabled:opacity-50"
            disabled={saving}
          />
        </label>

        <label className="flex items-center gap-3 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={isWhatsAppConsentChecked}
            onChange={(e) => setIsWhatsAppConsentChecked(e.target.checked)}
            disabled={saving}
            className="w-5 h-5 rounded border-blue-500 bg-slate-700/50 text-blue-500 focus:ring-blue-400 accent-blue-500"
          />
          <span className="text-sm text-blue-300/90 group-hover:text-blue-300 transition-colors">
            Yes, send me WhatsApp reminders for this cart
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-400 flex items-center gap-2">
            <span className="w-4 h-4">⚠️</span>
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={
          saving ||
          (!name.trim() && !phone.trim() && !email.trim()) ||
          (!!phone.trim() && !email.trim() && !isWhatsAppConsentChecked)
        }
        className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-cyan-500/50 active:scale-95 flex items-center justify-center gap-2"
      >
        <ArrowRight className="w-5 h-5" />
        {saving ? 'Saving…' : 'Save my details'}
      </button>
    </form>
  )
}
