import { Shield, FileText, Database, Lock, Users, Globe, Mail, Bell, Trash2, CheckCircle, Scale } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Data Processing Agreement - CartGain',
  description: 'CartGain Data Processing Agreement (DPA) - Our commitment to data protection, GDPR compliance, and data processing terms for merchants.',
}

export default function DPAPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Data Processing Agreement</h1>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto">
            Last updated: July 1, 2026
          </p>
        </div>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-8 backdrop-blur-sm">
          <div className="space-y-8 text-blue-100">

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <FileText className="w-6 h-6 text-cyan-400" />
                1. Introduction
              </h2>
              <p className="leading-relaxed">
                This Data Processing Agreement (&ldquo;DPA&rdquo;) forms part of the Terms of Service between CartGain (&ldquo;Processor,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) and the merchant (&ldquo;Controller,&rdquo; &ldquo;you&rdquo;) using the CartGain platform. This DPA sets out the terms relating to the processing of personal data by CartGain on behalf of the merchant, to facilitate compliance with the General Data Protection Regulation (GDPR), India&apos;s Digital Personal Data Protection Act (DPDP Act, 2023), and other applicable data protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <FileText className="w-6 h-6 text-cyan-400" />
                2. Definitions
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Controller:</strong> The merchant who determines the purposes and means of processing personal data.</li>
                <li><strong>Processor:</strong> CartGain, which processes personal data on behalf of the Controller.</li>
                <li><strong>Personal Data:</strong> Any information relating to an identified or identifiable natural person (customer).</li>
                <li><strong>Processing:</strong> Any operation performed on personal data, including collection, storage, use, and transmission.</li>
                <li><strong>Sub-processor:</strong> A third party engaged by CartGain to process personal data on behalf of the Controller.</li>
                <li><strong>Data Subject:</strong> The customer whose personal data is being processed.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Database className="w-6 h-6 text-cyan-400" />
                3. Details of Data Processing
              </h2>
              <div className="bg-blue-900/30 border border-blue-700/40 rounded-lg p-6 space-y-4">
                <div>
                  <p className="font-semibold text-white">Categories of Data Subjects:</p>
                  <p>Customers of the Controller who abandon their shopping carts on the Controller&apos;s e-commerce store.</p>
                </div>
                <div>
                  <p className="font-semibold text-white">Categories of Personal Data:</p>
                  <ul className="list-disc pl-5 mt-2">
                    <li>Customer name, email address, and phone number</li>
                    <li>Shipping address and billing information</li>
                    <li>Cart contents, product details, and order values</li>
                    <li>Communication preferences and opt-in/opt-out status</li>
                    <li>Message delivery status and engagement metrics</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-white">Nature and Purpose of Processing:</p>
                  <p>Automated sending of cart recovery notifications via email, SMS, and WhatsApp to encourage customers to complete their purchases.</p>
                </div>
                <div>
                  <p className="font-semibold text-white">Duration of Processing:</p>
                  <p>For the duration of the Controller&apos;s active subscription. Upon uninstall or termination, store-scoped data is purged and the data subject&apos;s personal data is procedurally deleted or anonymized within a reasonable window (backup purging is handled by the hosting provider). [[CONFIRM RETAINED BACKUP WINDOW]]</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Lock className="w-6 h-6 text-cyan-400" />
                4. Processor Obligations
              </h2>
              <p className="mb-4">CartGain shall:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Process personal data only on documented instructions from the Controller, unless required by law to do otherwise.</li>
                <li>Ensure that persons authorized to process the data are bound by confidentiality obligations.</li>
                <li>Implement appropriate technical and organizational security measures.</li>
                <li>Not disclose personal data to third parties except as instructed or as required by law.</li>
                <li>Assist the Controller in fulfilling their obligations to respond to data subject rights requests.</li>
                <li>Notify the Controller of any personal data breaches without undue delay.</li>
                <li>Delete or return all personal data at the end of the service term, as directed by the Controller.</li>
                <li>Maintain records of all processing activities.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Users className="w-6 h-6 text-cyan-400" />
                5. Controller Obligations
              </h2>
              <p className="mb-4">The Controller shall:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Ensure they have a lawful basis for processing customer data (e.g., consent, legitimate interest).</li>
                <li>Provide clear privacy notices to customers about how their data is used.</li>
                <li>Obtain necessary consents for SMS and WhatsApp messaging as required by applicable laws.</li>
                <li>Ensure the accuracy and relevance of personal data provided to CartGain.</li>
                <li>Respond to data subject requests and notify CartGain of any such requests.</li>
                <li>Cooperate with CartGain in the event of a data breach investigation.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Globe className="w-6 h-6 text-cyan-400" />
                6. Sub-processors
              </h2>
              <p className="mb-4">The Controller authorizes CartGain to engage the following sub-processors:</p>
              <div className="bg-blue-900/30 border border-blue-700/40 rounded-lg p-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-blue-700/40">
                      <th className="text-left text-white font-semibold pb-3">Sub-processor</th>
                      <th className="text-left text-white font-semibold pb-3">Service</th>
                      <th className="text-left text-white font-semibold pb-3">Data Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-700/30">
                    <tr>
                      <td className="py-3">Supabase (PostgreSQL)</td>
                      <td className="py-3">Database hosting</td>
                      <td className="py-3">[[CONFIRM DATA REGION]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">Vercel</td>
                      <td className="py-3">Application hosting &amp; CDN</td>
                      <td className="py-3">Global (multi-region) [[CONFIRM]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">MSG91</td>
                      <td className="py-3">SMS delivery</td>
                      <td className="py-3">India [[NOT RUNTIME-CONFIGURED]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">Resend</td>
                      <td className="py-3">Email delivery</td>
                      <td className="py-3">US / EU [[NOT RUNTIME-CONFIGURED]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">Meta (WhatsApp Cloud API)</td>
                      <td className="py-3">WhatsApp message delivery</td>
                      <td className="py-3">Global [[NOT RUNTIME-CONFIGURED]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">Razorpay</td>
                      <td className="py-3">Payment processing</td>
                      <td className="py-3">India [[NOT RUNTIME-CONFIGURED]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">OpenAI</td>
                      <td className="py-3">AI-powered message generation (GPT-4o / GPT-4o-mini)</td>
                      <td className="py-3">US [[CONFIRM PROCESSING REGION]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">Groq</td>
                      <td className="py-3">AI development/fallback inference (gpt-oss-120b)</td>
                      <td className="py-3">[[CONFIRM PROCESSING REGION]]</td>
                    </tr>
                    <tr>
                      <td className="py-3">Upstash (Redis)</td>
                      <td className="py-3">Job queue &amp; caching</td>
                      <td className="py-3">[[CONFIRM DATA REGION]]</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm">
                CartGain will notify the Controller of any changes to sub-processors and the Controller may object within 14 days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Lock className="w-6 h-6 text-cyan-400" />
                7. Security Measures
              </h2>
              <p className="mb-4">CartGain implements the following technical and organizational security measures:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Encryption</p>
                  <p className="text-sm">Data encrypted in transit via TLS. API keys and sensitive tokens stored encrypted in the database (AES-256-GCM). Customer passwords hashed with bcrypt (cost 12).</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Access Control</p>
                  <p className="text-sm">Principle of least privilege, OAuth-based access to store data, access tokens stored encrypted, and audit logging of sensitive data access.</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Monitoring</p>
                  <p className="text-sm">Application logging, Shopify webhook signature verification, and audit logging for access to sensitive personal data.</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Backups</p>
                  <p className="text-sm">Backups are managed by the hosting provider; the provider retention window applies to stored backups.</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Employee Access</p>
                  <p className="text-sm">Personnel with access to personal data are bound by confidentiality obligations. [DETAIL PER INTERNAL POLICY]</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Incident Response</p>
                  <p className="text-sm">Documented incident response plan with a 72-hour merchant notification commitment (see CartGain Incident Response Policy).</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Bell className="w-6 h-6 text-cyan-400" />
                8. Data Breach Notification
              </h2>
              <p className="leading-relaxed">
                In the event of a personal data breach, CartGain will:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Notify the Controller within 72 hours of becoming aware of a personal data breach (as committed in CartGain&apos;s Incident Response Policy).</li>
                <li>Provide details of the nature, scope, and potential impact of the breach.</li>
                <li>Identify affected categories of data and approximate number of data subjects.</li>
                <li>Outline measures taken to address the breach and prevent recurrence.</li>
                <li>Cooperate with the Controller in notifying regulatory authorities and data subjects as required by law.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Users className="w-6 h-6 text-cyan-400" />
                9. Data Subject Rights
              </h2>
              <p className="mb-4">CartGain shall assist the Controller in responding to data subject requests, including:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Right of Access:</strong> Providing a copy of personal data held about a data subject.</li>
                <li><strong>Right to Rectification:</strong> Correcting inaccurate or incomplete data.</li>
                <li><strong>Right to Erasure:</strong> Deleting personal data upon request (&ldquo;right to be forgotten&rdquo;).</li>
                <li><strong>Right to Restriction:</strong> Limiting the processing of personal data.</li>
                <li><strong>Right to Data Portability:</strong> Exporting data in a structured, machine-readable format.</li>
                <li><strong>Right to Object:</strong> Objecting to certain types of processing, including direct marketing.</li>
              </ul>
              <p className="mt-4">
                Controllers can exercise these rights by contacting <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a>. We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Trash2 className="w-6 h-6 text-cyan-400" />
                10. Data Retention &amp; Deletion
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Personal data is processed for the duration of the Controller&apos;s active subscription.</li>
                <li>Upon uninstall or account deletion, store-scoped personal data is purged from the application database (see CartGain&apos;s data-deletion procedures).</li>
                <li>Controllers may request earlier deletion by contacting support.</li>
                <li>Copies that may remain in hosting-provider backups are purged per the provider&apos;s backup retention window. [[CONFIRM RETAINED BACKUP WINDOW]]</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-cyan-400" />
                11. Audit &amp; Compliance
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>CartGain maintains records of all processing activities as required by Article 30 of the GDPR.</li>
                <li>Upon reasonable notice (minimum 30 days), CartGain will provide access to relevant records for audit purposes.</li>
                <li>Audits shall be conducted in a manner that does not disrupt CartGain&apos;s operations.</li>
                <li>Audit reports and findings shall be treated as confidential.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Scale className="w-6 h-6 text-cyan-400" />
                12. Governing Law
              </h2>
              <p className="leading-relaxed">
                This DPA is governed by the laws of India. Any disputes arising from this DPA shall be resolved in accordance with the dispute resolution provisions in the Terms of Service. In the event of any conflict between this DPA and the Terms of Service, this DPA shall prevail with respect to data processing matters.
              </p>
            </section>

            <section className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/40 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Mail className="w-6 h-6 text-cyan-400" />
                13. Contact Information
              </h2>
              <div className="space-y-2">
                <p><strong>Data Protection / Privacy:</strong> <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
                <p><strong>Legal / DPA Inquiries:</strong> <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
                <p><strong>Grievance Officer:</strong> <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a></p>
                <p><strong>Address:</strong> Street No. 3, Line Par, Shanker Garden, Bahadurgarh, Haryana - 124507</p>
              </div>
            </section>

          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="flex justify-center gap-6 text-sm text-blue-300">
            <Link href="/terms" className="hover:text-white transition">Terms of Service</Link>
            <span>&bull;</span>
            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
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
