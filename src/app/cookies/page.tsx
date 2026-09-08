import { Cookie, Lock, Info, Mail } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Cookie Policy - CartGain',
  description: 'CartGain Cookie Policy - The cookies we use, why we use them, and how to manage them.',
}

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <Cookie className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Cookie Policy</h1>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto">
            Last updated: September 2026
          </p>
        </div>

        <div className="bg-slate-800/50 border border-blue-700/30 rounded-2xl p-8 backdrop-blur-sm">
          <div className="prose prose-invert max-w-none">
            <div className="space-y-8 text-blue-100">

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Info className="w-6 h-6 text-cyan-400" />
                  1. What are cookies?
                </h2>
                <p className="leading-relaxed">
                  Cookies are small text files stored in your browser by a website. We use cookies
                  strictly for functionality — to keep you signed in and to protect your account.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Cookie className="w-6 h-6 text-cyan-400" />
                  2. Cookies we use
                </h2>
                <p className="mb-4">
                  CartGain&apos;s dashboard uses authentication cookies provided by the Auth.js
                  (NextAuth) framework. All of them are <strong>essential</strong> and are set with
                  <code className="bg-slate-700/60 px-1.5 py-0.5 rounded text-sm"> Secure</code>,
                  <code className="bg-slate-700/60 px-1.5 py-0.5 rounded text-sm"> HttpOnly</code>, and
                  <code className="bg-slate-700/60 px-1.5 py-0.5 rounded text-sm"> SameSite</code> attributes.
                  They are set so the app keeps working when embedded as a Shopify admin inside an iframe.
                </p>
                <div className="bg-blue-900/30 border border-blue-700/40 rounded-lg p-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-blue-700/40">
                        <th className="text-left text-white font-semibold pb-3">Cookie</th>
                        <th className="text-left text-white font-semibold pb-3">Purpose</th>
                        <th className="text-left text-white font-semibold pb-3">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-700/30">
                      <tr>
                        <td className="py-3">next-auth.session-token</td>
                        <td className="py-3">Keeps you signed in to the CartGain dashboard</td>
                        <td className="py-3">Essential (session)</td>
                      </tr>
                      <tr>
                        <td className="py-3">next-auth.csrf-token</td>
                        <td className="py-3">Protects forms from cross-site request forgery</td>
                        <td className="py-3">Essential (security)</td>
                      </tr>
                      <tr>
                        <td className="py-3">next-auth.callback-url</td>
                        <td className="py-3">Redirects you back to the page you came from after signing in</td>
                        <td className="py-3">Essential (session)</td>
                      </tr>
                      <tr>
                        <td className="py-3">next-auth.pkce.code_verifier</td>
                        <td className="py-3">Secures the OAuth sign-in flow (PKCE)</td>
                        <td className="py-3">Essential (security)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Lock className="w-6 h-6 text-cyan-400" />
                  3. What we do NOT use
                </h2>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>No advertising cookies.</strong> We do not run any ad networks or retargeting.</li>
                  <li><strong>No third-party analytics trackers.</strong> We do not use Google Analytics, Meta Pixel, or similar tools that profile visitors across sites.</li>
                  <li><strong>No persistent tracking of site visitors.</strong> The customer-facing bargain page does not store cookies on shoppers&apos; devices.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Info className="w-6 h-6 text-cyan-400" />
                  4. Managing cookies
                </h2>
                <p className="leading-relaxed">
                  Because our cookies are essential to signing in and securing your account, disabling
                  them will prevent you from using the CartGain dashboard. You can still control and
                  delete cookies through your browser settings at any time. Because we use no
                  non-essential cookies, no consent banner is required — deleting these cookies simply
                  signs you out.
                </p>
              </section>

              <section className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/40 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                  <Mail className="w-6 h-6 text-cyan-400" />
                  5. Contact
                </h2>
                <p className="leading-relaxed">
                  Questions about this Cookie Policy? Email us at{' '}
                  <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline">support@cart-gain.com</a>.
                </p>
              </section>

            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="flex justify-center gap-6 text-sm text-blue-300">
            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
            <span>&bull;</span>
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