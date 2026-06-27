import { FileText, Shield, CreditCard, Smartphone, AlertTriangle, Scale, Mail, Ban, Lock, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service - CartGain',
  description: 'CartGain Terms of Service - Terms governing the use of our cart recovery platform, including billing, compliance, and legal agreements.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <FileText className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto">
            Last updated: {new Date().toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-8 backdrop-blur-sm">
          <div className="space-y-8 text-blue-100">

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Shield className="w-6 h-6 text-cyan-400" />
                1. Acceptance of Terms
              </h2>
              <p className="leading-relaxed">
                By accessing or using CartGain (&ldquo;the Platform,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the Platform. These Terms apply to all users, including merchants, their employees, and any party accessing the Platform on behalf of a merchant.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <RefreshCw className="w-6 h-6 text-cyan-400" />
                2. Description of Service
              </h2>
              <p className="leading-relaxed">
                CartGain provides an automated abandoned cart recovery platform that helps e-commerce businesses recover lost sales through multi-channel communication (email, SMS, WhatsApp). The Platform integrates with e-commerce platforms such as Shopify to detect abandoned carts and send recovery messages on behalf of the merchant.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Shield className="w-6 h-6 text-cyan-400" />
                3. Account Registration &amp; Security
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>You must provide accurate, current, and complete information during registration.</li>
                <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                <li>You are responsible for all activities that occur under your account.</li>
                <li>You must notify us immediately of any unauthorized use of your account.</li>
                <li>We reserve the right to refuse service, terminate accounts, or remove content at our sole discretion.</li>
                <li>You must be at least 18 years old to use the Platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-cyan-400" />
                4. Free Trial &amp; Paid Plans
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Free Trial:</strong> New users receive a free trial covering the first 50 recovered carts. No payment information is required during the trial period.</li>
                <li><strong>Plan Selection:</strong> After the free trial, you must select a paid plan (Starter, Growth, or Pro) to continue using the service.</li>
                <li><strong>Plan Limits:</strong> Each plan has a maximum cart processing limit per month. Exceeding this limit may result in additional charges or service throttling.</li>
                <li><strong>Plan Changes:</strong> You may upgrade your plan at any time. Downgrades take effect at the end of the current billing period.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-cyan-400" />
                5. Fees, Payments &amp; Renewals
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Subscription Fees:</strong> Paid plans are billed monthly or annually as selected at checkout. All fees are in Indian Rupees (INR) unless otherwise stated.</li>
                <li><strong>Revenue Share:</strong> In addition to the subscription fee, a revenue share percentage applies to recovered revenue after the first 50 free carts. Rates: Starter 3%, Growth 2.5%, Pro 2%.</li>
                <li><strong>Payment Processor:</strong> All payments are processed securely through Razorpay. We do not store your full payment card details.</li>
                <li><strong>Auto-Renewal:</strong> Subscriptions automatically renew at the end of each billing period unless cancelled before the renewal date.</li>
                <li><strong>Refunds:</strong> Subscription fees are non-refundable except as required by applicable law. Revenue share fees, once calculated, are final.</li>
                <li><strong>Taxes:</strong> You are responsible for all applicable taxes, including GST, VAT, or similar transaction taxes.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Smartphone className="w-6 h-6 text-cyan-400" />
                6. SMS, WhatsApp &amp; Email Compliance
              </h2>
              <p className="leading-relaxed mb-4">
                CartGain sends recovery messages via email, SMS, and WhatsApp on behalf of merchants. By using these channels, you agree to:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Consent:</strong> You have obtained explicit, verifiable consent from your customers before sending them SMS or WhatsApp messages. Consent must be documented and maintained for compliance purposes.</li>
                <li><strong>TCPA Compliance (US):</strong> You comply with the Telephone Consumer Protection Act, including maintaining opt-in records, honoring opt-out requests within 24 hours, and not sending messages to numbers on the National Do Not Call Registry.</li>
                <li><strong>TRAI Compliance (India):</strong> You comply with Telecom Regulatory Authority of India regulations, including DLT registration for SMS headers and content templates where applicable.</li>
                <li><strong>GDPR Compliance (EU):</strong> You have a lawful basis for processing customer data and have provided clear privacy notices to your customers.</li>
                <li><strong>Opt-Out:</strong> All SMS and WhatsApp messages include a clear, working opt-out mechanism (e.g., &ldquo;Reply STOP to unsubscribe&rdquo;). You must honor opt-out requests immediately.</li>
                <li><strong>Message Frequency:</strong> You will not send excessive messages. CartGain&apos;s default settings include reasonable frequency limits.</li>
                <li><strong>Indemnification:</strong> You agree to indemnify and hold CartGain harmless from any claims, damages, or fines arising from your non-compliance with messaging regulations.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Lock className="w-6 h-6 text-cyan-400" />
                7. Customer Data &amp; Privacy
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>You retain full ownership of your customer data. CartGain acts as a data processor on your behalf.</li>
                <li>We process customer data only for the purpose of providing cart recovery services.</li>
                <li>We implement industry-standard security measures to protect all data.</li>
                <li>We do not sell your customer data to third parties.</li>
                <li>Upon termination, you may request deletion of your data within 90 days.</li>
                <li>Our data processing practices are detailed in our <Link href="/dpa" className="text-cyan-400 hover:underline">Data Processing Agreement (DPA)</Link> and <Link href="/privacy" className="text-cyan-400 hover:underline">Privacy Policy</Link>.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Ban className="w-6 h-6 text-cyan-400" />
                8. Acceptable Use
              </h2>
              <p className="mb-4">You agree not to use the Platform for:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Any unlawful purpose or in violation of any applicable laws or regulations.</li>
                <li>Sending spam, unsolicited messages, or messages without proper consent.</li>
                <li>Transmitting malicious code, viruses, or harmful content.</li>
                <li>Infringing on intellectual property rights of others.</li>
                <li>Interfering with or disrupting the integrity or performance of the Platform.</li>
                <li>Attempting to gain unauthorized access to any part of the Platform.</li>
                <li>Using the Platform for any purpose other than legitimate cart recovery.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Shield className="w-6 h-6 text-cyan-400" />
                9. Intellectual Property
              </h2>
              <p className="leading-relaxed">
                The Platform, including its code, design, logos, and content, is owned by CartGain and protected by applicable intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Platform for your business purposes. You may not copy, modify, distribute, sell, or reverse-engineer any part of the Platform without our prior written consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-cyan-400" />
                10. Limitation of Liability
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, either express or implied.</li>
                <li>We do not guarantee that the Platform will be uninterrupted, error-free, or secure at all times.</li>
                <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform.</li>
                <li>Our total liability for any claim arising from these Terms shall not exceed the total fees paid by you in the 12 months preceding the claim.</li>
                <li>We are not responsible for any loss of revenue, business interruption, or damage resulting from service downtime, data loss, or failed message delivery.</li>
                <li>Some jurisdictions do not allow certain limitations of liability, so these limitations may not apply to you.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Scale className="w-6 h-6 text-cyan-400" />
                11. Indemnification
              </h2>
              <p className="leading-relaxed">
                You agree to indemnify, defend, and hold harmless CartGain, its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses (including legal fees) arising from:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Your use of the Platform in violation of these Terms.</li>
                <li>Your violation of any applicable law or regulation, including messaging and data protection laws.</li>
                <li>Any content or data you submit to the Platform.</li>
                <li>Any disputes between you and your customers regarding messages sent through the Platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Ban className="w-6 h-6 text-cyan-400" />
                12. Termination
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>By You:</strong> You may cancel your account at any time from your dashboard. The cancellation takes effect at the end of the current billing period.</li>
                <li><strong>By Us:</strong> We may suspend or terminate your account immediately for violation of these Terms, illegal activity, or non-payment.</li>
                <li><strong>Effect:</strong> Upon termination, your access to the Platform ceases. We will retain your data for 90 days for backup purposes, after which it will be deleted.</li>
                <li><strong>Survival:</strong> Sections 6 (Compliance), 7 (Data &amp; Privacy), 10 (Liability), 11 (Indemnification), and 14 (Disputes) survive termination.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Scale className="w-6 h-6 text-cyan-400" />
                13. Dispute Resolution &amp; Governing Law
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Governing Law:</strong> These Terms are governed by the laws of India.</li>
                <li><strong>Informal Resolution:</strong> Before filing any claim, you agree to attempt to resolve the dispute informally by contacting us at <a href="mailto:hello@cartgain.com" className="text-cyan-400 hover:underline">hello@cartgain.com</a>.</li>
                <li><strong>Arbitration:</strong> If informal resolution fails, disputes shall be settled by binding arbitration in accordance with the Arbitration and Conciliation Act, 1996.</li>
                <li><strong>Class Action Waiver:</strong> All disputes shall be resolved on an individual basis. You waive any right to participate in a class action or representative proceeding.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <RefreshCw className="w-6 h-6 text-cyan-400" />
                14. Changes to Terms
              </h2>
              <p className="leading-relaxed">
                We may update these Terms from time to time. We will notify you of material changes via email or through the Platform. Continued use of the Platform after changes constitutes acceptance of the updated Terms. If you do not agree with changes, you may cancel your account before the changes take effect.
              </p>
            </section>

            <section className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/40 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Mail className="w-6 h-6 text-cyan-400" />
                15. Contact Us
              </h2>
              <p className="mb-4">For questions about these Terms or any legal matters:</p>
              <div className="space-y-2">
                <p><strong>Email:</strong> <a href="mailto:hello@cartgain.com" className="text-cyan-400 hover:underline">hello@cartgain.com</a></p>
                <p><strong>Grievance Officer:</strong> <a href="mailto:hello@cartgain.com" className="text-cyan-400 hover:underline">hello@cartgain.com</a></p>
                <p><strong>Address:</strong> Street No. 3, Line Par, Shanker Garden, Bahadurgarh, Haryana - 124507</p>
              </div>
            </section>

          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="flex justify-center gap-6 text-sm text-blue-300">
            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
            <span>&bull;</span>
            <Link href="/dpa" className="hover:text-white transition">Data Processing Agreement</Link>
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
