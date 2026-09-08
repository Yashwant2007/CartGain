import { Shield, Lock, Eye, Database, Globe, Mail, Phone, Sparkles } from 'lucide-react'
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
            Last updated: July 1, 2026
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
                  We design our practices to align with the General Data Protection Regulation (GDPR), India&apos;s Digital Personal Data Protection Act (DPDP Act, 2023), and other applicable data protection laws. Merchants remain responsible for their own compliance, including obtaining any customer consent the applicable law requires before sending messages.
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
                      <li><strong>Payment Information:</strong> Subscription and invoice records (processed via Razorpay once configured; payment card details are processed by Razorpay and are not stored by CartGain). [[NOT RUNTIME-CONFIGURED]]</li>
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
                      <li><strong>Functional Data:</strong> Basic identifiers needed to run the service (for example, IP address and browser/device details in standard server logs).</li>
                      <li><strong>Session Data:</strong> Temporary session identifiers to keep you logged in.</li>
                      <li><strong>Cookies:</strong> We use essential cookies for functionality (such as keeping you logged in). We do not run third-party advertising or analytics trackers that profile visitors.</li>
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
                  <li><strong>Data Minimization:</strong> We collect and process only the minimum personal data required to provide cart recovery value to merchants.</li>
                  <li><strong>Service Delivery:</strong> To provide, maintain, and improve our cart recovery services.</li>
                  <li><strong>Communication:</strong> To send recovery notifications via WhatsApp, SMS, and email on your behalf (the corresponding providers are configured and activated before these channels go live).</li>
                  <li><strong>Analytics:</strong> To track recovery performance and provide insights to merchants.</li>
                  <li><strong>Security:</strong> To detect and prevent fraud, unauthorized access, and security incidents.</li>
                  <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Lock className="w-6 h-6 text-cyan-400" />
                  Merchant Data Controls
                </h2>
                <ul className="list-disc pl-5 space-y-2">
                  <li>We disclose to merchants which data we process and the purpose for each processing activity.</li>
                  <li>We limit the use of merchant and customer data to cart recovery, account administration, support, security, and legal compliance.</li>
                  <li>We maintain retention periods so personal data is not kept longer than needed.</li>
                  <li>We require merchants to accept our Terms of Service, Privacy Policy, and Data Processing Agreement before using the service.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Globe className="w-6 h-6 text-cyan-400" />
                  Data Sharing and Third Parties
                </h2>
                <p className="mb-4">We share data with the following categories of third parties:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>E-commerce Platform:</strong> Shopify, to sync cart, order, and discount data.</li>
                  <li><strong>Communication Providers:</strong> WhatsApp Business API, MSG91 (SMS), Resend (Email) — activated as configured.</li>
                  <li><strong>AI Services:</strong> OpenAI (GPT-4o / GPT-4o-mini) and, as a fallback, Groq (gpt-oss-120b) for AI-powered message generation — customer names and cart product details are processed to generate personalized recovery messages. Per OpenAI&apos;s published API data-usage policy, API inputs and outputs are not used for model training; the same applies to Groq for the OSS model used.</li>
                  <li><strong>Payment Processors:</strong> Razorpay for subscription billing (once configured).</li>
                  <li><strong>Cloud Infrastructure:</strong> Vercel and Supabase for hosting and database.</li>
                  <li><strong>Legal Authorities:</strong> When required by law or to protect our rights.</li>
                </ul>
                <p className="mt-4">
                  Where sub-processor agreements are in place, third parties are bound by data processing terms and must comply with applicable data protection laws. CartGain maintains a sub-processor disclosure listing agreement status for each provider. See our <Link href="/dpa" className="text-cyan-400 hover:underline">Data Processing Agreement</Link> for details.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Globe className="w-6 h-6 text-cyan-400" />
                  International Data Transfers
                </h2>
                <p className="leading-relaxed">
                  Your data may be transferred to and processed in countries other than your own. Where personal data is transferred out of your jurisdiction, we rely on available legal bases (such as the EU Standard Contractual Clauses offered by our providers, or the exemptions available under India&apos;s DPDP Act) and we contractually restrict how sub-processors use the data. [[CONFIRM TRANSFER SAFEGUARDS PER PROVIDER]]
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Database className="w-6 h-6 text-cyan-400" />
                  Data Retention
                </h2>
                <p className="leading-relaxed">
                  We retain your data for as long as your account is active or as needed to provide services. Applied retention limits:
                </p>
                <ul className="list-disc pl-5 space-y-2 mt-3">
                  <li><strong>Cart data:</strong> Customer contact details and cart contents are anonymized 90 days after abandonment.</li>
                  <li><strong>Bargain sessions:</strong> AI negotiation sessions and messages are deleted 90 days after they start.</li>
                  <li><strong>Access logs:</strong> Internal audit logs of data access are deleted after 180 days.</li>
                  <li><strong>Verification tokens:</strong> Password-reset / verification tokens are deleted shortly after expiry.</li>
                  <li><strong>Opt-out / suppression records:</strong> kept for as long as needed to honor your customers&apos; choices.</li>
                </ul>
                <p className="leading-relaxed mt-4">
                  Automated schedules enforce these limits on a daily basis. Data is either irreversibly deleted or anonymized so it can no longer identify a person.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-cyan-400" />
                  Automated Decision-Making
                </h2>
                <p className="leading-relaxed">
                  CartGain&apos;s optional <strong>AI Bargain</strong> feature uses automated decision-making to negotiate product prices with customers. If enabled for your store, the AI may accept, counter, or reject a customer&apos;s offer and generate a discount code — decisions that determine the final purchase price.
                </p>
                <ul className="list-disc pl-5 space-y-2 mt-3">
                  <li><strong>Human override:</strong> You set a floor price, so the AI can never sell below the price you approve.</li>
                  <li><strong>Customer opt-out:</strong> Customers are shown a clear &ldquo;Skip AI, buy at full price&rdquo; option that ends AI negotiation immediately and takes them to normal checkout.</li>
                  <li><strong>Merchant control:</strong> You can disable the AI bargain system entirely at any time from your dashboard.</li>
                </ul>
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
                  To exercise these rights, contact us at <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a>.
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
                  We implement security measures including encryption in transit (TLS/SSL), app-level encryption of sensitive stored values (AES-256-GCM), access controls, rate limiting, audit logging of protected-data access, and provider-managed encryption for data at rest and backups. However, no system is 100% secure, and we cannot guarantee absolute security.
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
                  <p><strong>Email:</strong> <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
                  <p><strong>Legal:</strong> <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
                  <p><strong>Grievance Officer:</strong> <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
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
            &copy; 2026 CartGain. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
