'use client'

import { useState } from 'react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-slate-900/50 border border-blue-700/30 rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-6 text-cyan-400">Privacy Policy</h1>
        <p className="text-blue-300/70 mb-4">Last Updated: May 2026</p>

        <div className="space-y-6 text-blue-100/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-2">1. Information We Collect</h2>
            <p>We collect cart data from your Shopify/e-commerce store via webhooks, including customer email, phone numbers, and cart contents, solely for the purpose of recovery.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">2. How We Use Your Data</h2>
            <p>Data is used exclusively to trigger automated recovery messages via WhatsApp, SMS, and Email. We do not sell, rent, or share your customer data with any third parties.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">3. Data Security</h2>
            <p>All data is encrypted at rest and in transit using industry-standard protocols. We implement strict access controls to protect your store data.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-2">4. User Consent</h2>
            <p>By using CartGain, you represent that you have obtained necessary consent from your customers to send recovery notifications in compliance with GDPR, TCPA, and WhatsApp Business policies.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
