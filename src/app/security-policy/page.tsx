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
              <li>Automatic data retention — cart PII anonymized after 90 days; logs after 180 days.</li>
              <li>Rate limiting on authentication and public endpoints.</li>
              <li>Secrets stored only in environment variables; never in the repository.</li>
              <li>Bots blocked at the edge (Bot Fight Mode, AI-bot blocking).</li>
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
          </section>
          <section>
            <h2 className="text-xl font-semibold text-cyan-300 mb-2">Data breach handling</h2>
            <p>
              In the event of a breach we will: contain and fix immediately, rotate affected secrets,
              notify affected merchants within 72 hours, and notify authorities where legally required.
              Full details in our internal incident-response policy.
            </p>
          </section>
          <p className="pt-4 text-slate-400">
            Questions? <Link href="/privacy" className="text-cyan-400 underline">Privacy Policy</Link> ·{' '}
            <Link href="/dpa" className="text-cyan-400 underline">Data Processing Agreement</Link> ·{' '}
            <Link href="/terms" className="text-cyan-400 underline">Terms of Service</Link>
          </p>
          <p className="text-xs text-slate-500">Last updated: 2026-08-03</p>
        </div>
      </div>
    </div>
  )
}
