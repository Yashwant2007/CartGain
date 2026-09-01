import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Security Policy | CartGain',
  description: 'CartGain security policy — how we protect merchant and customer data.',
}

export default function SecurityPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">Security Policy</h1>
        <div className="prose prose-invert space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Reporting a vulnerability</h2>
            <p>
              We take security seriously. If you find a vulnerability in CartGain, please report it
              privately to{' '}
              <a href="mailto:security@cart-gain.com" className="text-cyan-400 underline">security@cart-gain.com</a>.
              Please include: the affected endpoint, steps to reproduce, and impact. We commit to a
              prompt response (within 72 hours) and will never take legal action against good-faith
              researchers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Our safeguards</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>All traffic encrypted in transit (TLS) — HTTPS only, via Cloudflare + Vercel.</li>
              <li>Customer data encrypted at rest (Supabase managed Postgres; secrets AES-256-GCM).</li>
              <li>Row-level security (RLS) enabled on all database tables.</li>
              <li>Strict access logging with PII redaction for every protected-data access.</li>
              <li>Automatic data retention — cart PII anonymized after 90 days; bargain sessions deleted after 90 days; logs deleted after 180 days.</li>
              <li>Rate limiting on authentication and public endpoints.</li>
              <li>Secrets stored only in environment variables; never in the repository.</li>
              <li>Bots blocked at the edge (Bot Fight Mode, AI-bot blocking).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Protected customer data</h2>
            <p>
              We process only the minimum personal data needed for the app to function: the
              contact details and line-item information of customers who abandon a checkout, and
              the optional email/phone a shopper provides to start a price negotiation. All of it
              is used solely to recover carts and run negotiations — never sold, never shared for
              advertising, and never used to contact a customer who has opted out.
            </p>
            <p>
              We honor every customer consent and opt-out decision: a “Skip AI, buy at full price”
              option ends a negotiation immediately, and merchants can suppress individual
              customers or reply-to-STOP for messaging channels. Opt-out records are kept
              indefinitely as consent records, while message and cart data are automatically
              anonymized or deleted on the retention schedule in our{' '}
              <Link href="/privacy" className="text-cyan-400 underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Backups and environments</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Backups:</strong> Managed database backups at Supabase are encrypted and retained for a short, defined window so any copy of personal data is subject to the same protection as production data.</li>
              <li><strong>Environment separation:</strong> Test and production are strictly separate — production credentials are never available in test/development environments, and production data is never copied into development. Development builds use fixture data only.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Data loss prevention</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Protected customer data is read programmatically only through audited, purpose-scoped service paths — never through ad-hoc queries.</li>
              <li>Every access is logged with PII redaction (see “Access logging” below), creating a deterrent against and an audit trail for any exfiltration attempt.</li>
              <li>Database credentials are held only in production environment variables, never in the repository or client code.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Staff access and passwords</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Least privilege:</strong> CartGain team members are granted access to customer data only when their role requires it, and only through the audited service paths above.</li>
              <li><strong>Strong passwords:</strong> All staff accounts require passwords of at least 12 characters mixing letters, numbers, and symbols, in addition to multi-factor authentication.</li>
              <li>Privileges are reviewed and revoked when an individual no longer needs them.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Access logging</h2>
            <p>
              Every read or write of protected customer data writes an immutable audit entry
              recording the actor, action, resource, purpose, and timestamp. Sensitive values are
              redacted before the entry is stored — emails are masked, phones truncated to the
              last four digits — so the log provides a full audit trail without duplicating the
              data itself. Logs are retained for 180 days and reviewed regularly by the team to
              confirm the controls are working as intended.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Incident response</h2>
            <p>
              We maintain an internal incident-response policy (IRP) with a severity scale (P1–P4),
              defined roles, escalation paths, and evidence-collection steps. In the event of a
              security incident or data breach we will:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Contain and remediate the cause immediately, preserving evidence as we do so.</li>
              <li>Rotate all potentially exposed secrets.</li>
              <li>Notify affected merchants within 72 hours of confirmed impact.</li>
              <li>Notify regulators where legally required (e.g., GDPR / DPDP Act 2023).</li>
              <li>Document the incident, root cause, and corrective actions internally.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Sub-processors</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Vercel — hosting</li>
              <li>Supabase — database</li>
              <li>Cloudflare — CDN/DNS/security</li>
              <li>Resend / SMTP relay — transactional email</li>
              <li>OpenAI — AI negotiation model</li>
            </ul>
            <p className="text-xs text-slate-400 mt-3">
              Each sub-processor is covered by an agreement, and data processed by them (e.g.
              messages sent to the negotiation AI) is purpose-limited and minimized. See the{' '}
              <Link href="/dpa" className="text-cyan-400 underline">Data Processing Agreement</Link> for details.
            </p>
          </section>

          <p className="pt-4 text-slate-400">
            Questions? <Link href="/privacy" className="text-cyan-400 underline">Privacy Policy</Link> ·{' '}
            <Link href="/dpa" className="text-cyan-400 underline">Data Processing Agreement</Link> ·{' '}
            <Link href="/terms" className="text-cyan-400 underline">Terms of Service</Link>
          </p>
          <p className="text-xs text-slate-500">Last updated: 2026-09-01</p>
        </div>
      </div>
    </div>
  )
}