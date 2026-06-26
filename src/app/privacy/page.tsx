import { Shield, Lock, Eye, Database, Globe, Mail, Phone } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy - CartGain',
  description: 'CartGain Privacy Policy - How we collect, use, and protect your data in compliance with GDPR, India DPDP Act, and global standards.',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto">
            Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-8 backdrop-blur-sm">
          <div className="prose prose-invert max-w-none">
            <div className="space-y-8 text-blue-100">
              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Lock className="w-6 h-6 text-cyan-400" />
                  Introduction
                </h2>
                <p className="leading-relaxed">
                  CartGain (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our cart recovery platform for e-commerce businesses.
                </p>
                <p className="leading-relaxed mt-4">
                  We comply with the General Data Protection Regulation (GDPR), India&apos;s Digital Personal Data Protection Act (DPDP Act, 2023), and other applicable data protection laws.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Eye className="w-6 h-6 text-cyan-400" />
                  Information We Collect
                </h2>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">1. Personal Data</h3>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Account Information:</strong> Name, email address, phone number, company name, and password when you create an account.</li>
                      <li><strong>Payment Information:</strong> Credit card details, billing address, and transaction history (processed securely via Razorpay).</li>
                      <li><strong>Communication Data:</strong> Messages you send us via support, chat, or email.</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">2. Business Data</h3>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Store Information:</strong> E-commerce platform details, store URL, and API credentials.</li>
                      <li><strong>Customer Data:</strong> Abandoned cart information including customer names, emails, phone numbers, and cart contents.</li>
                      <li><strong>Analytics Data:</strong> Recovery rates, conversion metrics, and campaign performance.</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">3. Automatically Collected Data</h3>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and interaction patterns.</li>
                      <li><strong>Device Data:</strong> IP address, browser type, operating system, and device information.</li>
                      <li><strong>Cookies:</strong> We use essential cookies for functionality and analytics cookies (with your consent).</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Database className="w-6 h-6 text-cyan-400" />
                  How We Use Your Data
                </h2>
                <p className="mb-4">We process your data for the following purposes:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Service Delivery:</strong> To provide, maintain, and improve our cart recovery services.</li>
                  <li><strong>Communication:</strong> To send recovery notifications via WhatsApp, SMS, and email on your behalf.</li>
                  <li><strong>Analytics:</strong> To track recovery performance and provide insights.</li>
                  <li><strong>Security:</strong> To detect and prevent fraud, unauthorized access, and security incidents.</li>
                  <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations.</li>
                  <li><strong>Marketing:</strong> With your consent, to send promotional communications about new features or offers.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Globe className="w-6 h-6 text-cyan-400" />
                  Data Sharing and Third Parties
                </h2>
                <p className="mb-4">We share data with the following categories of third parties:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>E-commerce Platforms:</strong> Shopify, WooCommerce, etc., to sync cart data.</li>
                  <li><strong>Communication Providers:</strong> WhatsApp Business API, MSG91 (SMS), Resend (Email).</li>
                  <li><strong>AI Services:</strong> OpenAI (GPT-4o-mini) for AI-powered message generation — customer names and cart product details are processed to generate personalized recovery messages. OpenAI does not use API data for training.</li>
                  <li><strong>Payment Processors:</strong> Razorpay for secure payment processing.</li>
                  <li><strong>Cloud Infrastructure:</strong> Vercel and Supabase for hosting and database.</li>
                  <li><strong>Analytics Tools:</strong> Google Analytics (anonymized data only).</li>
                  <li><strong>Legal Authorities:</strong> When required by law or to protect our rights.</li>
                </ul>
                <p className="mt-4">
                  All third parties are bound by data processing agreements and must comply with applicable data protection laws. See our <Link href="/dpa" className="text-cyan-400 hover:underline">Data Processing Agreement</Link> for details.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Globe className="w-6 h-6 text-cyan-400" />
                  International Data Transfers
                </h2>
                <p className="leading-relaxed">
                  Your data may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place, including Standard Contractual Clauses (SCCs) for EU data and compliance with India&apos;s DPDP Act for Indian data.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Database className="w-6 h-6 text-cyan-400" />
                  Data Retention
                </h2>
                <p className="leading-relaxed">
                  We retain your data for as long as your account is active or as needed to provide services. After account termination, we retain data for up to 90 days for backup purposes, then securely delete or anonymize it, unless required by law to retain longer.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Shield className="w-6 h-6 text-cyan-400" />
                  Your Data Protection Rights
                </h2>
                <p className="mb-4">Depending on your location, you have the following rights:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Access:</strong> Request a copy of your personal data.</li>
                  <li><strong>Rectification:</strong> Correct inaccurate or incomplete data.</li>
                  <li><strong>Erasure:</strong> Request deletion of your data (&ldquo;right to be forgotten&rdquo;).</li>
                  <li><strong>Restriction:</strong> Limit how we process your data.</li>
                  <li><strong>Data Portability:</strong> Receive your data in a structured, machine-readable format.</li>
                  <li><strong>Objection:</strong> Object to certain processing activities.</li>
                  <li><strong>Withdraw Consent:</strong> Withdraw consent at any time (where processing is consent-based).</li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, contact us at <a href="mailto:CartGain192007@gmail.com" className="text-cyan-400 hover:underline">CartGain192007@gmail.com</a>.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Phone className="w-6 h-6 text-cyan-400" />
                  SMS and WhatsApp Communications (TCPA Compliance)
                </h2>
                <div className="bg-blue-900/30 border border-blue-700/40 rounded-lg p-6">
                  <p className="font-semibold text-white mb-3">By using CartGain, you agree to the following:</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Consent:</strong> You confirm that you have obtained explicit consent from your customers to receive SMS and WhatsApp messages on your behalf.</li>
                    <li><strong>Opt-out:</strong> All messages include clear instructions to opt-out (e.g., &ldquo;Reply STOP to unsubscribe&rdquo;).</li>
                    <li><strong>Message Frequency:</strong> Messages are sent based on cart abandonment events, not exceeding reasonable frequency.</li>
                    <li><strong>Message &amp; Data Rates:</strong> Standard messaging and data rates may apply to recipients.</li>
                    <li><strong>Support:</strong> For help, recipients can reply &ldquo;HELP&rdquo; or contact your support team.</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Lock className="w-6 h-6 text-cyan-400" />
                  Data Security
                </h2>
                <p className="leading-relaxed">
                  We implement industry-standard security measures including encryption in transit (TLS/SSL), encryption at rest, access controls, regular security audits, and employee training. However, no system is 100% secure, and we cannot guarantee absolute security.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Shield className="w-6 h-6 text-cyan-400" />
                  Children&apos;s Privacy
                </h2>
                <p className="leading-relaxed">
                  Our services are not directed to individuals under 18. We do not knowingly collect personal data from children. If you believe we have collected data from a child, please contact us immediately.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Eye className="w-6 h-6 text-cyan-400" />
                  Changes to This Policy
                </h2>
                <p className="leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of material changes via email or prominent notice on our website. Continued use after changes constitutes acceptance.
                </p>
              </section>

              <section className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/40 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Mail className="w-6 h-6 text-cyan-400" />
                  Contact Us
                </h2>
                <p className="mb-4">If you have questions about this Privacy Policy or our data practices:</p>
                <div className="space-y-2">
                  <p><strong>Email:</strong> <a href="mailto:CartGain192007@gmail.com" className="text-cyan-400 hover:underline">CartGain192007@gmail.com</a></p>
                  <p><strong>Legal:</strong> <a href="mailto:CartGain192007@gmail.com" className="text-cyan-400 hover:underline">CartGain192007@gmail.com</a></p>
                  <p><strong>Grievance Officer:</strong> <a href="mailto:CartGain192007@gmail.com" className="text-cyan-400 hover:underline">CartGain192007@gmail.com</a></p>
                  <p><strong>Address:</strong> Street No. 3, Line Par, Shanker Garden, Bahadurgarh, Haryana - 124507</p>
                  <p className="mt-3"><Link href="/dpa" className="text-cyan-400 hover:underline">View our Data Processing Agreement (DPA) &rarr;</Link></p>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="flex justify-center gap-6 text-sm text-blue-300">
            <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
            <span>&bull;</span>
            <Link href="/dpa" className="hover:text-white transition">DPA</Link>
            <span>&bull;</span>
            <Link href="/" className="hover:text-white transition">Home</Link>
          </div>
          <p className="mt-4 text-xs text-blue-400/60">
            &copy; {new Date().getFullYear()} CartGain. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
