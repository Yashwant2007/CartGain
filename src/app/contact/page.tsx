import { Mail, MapPin, Phone, Shield, MessageSquare } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Contact Us - CartGain',
  description: 'Get in touch with CartGain. Email, address, and contact information for support, sales, and legal inquiries.',
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center">
              <Mail className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Contact Us</h1>
          <p className="text-lg text-blue-200 max-w-2xl mx-auto">
            We&apos;d love to hear from you. Here&apos;s how to reach us.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">General Inquiries</h2>
            <p className="text-sm text-blue-300/70 mb-3">For support, sales, or general questions</p>
            <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline font-medium">support@cart-gain.com</a>
          </div>

          <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Legal &amp; Privacy</h2>
            <p className="text-sm text-blue-300/70 mb-3">For privacy, DPA, or legal matters</p>
            <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline font-medium">support@cart-gain.com</a>
          </div>

          <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center mb-4">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Grievance Officer</h2>
            <p className="text-sm text-blue-300/70 mb-3">For complaints or grievance redressal</p>
            <a href="mailto:support@cart-gain.com" className="text-cyan-400 hover:underline font-medium">support@cart-gain.com</a>
          </div>

          <div className="bg-slate-800/50 border border-blue-700/30 rounded-xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mb-4">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Our Address</h2>
            <p className="text-sm text-blue-300/70 mb-3">Registered business address</p>
            <p className="text-white font-medium">Street No. 3, Line Par<br />Shanker Garden, Bahadurgarh<br />Haryana - 124507</p>
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
            &copy; {new Date().getFullYear()} CartGain. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
