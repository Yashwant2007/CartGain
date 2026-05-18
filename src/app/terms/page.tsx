'use client'

import { useState } from 'react'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-slate-900/50 border border-blue-700/30 rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-6 text-cyan-400">Terms of Service</h1>
        <p className="text-blue-300/70 mb-4">Last Updated: May 2026</p>

        <div className="space-y-6 text-blue-100/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">1. Service Agreement</h2>
            <p>CartGain provides automated cart recovery software. By signing up, you agree to these terms and our privacy policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">2. Pricing & Payments</h2>
            <p>We operate on a Free Trial followed by a Pro Plan. Billing is handled via Razorpay. All fees are non-refundable except as required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">3. Compliance & Responsibility</h2>
            <p>You are solely responsible for ensuring that your use of SMS and WhatsApp messaging complies with local laws (e.g., TCPA in US, TRAI in India).</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">4. Limitation of Liability</h2>
            <p>CartGain is provided "as-is". We are not liable for any loss of revenue or business interruption resulting from the use of our software.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
