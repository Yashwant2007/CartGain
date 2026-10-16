'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export default function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — the code is still visible to copy by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 text-sm text-cyan-200 border border-cyan-500/40 rounded-lg px-3 py-2 hover:border-cyan-400/70 transition-colors"
      aria-label="Copy discount code"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Copied' : 'Copy code'}
    </button>
  )
}
