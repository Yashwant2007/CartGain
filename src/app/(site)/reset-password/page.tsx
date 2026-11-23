import { Suspense } from 'react'
import ResetPasswordForm from './ResetPasswordForm'
import { createNoIndexMetadata } from '@/lib/seo'

export const metadata = createNoIndexMetadata({
  title: 'Reset Password | CartGain',
  description: 'Set a new password for your CartGain merchant account.',
  path: '/reset-password',
})

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
