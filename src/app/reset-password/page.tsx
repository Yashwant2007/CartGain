import { Suspense } from 'react'
import type { Metadata } from 'next'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Reset Your Password | CartGain',
  description: 'Set a new password for your CartGain account.',
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
